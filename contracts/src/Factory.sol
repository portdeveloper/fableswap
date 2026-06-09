// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pair} from "./Pair.sol";

/// @notice Deploys and indexes Pair pools. One pool per unordered token pair.
contract Factory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 allPairsLength);

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Factory: identical addresses");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Factory: zero address");
        require(getPair[token0][token1] == address(0), "Factory: pair exists");

        pair = address(new Pair{salt: keccak256(abi.encodePacked(token0, token1))}());
        Pair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
