// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Factory} from "./Factory.sol";
import {Pair} from "./Pair.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @notice User-facing entry point: handles token transfers into pools and
/// enforces slippage limits and deadlines around Pair's raw mint/burn/swap.
contract Router {
    Factory public immutable factory;

    error Expired();
    error InsufficientOutputAmount();
    error InsufficientAAmount();
    error InsufficientBAmount();
    error PairNotFound();

    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    constructor(address _factory) {
        factory = Factory(_factory);
    }

    // ---------------------------------------------------------------- views

    /// @notice Output amount for an exact input, after the 0.3% fee.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Router: insufficient input");
        require(reserveIn > 0 && reserveOut > 0, "Router: insufficient liquidity");
        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    /// @notice Equivalent value of amountA in token B at the current reserve ratio (no fee).
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        public
        pure
        returns (uint256 amountB)
    {
        require(amountA > 0, "Router: insufficient amount");
        require(reserveA > 0 && reserveB > 0, "Router: insufficient liquidity");
        amountB = (amountA * reserveB) / reserveA;
    }

    function getReserves(address tokenA, address tokenB)
        public
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        Pair pair = _pairFor(tokenA, tokenB);
        (uint112 r0, uint112 r1) = pair.getReserves();
        (reserveA, reserveB) = tokenA < tokenB ? (r0, r1) : (r1, r0);
    }

    // ------------------------------------------------------------ liquidity

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pairAddr = factory.getPair(tokenA, tokenB);
        if (pairAddr == address(0)) {
            pairAddr = factory.createPair(tokenA, tokenB);
        }
        (amountA, amountB) = _optimalAmounts(
            tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin
        );
        _safeTransferFrom(tokenA, msg.sender, pairAddr, amountA);
        _safeTransferFrom(tokenB, msg.sender, pairAddr, amountB);
        liquidity = Pair(pairAddr).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        Pair pair = _pairFor(tokenA, tokenB);
        pair.transferFrom(msg.sender, address(pair), liquidity);
        (uint256 amount0, uint256 amount1) = pair.burn(to);
        (amountA, amountB) = tokenA < tokenB ? (amount0, amount1) : (amount1, amount0);
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    // ---------------------------------------------------------------- swaps

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountOut) {
        Pair pair = _pairFor(tokenIn, tokenOut);
        (uint256 reserveIn, uint256 reserveOut) = getReserves(tokenIn, tokenOut);
        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        if (amountOut < amountOutMin) revert InsufficientOutputAmount();

        _safeTransferFrom(tokenIn, msg.sender, address(pair), amountIn);
        (uint256 amount0Out, uint256 amount1Out) =
            tokenIn < tokenOut ? (uint256(0), amountOut) : (amountOut, uint256(0));
        pair.swap(amount0Out, amount1Out, to);
    }

    // ------------------------------------------------------------- internal

    function _pairFor(address tokenA, address tokenB) internal view returns (Pair pair) {
        address pairAddr = factory.getPair(tokenA, tokenB);
        if (pairAddr == address(0)) revert PairNotFound();
        pair = Pair(pairAddr);
    }

    function _optimalAmounts(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            return (amountADesired, amountBDesired);
        }
        uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
        if (amountBOptimal <= amountBDesired) {
            if (amountBOptimal < amountBMin) revert InsufficientBAmount();
            return (amountADesired, amountBOptimal);
        }
        uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
        // amountAOptimal <= amountADesired is guaranteed here by the ratio math.
        if (amountAOptimal < amountAMin) revert InsufficientAAmount();
        return (amountAOptimal, amountBDesired);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeCall(IERC20Minimal.transferFrom, (from, to, value)));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Router: transferFrom failed");
    }
}
