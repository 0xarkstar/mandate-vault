// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal adapter surface for the official Mantle-issued ERC-8004 agent
/// identity NFT. The hackathon issues identity NFTs centrally; this interface is
/// the linkage point only (registration flow handled off-chain, see docs).
interface IAgentIdentity {
    function ownerOf(uint256 agentId) external view returns (address);
}
