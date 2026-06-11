// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ISwapVenue} from "./interfaces/ISwapVenue.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Testnet-only swap venue executing at oracle price with zero slippage.
/// Holds pre-minted reserves of each mock asset (seeded by the deploy script).
/// Mainnet integration replaces this with a Merchant Moe adapter behind the
/// same ISwapVenue interface (see roadmap). Slippage modeling = roadmap.
contract MockVenue is ISwapVenue {
    IPriceOracle public immutable oracle;

    event Swapped(address indexed assetIn, address indexed assetOut, uint256 amountIn, uint256 amountOut);

    error ZeroAmount();
    error InsufficientReserves();

    constructor(IPriceOracle oracle_) {
        oracle = oracle_;
    }

    function swap(address assetIn, address assetOut, uint256 amountIn) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        uint256 priceIn = oracle.price(assetIn);
        uint256 priceOut = oracle.price(assetOut);
        amountOut = (amountIn * priceIn) / priceOut;
        if (MockERC20(assetOut).balanceOf(address(this)) < amountOut) revert InsufficientReserves();

        MockERC20(assetIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(assetOut).transfer(msg.sender, amountOut);
        emit Swapped(assetIn, assetOut, amountIn, amountOut);
    }
}
