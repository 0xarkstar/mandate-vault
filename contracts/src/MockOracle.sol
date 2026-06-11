// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @notice Testnet-only price oracle with an owner setter. The demo "drawdown"
/// scene crashes the mMETH price through this setter. Mainnet integration
/// replaces this with Chainlink/Pyth-style feeds (see roadmap).
contract MockOracle is IPriceOracle {
    address public immutable owner;
    mapping(address => uint256) private _prices;

    event PriceSet(address indexed asset, uint256 priceUsd1e18);

    error NotOwner();
    error PriceNotSet(address asset);

    constructor() {
        owner = msg.sender;
    }

    function setPrice(address asset, uint256 priceUsd1e18) external {
        if (msg.sender != owner) revert NotOwner();
        _prices[asset] = priceUsd1e18;
        emit PriceSet(asset, priceUsd1e18);
    }

    function price(address asset) external view returns (uint256) {
        uint256 p = _prices[asset];
        if (p == 0) revert PriceNotSet(asset);
        return p;
    }
}
