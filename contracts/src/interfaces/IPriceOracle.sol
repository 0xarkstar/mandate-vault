// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    /// @notice USD price of 1e18 units of `asset`, scaled 1e18.
    function price(address asset) external view returns (uint256);
}
