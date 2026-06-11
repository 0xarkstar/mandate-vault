// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISwapVenue {
    /// @notice Swap `amountIn` of `assetIn` for `assetOut`. Returns amountOut.
    /// Caller must approve `amountIn` beforehand.
    function swap(address assetIn, address assetOut, uint256 amountIn) external returns (uint256 amountOut);
}
