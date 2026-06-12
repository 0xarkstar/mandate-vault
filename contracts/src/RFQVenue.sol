// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ISwapVenue} from "./interfaces/ISwapVenue.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title RFQVenue — signed-quote (RFQ) execution venue behind ISwapVenue
/// @notice The core execution pillar. Market makers sign EIP-712 quotes
/// off-chain; the agent posts the BEST quote on-chain (`postQuote`), then the
/// vault's `rebalance()` consumes it through the standard `swap()` interface —
/// the fill settles vault↔MM atomically at the quoted price (zero slippage,
/// no public-pool MEV surface). Every fill records transaction-cost analysis
/// (fill vs oracle mid) on-chain via `QuoteFilled`.
///
/// When no valid quote is posted for a pair (e.g. an autonomous drawdown-trip
/// de-risk, or a withdraw shortfall cover), `swap()` falls back to executing at
/// oracle mid from this venue's own reserves — liquidity is never stranded and
/// a trip can never be blocked by a missing quote.
///
/// `fillSignedQuote` is the direct taker path (verify + settle in one call),
/// used by tests and any integrator that does not need the post-then-swap hop.
contract RFQVenue is ISwapVenue {
    // ---------------------------------------------------------------- types

    struct Quote {
        address assetIn; // asset the taker (vault) sends
        address assetOut; // asset the MM sends
        uint256 amountIn; // max size the quote covers (partial fills pro-rata)
        uint256 amountOut; // amountOut for the full amountIn (fixes the price)
        uint256 expiry; // unix seconds; quote invalid after this
        address mm; // market maker = signer; pays assetOut, receives assetIn
        uint256 nonce; // per-MM replay protection
    }

    // ---------------------------------------------------------------- state

    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address assetIn,address assetOut,uint256 amountIn,uint256 amountOut,uint256 expiry,address mm,uint256 nonce)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    IPriceOracle public immutable oracle;

    /// nonce consumed at post/fill time — a signed quote is single-use.
    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    /// One posted (best) quote per directed pair, consumed by the next swap().
    mapping(address => mapping(address => Quote)) internal _activeQuote;

    // --------------------------------------------------------------- events

    event QuotePosted(
        address indexed mm, address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut
    );
    /// @notice TCA record: fill price vs oracle mid, improvement in signed bps.
    event QuoteFilled(
        address indexed mm,
        address indexed assetIn,
        address indexed assetOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 oracleMidOut,
        int256 improvementBps
    );
    /// @notice No valid quote — executed at oracle mid from venue reserves.
    event FallbackSwap(address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut);

    // --------------------------------------------------------------- errors

    error ZeroAmount();
    error QuoteExpired(uint256 expiry);
    error NonceAlreadyUsed(address mm, uint256 nonce);
    error BadSignature();
    error InsufficientReserves();

    // ---------------------------------------------------------- construction

    constructor(IPriceOracle oracle_) {
        oracle = oracle_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MandateVault RFQ")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ---------------------------------------------------------------- views

    function hashQuote(Quote calldata q) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(QUOTE_TYPEHASH, q.assetIn, q.assetOut, q.amountIn, q.amountOut, q.expiry, q.mm, q.nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function activeQuote(address assetIn, address assetOut) external view returns (Quote memory) {
        return _activeQuote[assetIn][assetOut];
    }

    // ------------------------------------------------------------------ RFQ

    /// @notice Post a signed MM quote as the active quote for its pair. The
    /// agent calls this with the BEST quote it collected; the vault's next
    /// swap() on that pair settles against it. Single-use (nonce consumed now).
    function postQuote(Quote calldata q, bytes calldata signature) external {
        _validate(q, signature);
        nonceUsed[q.mm][q.nonce] = true;
        _activeQuote[q.assetIn][q.assetOut] = q;
        emit QuotePosted(q.mm, q.assetIn, q.assetOut, q.amountIn, q.amountOut);
    }

    /// @notice Direct taker fill: verify the signature and settle msg.sender↔MM
    /// atomically at exactly the quoted amounts.
    function fillSignedQuote(Quote calldata q, bytes calldata signature) external returns (uint256 amountOut) {
        _validate(q, signature);
        nonceUsed[q.mm][q.nonce] = true;
        amountOut = _settle(q.mm, q.assetIn, q.assetOut, q.amountIn, q.amountOut, msg.sender);
    }

    // ------------------------------------------------------------ ISwapVenue

    /// @notice Vault-facing swap. Consumes the posted quote when one is valid
    /// for the pair (pro-rata partial fill); otherwise falls back to oracle mid
    /// from venue reserves so autonomous paths (trip, withdraw cover) never
    /// strand.
    function swap(address assetIn, address assetOut, uint256 amountIn) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();

        Quote memory q = _activeQuote[assetIn][assetOut];
        bool usable = q.amountIn > 0 && q.expiry >= block.timestamp && amountIn <= q.amountIn;
        if (usable) {
            delete _activeQuote[assetIn][assetOut];
            uint256 quotedOut = (amountIn * q.amountOut) / q.amountIn;
            return _settle(q.mm, assetIn, assetOut, amountIn, quotedOut, msg.sender);
        }

        // ---- fallback: oracle-mid execution from venue reserves ----
        uint256 priceIn = oracle.price(assetIn);
        uint256 priceOut = oracle.price(assetOut);
        amountOut = (amountIn * priceIn) / priceOut;
        if (MockERC20(assetOut).balanceOf(address(this)) < amountOut) revert InsufficientReserves();
        MockERC20(assetIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(assetOut).transfer(msg.sender, amountOut);
        emit FallbackSwap(assetIn, assetOut, amountIn, amountOut);
    }

    // ------------------------------------------------------------- internals

    function _validate(Quote calldata q, bytes calldata signature) internal view {
        if (q.amountIn == 0 || q.amountOut == 0) revert ZeroAmount();
        if (q.expiry < block.timestamp) revert QuoteExpired(q.expiry);
        if (nonceUsed[q.mm][q.nonce]) revert NonceAlreadyUsed(q.mm, q.nonce);
        if (_recover(hashQuote(q), signature) != q.mm || q.mm == address(0)) revert BadSignature();
    }

    /// Settle taker↔MM at the agreed amounts and emit the TCA record.
    function _settle(address mm, address assetIn, address assetOut, uint256 amountIn, uint256 amountOut, address taker)
        internal
        returns (uint256)
    {
        MockERC20(assetIn).transferFrom(taker, mm, amountIn);
        MockERC20(assetOut).transferFrom(mm, taker, amountOut);

        uint256 midOut = (amountIn * oracle.price(assetIn)) / oracle.price(assetOut);
        int256 improvementBps =
            midOut == 0 ? int256(0) : ((int256(amountOut) - int256(midOut)) * int256(BPS)) / int256(midOut);
        emit QuoteFilled(mm, assetIn, assetOut, amountIn, amountOut, midOut, improvementBps);
        return amountOut;
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert BadSignature();
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (v < 27) v += 27;
        // reject high-s malleable signatures (EIP-2)
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
