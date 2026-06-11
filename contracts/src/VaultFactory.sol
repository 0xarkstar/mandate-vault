// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ISwapVenue} from "./interfaces/ISwapVenue.sol";
import {MandateVault} from "./MandateVault.sol";

/// @title VaultFactory — deploys MandateVaults from preset templates or custom mandates
/// @notice Retail users pick a template (robo-advisor UX); institutions/DAOs
/// supply a full custom mandate. The factory owner is the platform fee recipient
/// (no-token fee business: mgmt + perf fees accrue here as share dilution).
contract VaultFactory {
    address public immutable owner;
    IPriceOracle public immutable oracle;
    ISwapVenue public immutable venue;

    address public immutable mUSD;  // safe asset (Mantle-native T-bill stable, mocked)
    address public immutable mMETH; // carry asset (Mantle LST, mocked)
    address public immutable mMNT;  // treasury asset (MNT proxy, mocked)

    address[] public vaults;

    event VaultCreated(address indexed vault, uint8 indexed templateId, address indexed creator, address agent);

    error UnknownTemplate();

    constructor(IPriceOracle oracle_, ISwapVenue venue_, address mUSD_, address mMETH_, address mMNT_) {
        owner = msg.sender;
        oracle = oracle_;
        venue = venue_;
        mUSD = mUSD_;
        mMETH = mMETH_;
        mMNT = mMNT_;
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    function allVaults() external view returns (address[] memory) {
        return vaults;
    }

    /// @notice Template ids: 0 = Conservative, 1 = Balanced, 2 = Aggressive (3-asset, incl. MNT).
    function createVault(uint8 templateId, address agent) external returns (address vault) {
        MandateVault.Mandate memory m = _template(templateId, agent);
        vault = address(new MandateVault(m, oracle, venue, msg.sender, owner));
        vaults.push(vault);
        emit VaultCreated(vault, templateId, msg.sender, agent);
    }

    /// @notice Institutional path: deploy with a fully custom mandate (IPS).
    function createCustomVault(MandateVault.Mandate calldata mandate_) external returns (address vault) {
        vault = address(new MandateVault(mandate_, oracle, venue, msg.sender, owner));
        vaults.push(vault);
        emit VaultCreated(vault, type(uint8).max, msg.sender, mandate_.agent);
    }

    function _template(uint8 templateId, address agent) internal view returns (MandateVault.Mandate memory m) {
        if (templateId == 0) {
            // Conservative: mUSD 70-100%, mMETH 0-30%, DD 5%
            m = _mandate2(7000, 10_000, 0, 3000, 500, agent);
        } else if (templateId == 1) {
            // Balanced: mUSD 30-100%, mMETH 0-70%, DD 10%
            m = _mandate2(3000, 10_000, 0, 7000, 1000, agent);
        } else if (templateId == 2) {
            // Aggressive: mUSD 20-100%, mMETH 0-80%, mMNT 0-20%, DD 15%
            address[] memory assets = new address[](3);
            assets[0] = mUSD;
            assets[1] = mMETH;
            assets[2] = mMNT;
            uint16[] memory minBps = new uint16[](3);
            minBps[0] = 2000;
            uint16[] memory maxBps = new uint16[](3);
            maxBps[0] = 10_000;
            maxBps[1] = 8000;
            maxBps[2] = 2000;
            m = MandateVault.Mandate({
                assets: assets,
                minBps: minBps,
                maxBps: maxBps,
                maxDrawdownBps: 1500,
                rebalanceCooldown: 1 hours,
                mgmtFeeBpsPerYear: 100, // 1.00%
                perfFeeBps: 1000, // 10% of gains above hurdle
                hurdleBpsPerYear: 450, // ~USDY/T-bill baseline
                agent: agent
            });
        } else {
            revert UnknownTemplate();
        }
    }

    function _mandate2(
        uint16 usdMin,
        uint16 usdMax,
        uint16 methMin,
        uint16 methMax,
        uint16 drawdownBps,
        address agent
    ) internal view returns (MandateVault.Mandate memory) {
        address[] memory assets = new address[](2);
        assets[0] = mUSD;
        assets[1] = mMETH;
        uint16[] memory minBps = new uint16[](2);
        minBps[0] = usdMin;
        minBps[1] = methMin;
        uint16[] memory maxBps = new uint16[](2);
        maxBps[0] = usdMax;
        maxBps[1] = methMax;
        return MandateVault.Mandate({
            assets: assets,
            minBps: minBps,
            maxBps: maxBps,
            maxDrawdownBps: drawdownBps,
            rebalanceCooldown: 1 hours,
            mgmtFeeBpsPerYear: 100,
            perfFeeBps: 1000,
            hurdleBpsPerYear: 450,
            agent: agent
        });
    }
}
