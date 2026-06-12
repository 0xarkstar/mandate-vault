// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ISwapVenue} from "./interfaces/ISwapVenue.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title MandateVault — on-chain enforced investment mandate (IPS) for an AI agent
/// @notice A human owner encodes an investment mandate into this contract. An AI
/// agent may only rebalance within the mandate's per-asset allocation bounds —
/// out-of-bounds proposals revert on-chain regardless of any off-chain harness.
/// Every decision is logged with its full input snapshot, raw LLM proposal and
/// rationale so that any third party can replay and verify the clamp.
///
/// Three enforcement layers:
///  1. off-chain clamp (clamp-core, shared with the verifier)
///  2. on-chain bounds re-check in rebalance() — this contract
///  3. automatic drawdown trip — de-risk to the safe asset + agent suspension
contract MandateVault {
    // ---------------------------------------------------------------- types

    /// @notice Drawdown-trip behavior. FREEZE (default) suspends the agent and
    /// HOLDS positions — no forced dump into a crashing market. DERISK sells
    /// every non-safe sleeve into the safe asset via the venue (RFQ-routed when
    /// a quote is posted, oracle-mid fallback otherwise — never a market dump).
    enum TripMode {
        FREEZE,
        DERISK
    }

    struct Mandate {
        address[] assets;          // whitelist; assets[0] is the SAFE asset (mUSD)
        uint16[] minBps;           // per-asset allocation lower bound
        uint16[] maxBps;           // per-asset allocation upper bound
        uint16 maxDrawdownBps;     // share-price drawdown vs high-water mark
        uint32 rebalanceCooldown;  // seconds between rebalances
        uint16 mgmtFeeBpsPerYear;  // management fee, accrued as share dilution
        uint16 perfFeeBps;         // performance fee on gains above hurdle-adjusted HWM
        uint16 hurdleBpsPerYear;   // baseline hurdle (USDY-like risk-free yield)
        address agent;             // only address allowed to call rebalance()
        TripMode tripMode;         // drawdown-trip behavior (FREEZE default)
    }

    // ---------------------------------------------------------------- state

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant YEAR = 365 days;

    /// First-depositor share-inflation mitigation: a floor on the first deposit
    /// plus dead shares carved out of the first mint and locked forever.
    /// (Mainnet design: full ERC-4626 virtual-offset accounting — see DESIGN.md.)
    uint256 internal constant MIN_FIRST_DEPOSIT_VALUE = 1e18; // $1
    uint256 internal constant DEAD_SHARES = 1000;
    address internal constant DEAD_ADDRESS = address(0xdEaD);

    address public immutable owner;
    address public immutable feeRecipient;
    IPriceOracle public immutable oracle;
    ISwapVenue public immutable venue;

    Mandate internal _mandate;

    mapping(address => uint256) public sharesOf;
    uint256 public totalShares;

    uint256 public hwmSharePrice;   // high-water mark, 1e18
    uint64 public lastAccrual;      // fee accrual timestamp
    uint64 public lastRebalance;    // cooldown anchor
    uint64 public epoch;            // decision counter

    bool public tripped;            // drawdown trip → agent suspended until resume()
    bool public killed;             // owner kill switch → permanent agent lockout

    address public agentIdentityRegistry; // ERC-8004 adapter (official Mantle-issued NFT)
    uint256 public agentIdentityId;

    uint256 private _lock = 1; // simple reentrancy guard

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // --------------------------------------------------------------- events

    event DecisionLogged(
        uint64 indexed epoch,
        bytes32 inputSnapshotHash,
        bytes32 rawProposalHash,
        uint16[] clampedAllocBps,
        bytes32 rationaleHash
    );
    /// @notice Full replay payload kept on-chain (testnet gas is negligible;
    /// mainnet design moves this to calldata-only/IPFS — see docs/DESIGN.md).
    event DecisionData(uint64 indexed epoch, string snapshotJson, string rawProposalJson, string rationale);
    event Deposited(address indexed account, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed account, uint256 sharesBurned, uint256 amountOut);
    event DrawdownTripped(uint256 sharePrice, uint256 hwm);
    event Resumed(uint256 newHwm);
    event Killed();
    event BoundsUpdated(uint16[] minBps, uint16[] maxBps);
    event AgentUpdated(address agent);
    event AgentIdentitySet(address registry, uint256 agentId);
    event FeesAccrued(uint256 mgmtShares, uint256 perfShares, uint256 newHwm);

    // --------------------------------------------------------------- errors

    error NotOwner();
    error NotAgent();
    error VaultKilled();
    error VaultTripped();
    error CooldownActive(uint64 readyAt);
    error LengthMismatch();
    error AllocationSumNot10000();
    error MandateViolation(uint256 assetIndex, uint16 targetBps, uint16 minBps, uint16 maxBps);
    error ZeroAmount();
    error InsufficientShares();
    error InvalidMandate();
    error Reentrancy();
    error FirstDepositTooSmall(uint256 valueIn, uint256 minimum);

    // ---------------------------------------------------------- construction

    constructor(
        Mandate memory mandate_,
        IPriceOracle oracle_,
        ISwapVenue venue_,
        address owner_,
        address feeRecipient_
    ) {
        uint256 n = mandate_.assets.length;
        if (n == 0 || n != mandate_.minBps.length || n != mandate_.maxBps.length) revert LengthMismatch();
        uint256 minSum;
        uint256 maxSum;
        for (uint256 i = 0; i < n; i++) {
            if (mandate_.assets[i] == address(0)) revert InvalidMandate();
            if (mandate_.minBps[i] > mandate_.maxBps[i] || mandate_.maxBps[i] > BPS) revert InvalidMandate();
            minSum += mandate_.minBps[i];
            maxSum += mandate_.maxBps[i];
        }
        // a feasible allocation summing to exactly 10000 must exist
        if (minSum > BPS || maxSum < BPS) revert InvalidMandate();
        if (mandate_.agent == address(0) || owner_ == address(0) || feeRecipient_ == address(0)) {
            revert InvalidMandate();
        }
        if (mandate_.maxDrawdownBps == 0 || mandate_.maxDrawdownBps > BPS) revert InvalidMandate();

        _mandate = mandate_;
        oracle = oracle_;
        venue = venue_;
        owner = owner_;
        feeRecipient = feeRecipient_;
        hwmSharePrice = WAD;
        lastAccrual = uint64(block.timestamp);

        // venue pulls from the vault during swaps
        for (uint256 i = 0; i < n; i++) {
            MockERC20(mandate_.assets[i]).approve(address(venue_), type(uint256).max);
        }
    }

    // ---------------------------------------------------------------- views

    function mandate() external view returns (Mandate memory) {
        return _mandate;
    }

    function assetCount() external view returns (uint256) {
        return _mandate.assets.length;
    }

    /// @notice Total vault value in USD (1e18).
    function totalValue() public view returns (uint256 v) {
        uint256 n = _mandate.assets.length;
        for (uint256 i = 0; i < n; i++) {
            address a = _mandate.assets[i];
            v += (MockERC20(a).balanceOf(address(this)) * oracle.price(a)) / WAD;
        }
    }

    /// @notice Share price in USD (1e18). 1e18 when empty.
    function sharePrice() public view returns (uint256) {
        if (totalShares == 0) return WAD;
        return (totalValue() * WAD) / totalShares;
    }

    /// @notice Current allocation in bps per asset (sums to ~10000, rounding dust aside).
    function currentAllocationBps() public view returns (uint16[] memory bps) {
        uint256 n = _mandate.assets.length;
        bps = new uint16[](n);
        uint256 tv = totalValue();
        if (tv == 0) return bps;
        for (uint256 i = 0; i < n; i++) {
            address a = _mandate.assets[i];
            uint256 v = (MockERC20(a).balanceOf(address(this)) * oracle.price(a)) / WAD;
            bps[i] = uint16((v * BPS) / tv);
        }
    }

    /// @notice True when share price has fallen below the drawdown floor.
    function drawdownBreached() public view returns (bool) {
        return sharePrice() < (hwmSharePrice * (BPS - _mandate.maxDrawdownBps)) / BPS;
    }

    // ------------------------------------------------------- deposit/withdraw

    /// @notice Deposit the safe asset (assets[0], mUSD). v0 single-asset deposits.
    function deposit(uint256 amount) external nonReentrant returns (uint256 sharesMinted) {
        if (amount == 0) revert ZeroAmount();
        address safe = _mandate.assets[0];
        uint256 sp = sharePrice(); // pre-deposit share price
        require(MockERC20(safe).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        uint256 valueIn = (amount * oracle.price(safe)) / WAD;
        sharesMinted = (valueIn * WAD) / sp;

        if (totalShares == 0) {
            // first deposit: enforce a floor and burn dead shares out of the mint
            if (valueIn < MIN_FIRST_DEPOSIT_VALUE) revert FirstDepositTooSmall(valueIn, MIN_FIRST_DEPOSIT_VALUE);
            sharesOf[DEAD_ADDRESS] += DEAD_SHARES;
            sharesOf[msg.sender] += sharesMinted - DEAD_SHARES;
        } else {
            sharesOf[msg.sender] += sharesMinted;
        }
        totalShares += sharesMinted;
        emit Deposited(msg.sender, amount, sharesMinted);
    }

    /// @notice Burn shares, receive the safe asset. Sells other sleeves if the
    /// safe-asset balance cannot cover the withdrawal.
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amountOut) {
        if (shares == 0) revert ZeroAmount();
        if (sharesOf[msg.sender] < shares) revert InsufficientShares();

        address safe = _mandate.assets[0];
        uint256 valueOut = (shares * sharePrice()) / WAD;
        amountOut = (valueOut * WAD) / oracle.price(safe);

        // burn before external interactions
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;

        uint256 safeBal = MockERC20(safe).balanceOf(address(this));
        if (safeBal < amountOut) {
            _coverShortfall(safe, amountOut - safeBal);
            uint256 covered = MockERC20(safe).balanceOf(address(this));
            if (covered < amountOut) amountOut = covered; // rounding dust guard
        }
        require(MockERC20(safe).transfer(msg.sender, amountOut), "transfer failed");
        emit Withdrawn(msg.sender, shares, amountOut);
    }

    function _coverShortfall(address safe, uint256 shortfall) internal {
        uint256 n = _mandate.assets.length;
        uint256 safePrice = oracle.price(safe);
        for (uint256 i = 1; i < n && shortfall > 0; i++) {
            address a = _mandate.assets[i];
            uint256 bal = MockERC20(a).balanceOf(address(this));
            if (bal == 0) continue;
            uint256 priceA = oracle.price(a);
            // amount of asset i worth `shortfall` of safe asset
            uint256 needIn = (shortfall * safePrice) / priceA + 1;
            uint256 amountIn = needIn > bal ? bal : needIn;
            uint256 out = venue.swap(a, safe, amountIn);
            shortfall = out >= shortfall ? 0 : shortfall - out;
        }
    }

    // -------------------------------------------------------------- rebalance

    /// @notice Agent-only. Re-checks every mandate bound on-chain; emits the full
    /// decision payload for third-party replay verification.
    function rebalance(
        uint16[] calldata targetBps,
        string calldata snapshotJson,
        string calldata rawProposalJson,
        string calldata rationale
    ) external nonReentrant {
        if (msg.sender != _mandate.agent) revert NotAgent();
        if (killed) revert VaultKilled();
        if (tripped) revert VaultTripped();
        if (lastRebalance != 0) {
            uint64 readyAt = lastRebalance + _mandate.rebalanceCooldown;
            if (block.timestamp < readyAt) revert CooldownActive(readyAt);
        }

        _accrueFees();

        // drawdown breach → trip instead of executing the decision
        if (drawdownBreached()) {
            _trip();
            return;
        }

        // ---- on-chain mandate enforcement (layer 2) ----
        uint256 n = _mandate.assets.length;
        if (targetBps.length != n) revert LengthMismatch();
        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            if (targetBps[i] < _mandate.minBps[i] || targetBps[i] > _mandate.maxBps[i]) {
                revert MandateViolation(i, targetBps[i], _mandate.minBps[i], _mandate.maxBps[i]);
            }
            sum += targetBps[i];
        }
        if (sum != BPS) revert AllocationSumNot10000();

        _executeAllocation(targetBps);

        lastRebalance = uint64(block.timestamp);
        uint64 e = ++epoch;
        emit DecisionLogged(
            e,
            keccak256(bytes(snapshotJson)),
            keccak256(bytes(rawProposalJson)),
            targetBps,
            keccak256(bytes(rationale))
        );
        emit DecisionData(e, snapshotJson, rawProposalJson, rationale);
    }

    function _executeAllocation(uint16[] calldata targetBps) internal {
        uint256 n = _mandate.assets.length;
        address safe = _mandate.assets[0];
        uint256 tv = totalValue();
        if (tv == 0) return;

        // pass 1: sell overweight non-safe sleeves into the safe asset
        for (uint256 i = 1; i < n; i++) {
            address a = _mandate.assets[i];
            uint256 priceA = oracle.price(a);
            uint256 bal = MockERC20(a).balanceOf(address(this));
            uint256 curVal = (bal * priceA) / WAD;
            uint256 tgtVal = (tv * targetBps[i]) / BPS;
            if (curVal > tgtVal) {
                uint256 sellAmount = ((curVal - tgtVal) * WAD) / priceA;
                if (sellAmount > 0) venue.swap(a, safe, sellAmount);
            }
        }
        // pass 2: buy underweight non-safe sleeves with the safe asset
        for (uint256 i = 1; i < n; i++) {
            address a = _mandate.assets[i];
            uint256 priceA = oracle.price(a);
            uint256 bal = MockERC20(a).balanceOf(address(this));
            uint256 curVal = (bal * priceA) / WAD;
            uint256 tgtVal = (tv * targetBps[i]) / BPS;
            if (tgtVal > curVal) {
                uint256 spendSafe = ((tgtVal - curVal) * WAD) / oracle.price(safe);
                uint256 safeBal = MockERC20(safe).balanceOf(address(this));
                if (spendSafe > safeBal) spendSafe = safeBal;
                if (spendSafe > 0) venue.swap(safe, a, spendSafe);
            }
        }
    }

    // ------------------------------------------------------------------ fees

    function _accrueFees() internal {
        uint256 dt = block.timestamp - lastAccrual;
        lastAccrual = uint64(block.timestamp);
        if (totalShares == 0) return;

        // management fee: dilution minted to feeRecipient
        uint256 mgmtShares = 0;
        if (dt > 0 && _mandate.mgmtFeeBpsPerYear > 0) {
            mgmtShares = (totalShares * _mandate.mgmtFeeBpsPerYear * dt) / (BPS * YEAR);
            if (mgmtShares > 0) {
                sharesOf[feeRecipient] += mgmtShares;
                totalShares += mgmtShares;
            }
        }

        // performance fee above hurdle-adjusted high-water mark
        uint256 sp = sharePrice();
        uint256 hurdleAdjHwm = hwmSharePrice + (hwmSharePrice * _mandate.hurdleBpsPerYear * dt) / (BPS * YEAR);
        uint256 perfShares = 0;
        if (_mandate.perfFeeBps > 0 && sp > hurdleAdjHwm) {
            uint256 gainValue = ((sp - hurdleAdjHwm) * totalShares) / WAD;
            uint256 feeValue = (gainValue * _mandate.perfFeeBps) / BPS;
            perfShares = (feeValue * WAD) / sp;
            if (perfShares > 0) {
                sharesOf[feeRecipient] += perfShares;
                totalShares += perfShares;
            }
        }

        // HWM ratchets up to the post-fee share price
        uint256 spAfter = sharePrice();
        if (spAfter > hwmSharePrice) hwmSharePrice = spAfter;

        if (mgmtShares > 0 || perfShares > 0) emit FeesAccrued(mgmtShares, perfShares, hwmSharePrice);
    }

    // ------------------------------------------------------------ protection

    /// @notice Keeper-style public trip: anyone may trigger the drawdown
    /// protection once the share price breaches the mandate floor (layer 3).
    function tripCheck() external nonReentrant {
        if (killed) revert VaultKilled();
        if (tripped) revert VaultTripped();
        if (!drawdownBreached()) return;
        _trip();
    }

    function _trip() internal {
        tripped = true;
        if (_mandate.tripMode == TripMode.DERISK) {
            // DERISK: sell every non-safe sleeve into the safe asset via the
            // venue (RFQ quote when posted, oracle-mid fallback — never a dump
            // into a public pool).
            address safe = _mandate.assets[0];
            uint256 n = _mandate.assets.length;
            for (uint256 i = 1; i < n; i++) {
                address a = _mandate.assets[i];
                uint256 bal = MockERC20(a).balanceOf(address(this));
                if (bal > 0) venue.swap(a, safe, bal);
            }
        }
        // FREEZE: suspend the agent, HOLD positions — no forced selling.
        emit DrawdownTripped(sharePrice(), hwmSharePrice);
    }

    // ----------------------------------------------------------- owner admin

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Clears a drawdown trip and resets the HWM to the current share
    /// price (otherwise the vault would re-trip immediately).
    function resume() external onlyOwner {
        if (killed) revert VaultKilled();
        tripped = false;
        hwmSharePrice = sharePrice();
        emit Resumed(hwmSharePrice);
    }

    /// @notice Permanent agent lockout; depositors can still withdraw.
    function kill() external onlyOwner {
        killed = true;
        emit Killed();
    }

    function setAgent(address agent_) external onlyOwner {
        if (agent_ == address(0)) revert InvalidMandate();
        _mandate.agent = agent_;
        emit AgentUpdated(agent_);
    }

    function setMandateBounds(uint16[] calldata minBps_, uint16[] calldata maxBps_) external onlyOwner {
        uint256 n = _mandate.assets.length;
        if (minBps_.length != n || maxBps_.length != n) revert LengthMismatch();
        uint256 minSum;
        uint256 maxSum;
        for (uint256 i = 0; i < n; i++) {
            if (minBps_[i] > maxBps_[i] || maxBps_[i] > BPS) revert InvalidMandate();
            minSum += minBps_[i];
            maxSum += maxBps_[i];
        }
        if (minSum > BPS || maxSum < BPS) revert InvalidMandate();
        _mandate.minBps = minBps_;
        _mandate.maxBps = maxBps_;
        emit BoundsUpdated(minBps_, maxBps_);
    }

    /// @notice Link the official Mantle-issued ERC-8004 identity NFT.
    function setAgentIdentity(address registry, uint256 agentId) external onlyOwner {
        agentIdentityRegistry = registry;
        agentIdentityId = agentId;
        emit AgentIdentitySet(registry, agentId);
    }
}
