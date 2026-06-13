// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {MockVenue} from "../src/MockVenue.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {ISwapVenue} from "../src/interfaces/ISwapVenue.sol";

contract MandateVaultTest is Test {
    MockERC20 mUSD;
    MockERC20 mMETH;
    MockERC20 mMNT;
    MockOracle oracle;
    MockVenue venue;
    VaultFactory factory;
    MandateVault vault; // balanced template (mUSD 30-100%, mMETH 0-70%, DD 10%)

    address agent = makeAddr("agent");
    address depositor = makeAddr("depositor");
    address rando = makeAddr("rando");
    address platform; // factory deployer = feeRecipient

    uint256 constant USD_PRICE = 1e18;
    uint256 constant METH_PRICE = 1650e18;
    uint256 constant MNT_PRICE = 6e17;
    uint256 constant DEPOSIT = 10_000e18; // $10k mUSD

    function setUp() public {
        platform = address(this);

        mUSD = new MockERC20("Mock Mantle USD", "mUSD");
        mMETH = new MockERC20("Mock mETH", "mMETH");
        mMNT = new MockERC20("Mock MNT", "mMNT");

        oracle = new MockOracle();
        oracle.setPrice(address(mUSD), USD_PRICE);
        oracle.setPrice(address(mMETH), METH_PRICE);
        oracle.setPrice(address(mMNT), MNT_PRICE);

        venue = new MockVenue(IPriceOracle(address(oracle)));
        // seed venue reserves
        mUSD.mint(address(venue), 1_000_000_000e18);
        mMETH.mint(address(venue), 1_000_000e18);
        mMNT.mint(address(venue), 1_000_000_000e18);

        factory = new VaultFactory(
            IPriceOracle(address(oracle)), ISwapVenue(address(venue)), address(mUSD), address(mMETH), address(mMNT)
        );
        vault = MandateVault(factory.createVault(1, agent));

        mUSD.mint(depositor, DEPOSIT);
        vm.startPrank(depositor);
        mUSD.approve(address(vault), type(uint256).max);
        vault.deposit(DEPOSIT);
        vm.stopPrank();
    }

    // ------------------------------------------------------------- helpers

    function _rebalance(uint16 usdBps, uint16 methBps) internal {
        uint16[] memory target = new uint16[](2);
        target[0] = usdBps;
        target[1] = methBps;
        vm.prank(agent);
        vault.rebalance(target, '{"snap":1}', '{"raw":1}', "test rationale");
    }

    /// Balanced-style custom vault with an explicit trip mode.
    function _createCustomVault(MandateVault.TripMode mode) internal returns (address) {
        address[] memory assets = new address[](2);
        assets[0] = address(mUSD);
        assets[1] = address(mMETH);
        uint16[] memory minBps = new uint16[](2);
        minBps[0] = 3000;
        uint16[] memory maxBps = new uint16[](2);
        maxBps[0] = 10_000;
        maxBps[1] = 7000;
        return factory.createCustomVault(
            MandateVault.Mandate({
                assets: assets,
                minBps: minBps,
                maxBps: maxBps,
                maxDrawdownBps: 1000,
                rebalanceCooldown: 1 hours,
                mgmtFeeBpsPerYear: 100,
                perfFeeBps: 1000,
                hurdleBpsPerYear: 450,
                agent: agent,
                tripMode: mode
            })
        );
    }

    // ------------------------------------------------------ deposit/withdraw

    function test_DepositMintsShares() public view {
        // $1 share price, $1 mUSD; 1000 dead shares carved from the first mint
        assertEq(vault.sharesOf(depositor), DEPOSIT - 1000);
        assertEq(vault.sharesOf(address(0xdEaD)), 1000);
        assertEq(vault.totalShares(), DEPOSIT);
        assertEq(vault.sharePrice(), 1e18);
        assertEq(vault.totalValue(), 10_000e18);
    }

    function test_FirstDepositBelowFloorReverts() public {
        address fresh = factory.createVault(1, agent);
        mUSD.mint(rando, 1e18);
        vm.startPrank(rando);
        mUSD.approve(fresh, type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.FirstDepositTooSmall.selector, 1e17, 1e18));
        MandateVault(fresh).deposit(1e17); // $0.10 < $1 floor
        vm.stopPrank();
    }

    function test_DepositZeroReverts() public {
        vm.prank(depositor);
        vm.expectRevert(MandateVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_WithdrawRoundtrip() public {
        uint256 depositorShares = vault.sharesOf(depositor);
        vm.prank(depositor);
        uint256 out = vault.withdraw(depositorShares);
        assertApproxEqAbs(out, DEPOSIT, 1e6);
        assertEq(vault.totalShares(), 1000); // dead shares remain locked
    }

    function test_WithdrawSellsSleevesToCover() public {
        _rebalance(3000, 7000); // 70% in mMETH
        uint256 depositorShares = vault.sharesOf(depositor);
        vm.prank(depositor);
        uint256 out = vault.withdraw(depositorShares); // must liquidate mMETH sleeve
        assertApproxEqRel(out, DEPOSIT, 0.001e18); // within 0.1% (rounding dust)
    }

    function test_WithdrawMoreThanOwnedReverts() public {
        vm.prank(depositor);
        vm.expectRevert(MandateVault.InsufficientShares.selector);
        vault.withdraw(DEPOSIT + 1);
    }

    // -------------------------------------------------------------- rebalance

    function test_RebalanceWithinBounds() public {
        _rebalance(4000, 6000);
        uint16[] memory alloc = vault.currentAllocationBps();
        assertApproxEqAbs(alloc[0], 4000, 5);
        assertApproxEqAbs(alloc[1], 6000, 5);
        assertEq(vault.epoch(), 1);
    }

    function test_RebalanceEmitsDecisionEvents() public {
        uint16[] memory target = new uint16[](2);
        target[0] = 5000;
        target[1] = 5000;

        vm.expectEmit(true, false, false, true);
        emit MandateVault.DecisionLogged(
            1, keccak256(bytes('{"s":1}')), keccak256(bytes('{"r":1}')), target, keccak256(bytes("because"))
        );
        vm.expectEmit(true, false, false, true);
        emit MandateVault.DecisionData(1, '{"s":1}', '{"r":1}', "because");

        vm.prank(agent);
        vault.rebalance(target, '{"s":1}', '{"r":1}', "because");
    }

    function test_RebalanceRevert_MandateViolation() public {
        uint16[] memory target = new uint16[](2);
        target[0] = 2000; // below mUSD min 3000
        target[1] = 8000; // above mMETH max 7000
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.MandateViolation.selector, 0, 2000, 3000, 10_000));
        vault.rebalance(target, "", "", "");
    }

    function test_RebalanceRevert_NotAgent() public {
        uint16[] memory target = new uint16[](2);
        target[0] = 5000;
        target[1] = 5000;
        vm.prank(rando);
        vm.expectRevert(MandateVault.NotAgent.selector);
        vault.rebalance(target, "", "", "");
    }

    function test_RebalanceRevert_BadSum() public {
        uint16[] memory target = new uint16[](2);
        target[0] = 5000;
        target[1] = 4000; // sums to 9000
        vm.prank(agent);
        vm.expectRevert(MandateVault.AllocationSumNot10000.selector);
        vault.rebalance(target, "", "", "");
    }

    function test_RebalanceRevert_Cooldown() public {
        _rebalance(5000, 5000);
        uint16[] memory target = new uint16[](2);
        target[0] = 4000;
        target[1] = 6000;
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(MandateVault.CooldownActive.selector, uint64(block.timestamp) + 1 hours)
        );
        vault.rebalance(target, "", "", "");

        vm.warp(block.timestamp + 1 hours + 1);
        _rebalance(4000, 6000); // works after cooldown
        assertEq(vault.epoch(), 2);
    }

    // --------------------------------------------------------------- drawdown

    /// Templates default to FREEZE: trip suspends the agent and HOLDS positions
    /// — no forced dump into the crash.
    function test_DrawdownTripFreezeHoldsAndSuspends() public {
        _rebalance(3000, 7000);
        uint256 methBalBefore = mMETH.balanceOf(address(vault));
        // crash mMETH 40% → portfolio −28% > 10% DD
        oracle.setPrice(address(mMETH), (METH_PRICE * 60) / 100);
        assertTrue(vault.drawdownBreached());

        vm.prank(rando); // keeper-style: anyone can trip
        vault.tripCheck();
        assertTrue(vault.tripped());

        // positions HELD — the mMETH sleeve was not sold
        assertEq(mMETH.balanceOf(address(vault)), methBalBefore);

        // agent is suspended
        vm.warp(block.timestamp + 2 hours);
        uint16[] memory target = new uint16[](2);
        target[0] = 5000;
        target[1] = 5000;
        vm.prank(agent);
        vm.expectRevert(MandateVault.VaultTripped.selector);
        vault.rebalance(target, "", "", "");
    }

    /// DERISK mode (opt-in via custom mandate): trip sells every non-safe
    /// sleeve into mUSD via the venue, then suspends.
    function test_DrawdownTripDeriskSellsToSafe() public {
        MandateVault dv = MandateVault(_createCustomVault(MandateVault.TripMode.DERISK));
        mUSD.mint(depositor, DEPOSIT);
        vm.startPrank(depositor);
        mUSD.approve(address(dv), type(uint256).max);
        dv.deposit(DEPOSIT);
        vm.stopPrank();

        uint16[] memory target = new uint16[](2);
        target[0] = 3000;
        target[1] = 7000;
        vm.prank(agent);
        dv.rebalance(target, "", "", "");

        oracle.setPrice(address(mMETH), (METH_PRICE * 60) / 100);
        assertTrue(dv.drawdownBreached());

        vm.prank(rando);
        dv.tripCheck();
        assertTrue(dv.tripped());

        uint16[] memory alloc = dv.currentAllocationBps();
        assertEq(alloc[1], 0); // fully de-risked to mUSD
        assertApproxEqAbs(alloc[0], 10_000, 5);
        // restore the oracle for sibling assertions
        oracle.setPrice(address(mMETH), METH_PRICE);
    }

    function test_RebalanceTripsInsteadOfExecuting() public {
        _rebalance(3000, 7000);
        oracle.setPrice(address(mMETH), (METH_PRICE * 60) / 100);

        vm.warp(block.timestamp + 2 hours);
        uint16[] memory target = new uint16[](2);
        target[0] = 3000;
        target[1] = 7000;
        vm.prank(agent);
        vault.rebalance(target, "", "", ""); // trips instead of executing

        assertTrue(vault.tripped());
        assertEq(vault.epoch(), 1); // crash decision was NOT logged as epoch 2
    }

    function test_ResumeAfterTrip() public {
        test_DrawdownTripFreezeHoldsAndSuspends();

        vault.resume(); // owner = this test contract (factory.createVault caller)
        assertFalse(vault.tripped());
        assertEq(vault.hwmSharePrice(), vault.sharePrice()); // HWM reset

        vm.warp(block.timestamp + 2 hours);
        _rebalance(5000, 5000);
        assertEq(vault.epoch(), 2);
    }

    function test_TripCheckNoopWhenHealthy() public {
        vm.prank(rando);
        vault.tripCheck();
        assertFalse(vault.tripped());
    }

    // ------------------------------------------------------------ kill switch

    function test_KillLocksAgentButAllowsWithdraw() public {
        _rebalance(5000, 5000);
        vault.kill();

        vm.warp(block.timestamp + 2 hours);
        uint16[] memory target = new uint16[](2);
        target[0] = 5000;
        target[1] = 5000;
        vm.prank(agent);
        vm.expectRevert(MandateVault.VaultKilled.selector);
        vault.rebalance(target, "", "", "");

        uint256 depositorShares = vault.sharesOf(depositor);
        vm.prank(depositor);
        uint256 out = vault.withdraw(depositorShares);
        assertGt(out, 0);
    }

    function test_KillOnlyOwner() public {
        vm.prank(rando);
        vm.expectRevert(MandateVault.NotOwner.selector);
        vault.kill();
    }

    // ------------------------------------------------------------------- fees

    function test_MgmtFeeAccruesAsDilution() public {
        vm.warp(block.timestamp + 365 days);
        _rebalance(5000, 5000);
        // 1%/year mgmt fee → feeRecipient holds ~1% of pre-fee shares
        assertApproxEqRel(vault.sharesOf(platform), DEPOSIT / 100, 0.01e18);
    }

    function test_PerfFeeOnGainsAboveHWM() public {
        _rebalance(3000, 7000);
        oracle.setPrice(address(mMETH), (METH_PRICE * 130) / 100); // +30% → portfolio +21%

        vm.warp(block.timestamp + 2 hours);
        _rebalance(3000, 7000);

        uint256 feeShares = vault.sharesOf(platform);
        assertGt(feeShares, 0);
        // ~10% of ~21% gain ≈ 2.1% of value → fee shares ≈ 2.1%/1.21 of supply; just sanity-band it
        assertLt(feeShares, vault.totalShares() / 20);
        assertGt(vault.hwmSharePrice(), 1e18); // HWM ratcheted
    }

    function test_NoPerfFeeWithoutGain() public {
        vm.warp(block.timestamp + 2 hours);
        _rebalance(5000, 5000);
        // only mgmt dust over 2h; perf must be zero since sharePrice ≈ 1.0 = HWM
        uint256 mgmtOnly = (DEPOSIT * 100 * 2 hours) / (10_000 * 365 days);
        assertApproxEqAbs(vault.sharesOf(platform), mgmtOnly, mgmtOnly / 10 + 1);
    }

    // ----------------------------------------------- mandate violation (idx>0)

    /// Existing coverage only trips index 0. With a 3-asset Aggressive vault we
    /// can keep idx0 (mUSD) and idx1 (mMETH) in-range while idx2 (mMNT, max
    /// 2000) is over its bound — proving the per-asset check reports the correct
    /// non-zero index.
    function test_RebalanceRevert_MandateViolation_NonZeroIndex() public {
        MandateVault aggressive = MandateVault(factory.createVault(2, agent));
        mUSD.mint(depositor, DEPOSIT);
        vm.startPrank(depositor);
        mUSD.approve(address(aggressive), type(uint256).max);
        aggressive.deposit(DEPOSIT);
        vm.stopPrank();

        // idx0=2000 (>=min 2000, ok), idx1=5000 (<=max 8000, ok),
        // idx2=3000 (> mMNT max 2000) → violation at index 2. Sum = 10000.
        uint16[] memory target = new uint16[](3);
        target[0] = 2000;
        target[1] = 5000;
        target[2] = 3000;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.MandateViolation.selector, 2, 3000, 0, 2000));
        aggressive.rebalance(target, "", "", "");
    }

    // ------------------------------------- withdrawals never blocked invariant

    /// The 'withdrawals never blocked' invariant after a kill: a killed vault
    /// locks the agent (covered elsewhere) but a depositor must still be able to
    /// redeem their full share for the safe asset.
    function test_WithdrawWorksWhenKilled() public {
        vault.kill();
        uint256 depositorShares = vault.sharesOf(depositor);
        vm.prank(depositor);
        uint256 out = vault.withdraw(depositorShares);
        assertApproxEqAbs(out, DEPOSIT, 1e6); // got the safe asset back
        assertEq(vault.sharesOf(depositor), 0);
    }

    /// Same invariant after a drawdown TRIP (FREEZE mode): the agent is
    /// suspended but withdrawals still settle.
    function test_WithdrawWorksWhenTripped() public {
        _rebalance(3000, 7000);
        // crash mMETH 40% → portfolio −28% > 10% DD floor
        oracle.setPrice(address(mMETH), (METH_PRICE * 60) / 100);
        vm.prank(rando);
        vault.tripCheck();
        assertTrue(vault.tripped());

        uint256 depositorShares = vault.sharesOf(depositor);
        vm.prank(depositor);
        uint256 out = vault.withdraw(depositorShares);
        assertGt(out, 0); // withdrawal not blocked by the trip
        assertEq(vault.sharesOf(depositor), 0);
        // restore oracle for sibling assertions
        oracle.setPrice(address(mMETH), METH_PRICE);
    }

    // ------------------------------------------------------- perf-fee gates

    /// Builds a 2-asset vault with mgmt fee = 0 so any fee shares minted are
    /// PURELY the performance fee — isolates the hurdle/HWM logic from mgmt
    /// dilution. perf 10%, hurdle 450 bps/yr.
    function _perfOnlyVault() internal returns (MandateVault) {
        address[] memory assets = new address[](2);
        assets[0] = address(mUSD);
        assets[1] = address(mMETH);
        uint16[] memory minBps = new uint16[](2);
        minBps[0] = 3000;
        uint16[] memory maxBps = new uint16[](2);
        maxBps[0] = 10_000;
        maxBps[1] = 7000;
        address v = factory.createCustomVault(
            MandateVault.Mandate({
                assets: assets,
                minBps: minBps,
                maxBps: maxBps,
                maxDrawdownBps: 5000, // loose so price moves don't trip
                rebalanceCooldown: 1 hours,
                mgmtFeeBpsPerYear: 0, // <-- isolate perf fee
                perfFeeBps: 1000,
                hurdleBpsPerYear: 450,
                agent: agent,
                tripMode: MandateVault.TripMode.FREEZE
            })
        );
        MandateVault mv = MandateVault(v);
        mUSD.mint(depositor, DEPOSIT);
        vm.startPrank(depositor);
        mUSD.approve(v, type(uint256).max);
        mv.deposit(DEPOSIT);
        vm.stopPrank();
        return mv;
    }

    /// A positive gain that is still BELOW the hurdle-adjusted HWM accrues NO
    /// performance fee. We warp 365 days (hurdle floor ≈ +4.5%) then realize a
    /// gain of only ~+2.1% — below the hurdle → zero perf shares.
    function test_NoPerfFeeBelowHurdle() public {
        MandateVault mv = _perfOnlyVault();
        vm.prank(agent);
        mv.rebalance(_t(3000, 7000), "", "", ""); // 70% mMETH

        // +3% on mMETH → portfolio +2.1% gain (0.7 * 3%), below the 4.5% hurdle
        oracle.setPrice(address(mMETH), (METH_PRICE * 103) / 100);

        vm.warp(block.timestamp + 365 days);
        vm.prank(agent);
        mv.rebalance(_t(3000, 7000), "", "", "");

        // mgmt = 0 and gain < hurdle → feeRecipient holds nothing
        assertEq(mv.sharesOf(platform), 0);
        // restore oracle
        oracle.setPrice(address(mMETH), METH_PRICE);
    }

    /// Across two consecutive gain cycles the perf fee on cycle 2 is charged
    /// only on the NEW gain above the ratcheted HWM, never re-charged on cycle
    /// 1's gain. We give cycle 2 a tiny incremental gain and assert its fee is a
    /// small fraction of cycle 1's fee (which was on a large gain).
    function test_PerfFeeNoDoubleCharge() public {
        MandateVault mv = _perfOnlyVault();
        vm.prank(agent);
        mv.rebalance(_t(3000, 7000), "", "", "");

        // cycle 1: mMETH +30% → portfolio +21% gain
        oracle.setPrice(address(mMETH), (METH_PRICE * 130) / 100);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(agent);
        mv.rebalance(_t(3000, 7000), "", "", "");
        uint256 feeAfterCycle1 = mv.sharesOf(platform);
        uint256 hwmAfterCycle1 = mv.hwmSharePrice();
        assertGt(feeAfterCycle1, 0);
        assertGt(hwmAfterCycle1, 1e18); // HWM ratcheted up

        // cycle 2: a further +1% on mMETH → a small NEW gain above the ratchet
        oracle.setPrice(address(mMETH), (METH_PRICE * 131) / 100);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(agent);
        mv.rebalance(_t(3000, 7000), "", "", "");

        uint256 feeCycle2 = mv.sharesOf(platform) - feeAfterCycle1;
        // cycle-2 fee exists but is far smaller than cycle 1 — only the new gain
        // above hwmAfterCycle1 was charged, not the first cycle's 21% again.
        assertGt(feeCycle2, 0);
        assertLt(feeCycle2, feeAfterCycle1 / 5);
        // HWM ratcheted again
        assertGt(mv.hwmSharePrice(), hwmAfterCycle1);
        // restore oracle
        oracle.setPrice(address(mMETH), METH_PRICE);
    }

    /// 2-element target tuple helper.
    function _t(uint16 a, uint16 b) internal pure returns (uint16[] memory t) {
        t = new uint16[](2);
        t[0] = a;
        t[1] = b;
    }

    // ---------------------------------------------------------------- factory

    function test_FactoryTemplates() public {
        address v0 = factory.createVault(0, agent);
        address v2 = factory.createVault(2, agent);
        assertEq(factory.vaultCount(), 3); // balanced from setUp + these two

        MandateVault.Mandate memory m0 = MandateVault(v0).mandate();
        assertEq(m0.assets.length, 2);
        assertEq(m0.minBps[0], 7000);
        assertEq(m0.maxDrawdownBps, 500);

        MandateVault.Mandate memory m2 = MandateVault(v2).mandate();
        assertEq(m2.assets.length, 3);
        assertEq(m2.assets[2], address(mMNT));
        assertEq(m2.maxBps[2], 2000);
    }

    function test_FactoryUnknownTemplateReverts() public {
        vm.expectRevert(VaultFactory.UnknownTemplate.selector);
        factory.createVault(9, agent);
    }

    function test_CustomVaultInstitutionalPath() public {
        address[] memory assets = new address[](2);
        assets[0] = address(mUSD);
        assets[1] = address(mMNT);
        uint16[] memory minBps = new uint16[](2);
        minBps[0] = 5000;
        minBps[1] = 1000; // DAO treasury keeps ≥10% MNT
        uint16[] memory maxBps = new uint16[](2);
        maxBps[0] = 9000;
        maxBps[1] = 5000;

        address v = factory.createCustomVault(
            MandateVault.Mandate({
                assets: assets,
                minBps: minBps,
                maxBps: maxBps,
                maxDrawdownBps: 800,
                rebalanceCooldown: 30 minutes,
                mgmtFeeBpsPerYear: 50,
                perfFeeBps: 500,
                hurdleBpsPerYear: 450,
                agent: agent,
                tripMode: MandateVault.TripMode.DERISK
            })
        );
        assertEq(MandateVault(v).mandate().minBps[1], 1000);
    }

    function test_InvalidMandateReverts() public {
        address[] memory assets = new address[](2);
        assets[0] = address(mUSD);
        assets[1] = address(mMETH);
        uint16[] memory minBps = new uint16[](2);
        minBps[0] = 6000;
        minBps[1] = 6000; // min sum 12000 > 10000 → infeasible
        uint16[] memory maxBps = new uint16[](2);
        maxBps[0] = 10_000;
        maxBps[1] = 10_000;

        vm.expectRevert(MandateVault.InvalidMandate.selector);
        factory.createCustomVault(
            MandateVault.Mandate({
                assets: assets,
                minBps: minBps,
                maxBps: maxBps,
                maxDrawdownBps: 1000,
                rebalanceCooldown: 1 hours,
                mgmtFeeBpsPerYear: 100,
                perfFeeBps: 1000,
                hurdleBpsPerYear: 450,
                agent: agent,
                tripMode: MandateVault.TripMode.FREEZE
            })
        );
    }

    // -------------------------------------------------------- bounds updates

    function test_SetMandateBounds() public {
        uint16[] memory minBps = new uint16[](2);
        minBps[0] = 5000;
        uint16[] memory maxBps = new uint16[](2);
        maxBps[0] = 10_000;
        maxBps[1] = 5000;
        vault.setMandateBounds(minBps, maxBps);

        // 45/55 violates both new bounds; index 0 (mUSD min 5000) is checked first
        uint16[] memory target = new uint16[](2);
        target[0] = 4500;
        target[1] = 5500;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(MandateVault.MandateViolation.selector, 0, 4500, 5000, 10_000));
        vault.rebalance(target, "", "", "");
    }
}
