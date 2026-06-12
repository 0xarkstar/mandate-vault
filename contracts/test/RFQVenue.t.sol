// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {RFQVenue} from "../src/RFQVenue.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {ISwapVenue} from "../src/interfaces/ISwapVenue.sol";

contract RFQVenueTest is Test {
    MockERC20 mUSD;
    MockERC20 mMETH;
    MockERC20 mMNT;
    MockOracle oracle;
    RFQVenue venue;

    address mm;
    uint256 mmKey;
    address mm2;
    uint256 mm2Key;
    address taker = makeAddr("taker");
    address agent = makeAddr("agent");

    uint256 constant USD_PRICE = 1e18;
    uint256 constant METH_PRICE = 1650e18;

    function setUp() public {
        (mm, mmKey) = makeAddrAndKey("mm");
        (mm2, mm2Key) = makeAddrAndKey("mm2");

        mUSD = new MockERC20("Mock Mantle USD", "mUSD");
        mMETH = new MockERC20("Mock mETH", "mMETH");
        mMNT = new MockERC20("Mock MNT", "mMNT");

        oracle = new MockOracle();
        oracle.setPrice(address(mUSD), USD_PRICE);
        oracle.setPrice(address(mMETH), METH_PRICE);
        oracle.setPrice(address(mMNT), 6e17);

        venue = new RFQVenue(IPriceOracle(address(oracle)));

        // fallback reserves
        mUSD.mint(address(venue), 1_000_000e18);
        mMETH.mint(address(venue), 1_000e18);

        // MM inventory + approvals (MMs settle from their own balance)
        mUSD.mint(mm, 1_000_000e18);
        mMETH.mint(mm, 1_000e18);
        vm.startPrank(mm);
        mUSD.approve(address(venue), type(uint256).max);
        mMETH.approve(address(venue), type(uint256).max);
        vm.stopPrank();

        // taker inventory + approvals
        mUSD.mint(taker, 1_000_000e18);
        mMETH.mint(taker, 1_000e18);
        vm.startPrank(taker);
        mUSD.approve(address(venue), type(uint256).max);
        mMETH.approve(address(venue), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------- helpers

    function _quote(uint256 amountIn, uint256 amountOut, uint256 nonce) internal view returns (RFQVenue.Quote memory) {
        return RFQVenue.Quote({
            assetIn: address(mUSD),
            assetOut: address(mMETH),
            amountIn: amountIn,
            amountOut: amountOut,
            expiry: block.timestamp + 60,
            mm: mm,
            nonce: nonce
        });
    }

    function _sign(RFQVenue.Quote memory q, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, this.hashQuoteExternal(q));
        return abi.encodePacked(r, s, v);
    }

    /// calldata shim so the test can call venue.hashQuote with a memory struct
    function hashQuoteExternal(RFQVenue.Quote calldata q) external view returns (bytes32) {
        return venue.hashQuote(q);
    }

    uint256 constant MID_OUT_PER_1650_USD = 1e18; // 1650 mUSD = 1 mMETH at mid

    // ----------------------------------------------------------- post + swap

    function test_PostQuoteAndSwapFillsAtQuotedPrice() public {
        // quote 1650 mUSD → 1.001 mMETH (better than 1.0 mid)
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        bytes memory sig = _sign(q, mmKey);
        venue.postQuote(q, sig);

        uint256 mmUsdBefore = mUSD.balanceOf(mm);
        vm.prank(taker);
        uint256 out = venue.swap(address(mUSD), address(mMETH), 1650e18);

        assertEq(out, 1.001e18); // filled at the quoted price, not mid
        assertEq(mUSD.balanceOf(mm), mmUsdBefore + 1650e18); // MM received assetIn
        // quote consumed
        assertEq(venue.activeQuote(address(mUSD), address(mMETH)).amountIn, 0);
    }

    function test_SwapPartialFillProRata() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        venue.postQuote(q, _sign(q, mmKey));

        vm.prank(taker);
        uint256 out = venue.swap(address(mUSD), address(mMETH), 825e18); // half size
        assertEq(out, 0.5005e18); // pro-rata half of 1.001
    }

    function test_SwapEmitsTcaImprovement() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        venue.postQuote(q, _sign(q, mmKey));

        // mid for 1650 mUSD = 1.0 mMETH → improvement = +10 bps (1.001 vs 1.000)
        vm.expectEmit(true, true, true, true);
        emit RFQVenue.QuoteFilled(mm, address(mUSD), address(mMETH), 1650e18, 1.001e18, 1e18, 10);
        vm.prank(taker);
        venue.swap(address(mUSD), address(mMETH), 1650e18);
    }

    function test_SwapFallsBackToOracleMidWhenNoQuote() public {
        vm.expectEmit(true, true, false, true);
        emit RFQVenue.FallbackSwap(address(mUSD), address(mMETH), 1650e18, 1e18);
        vm.prank(taker);
        uint256 out = venue.swap(address(mUSD), address(mMETH), 1650e18);
        assertEq(out, 1e18); // oracle mid
    }

    function test_SwapFallsBackWhenQuoteExpired() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        venue.postQuote(q, _sign(q, mmKey));
        vm.warp(block.timestamp + 120); // expire the posted quote

        vm.prank(taker);
        uint256 out = venue.swap(address(mUSD), address(mMETH), 1650e18);
        assertEq(out, 1e18); // mid, not the (stale) quoted 1.001
    }

    function test_SwapFallsBackWhenSizeExceedsQuote() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        venue.postQuote(q, _sign(q, mmKey));

        vm.prank(taker);
        uint256 out = venue.swap(address(mUSD), address(mMETH), 3300e18); // 2x the quote
        assertEq(out, 2e18); // fallback mid fill
    }

    function test_SwapZeroAmountReverts() public {
        vm.expectRevert(RFQVenue.ZeroAmount.selector);
        venue.swap(address(mUSD), address(mMETH), 0);
    }

    // ------------------------------------------------------------ validation

    function test_PostQuoteRevert_Expired() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        q.expiry = block.timestamp - 1;
        bytes memory sig = _sign(q, mmKey);
        vm.expectRevert(abi.encodeWithSelector(RFQVenue.QuoteExpired.selector, q.expiry));
        venue.postQuote(q, sig);
    }

    function test_PostQuoteRevert_NonceReplay() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 7);
        bytes memory sig = _sign(q, mmKey);
        venue.postQuote(q, sig);
        vm.expectRevert(abi.encodeWithSelector(RFQVenue.NonceAlreadyUsed.selector, mm, 7));
        venue.postQuote(q, sig);
    }

    function test_PostQuoteRevert_WrongSigner() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        bytes memory sig = _sign(q, mm2Key); // mm2 signs a quote claiming to be mm
        vm.expectRevert(RFQVenue.BadSignature.selector);
        venue.postQuote(q, sig);
    }

    function test_PostQuoteRevert_TamperedAmount() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 1);
        bytes memory sig = _sign(q, mmKey);
        q.amountOut = 2e18; // tamper after signing
        vm.expectRevert(RFQVenue.BadSignature.selector);
        venue.postQuote(q, sig);
    }

    // ------------------------------------------------------ fillSignedQuote

    function test_FillSignedQuoteDirect() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 42);
        bytes memory sig = _sign(q, mmKey);

        uint256 takerMethBefore = mMETH.balanceOf(taker);
        vm.prank(taker);
        uint256 out = venue.fillSignedQuote(q, sig);
        assertEq(out, 1.001e18);
        assertEq(mMETH.balanceOf(taker), takerMethBefore + 1.001e18);
        assertTrue(venue.nonceUsed(mm, 42));
    }

    function test_FillSignedQuoteRevert_Replay() public {
        RFQVenue.Quote memory q = _quote(1650e18, 1.001e18, 42);
        bytes memory sig = _sign(q, mmKey);
        vm.prank(taker);
        venue.fillSignedQuote(q, sig);
        vm.prank(taker);
        vm.expectRevert(abi.encodeWithSelector(RFQVenue.NonceAlreadyUsed.selector, mm, 42));
        venue.fillSignedQuote(q, sig);
    }

    // ----------------------------------------------- vault integration (E2E)

    /// The headline path: agent posts the best MM quote, the vault's rebalance
    /// consumes it through swap() — fill lands at the quoted price and the MM
    /// is the counterparty, not a public pool.
    function test_VaultRebalanceRoutesThroughPostedQuote() public {
        VaultFactory factory = new VaultFactory(
            IPriceOracle(address(oracle)), ISwapVenue(address(venue)), address(mUSD), address(mMETH), address(mMNT)
        );
        MandateVault vault = MandateVault(factory.createVault(1, agent)); // balanced

        address depositor = makeAddr("depositor");
        mUSD.mint(depositor, 10_000e18);
        vm.startPrank(depositor);
        mUSD.approve(address(vault), type(uint256).max);
        vault.deposit(10_000e18);
        vm.stopPrank();

        // 30/70 target → vault buys mMETH with 7000 mUSD. MM quotes 5 bps
        // better than mid for that leg.
        uint256 legIn = 7000e18;
        uint256 midOut = (legIn * USD_PRICE) / METH_PRICE;
        uint256 quotedOut = (midOut * 10_005) / 10_000;
        RFQVenue.Quote memory q = RFQVenue.Quote({
            assetIn: address(mUSD),
            assetOut: address(mMETH),
            amountIn: legIn,
            amountOut: quotedOut,
            expiry: block.timestamp + 60,
            mm: mm,
            nonce: 1
        });
        venue.postQuote(q, _sign(q, mmKey));

        uint16[] memory target = new uint16[](2);
        target[0] = 3000;
        target[1] = 7000;
        vm.prank(agent);
        vault.rebalance(target, '{"s":1}', '{"r":1}', "rfq demo");

        // the vault holds the quoted (improved) amount, not the mid amount
        assertEq(mMETH.balanceOf(address(vault)), quotedOut);
        // quote consumed; MM holds the vault's mUSD leg
        assertEq(venue.activeQuote(address(mUSD), address(mMETH)).amountIn, 0);
        assertEq(mUSD.balanceOf(mm), 1_000_000e18 + legIn);
    }
}
