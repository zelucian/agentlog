// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only stand-in for the Agent ID NFT: just enough of the
///         ERC-721 surface (balanceOf) for AgentLog's gate, with a public
///         mint so tests and the BSC-testnet deployment can create holders.
///         NEVER deployed to mainnet.
contract MockAgentID {
    mapping(address => uint256) public balanceOf;
    uint256 public totalMinted;

    function mint(address to) external {
        balanceOf[to] += 1;
        totalMinted += 1;
    }
}
