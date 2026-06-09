// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Factory} from "../src/Factory.sol";
import {Pair} from "../src/Pair.sol";
import {Router} from "../src/Router.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract DexTest is Test {
    Factory factory;
    Router router;
    MockERC20 tokenA;
    MockERC20 tokenB;
    Pair pair;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant DEADLINE = type(uint256).max;

    function setUp() public {
        factory = new Factory();
        router = new Router(address(factory));
        tokenA = new MockERC20("Token A", "TKA");
        tokenB = new MockERC20("Token B", "TKB");

        for (uint256 i = 0; i < 2; i++) {
            address user = i == 0 ? alice : bob;
            tokenA.mint(user, 1_000_000e18);
            tokenB.mint(user, 1_000_000e18);
            vm.startPrank(user);
            tokenA.approve(address(router), type(uint256).max);
            tokenB.approve(address(router), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _addInitialLiquidity(uint256 amountA, uint256 amountB) internal returns (Pair) {
        vm.prank(alice);
        router.addLiquidity(
            address(tokenA), address(tokenB), amountA, amountB, 0, 0, alice, DEADLINE
        );
        return Pair(factory.getPair(address(tokenA), address(tokenB)));
    }

    function _reserves() internal view returns (uint256 rA, uint256 rB) {
        return router.getReserves(address(tokenA), address(tokenB));
    }

    // ------------------------------------------------------------- factory

    function test_createPair_setsTokensAndIndex() public {
        address p = factory.createPair(address(tokenA), address(tokenB));
        assertEq(factory.getPair(address(tokenA), address(tokenB)), p);
        assertEq(factory.getPair(address(tokenB), address(tokenA)), p);
        assertEq(factory.allPairsLength(), 1);
        (address t0, address t1) = address(tokenA) < address(tokenB)
            ? (address(tokenA), address(tokenB))
            : (address(tokenB), address(tokenA));
        assertEq(Pair(p).token0(), t0);
        assertEq(Pair(p).token1(), t1);
    }

    function test_createPair_revertsOnDuplicate() public {
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert("Factory: pair exists");
        factory.createPair(address(tokenB), address(tokenA));
    }

    function test_createPair_revertsOnIdentical() public {
        vm.expectRevert("Factory: identical addresses");
        factory.createPair(address(tokenA), address(tokenA));
    }

    // ----------------------------------------------------------- liquidity

    function test_firstDeposit_mintsSqrtMinusMinimum() public {
        Pair p = _addInitialLiquidity(100e18, 400e18);
        // sqrt(100e18 * 400e18) = 200e18
        assertEq(p.balanceOf(alice), 200e18 - p.MINIMUM_LIQUIDITY());
        assertEq(p.balanceOf(address(0xdead)), p.MINIMUM_LIQUIDITY());
        assertEq(p.totalSupply(), 200e18);
    }

    function test_secondDeposit_proportionalShares() public {
        Pair p = _addInitialLiquidity(100e18, 100e18);
        uint256 supplyBefore = p.totalSupply();

        vm.prank(bob);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), 50e18, 50e18, 0, 0, bob, DEADLINE
        );
        assertEq(amountA, 50e18);
        assertEq(amountB, 50e18);
        // 50% of existing reserves -> 50% of existing supply.
        assertEq(liquidity, supplyBefore / 2);
    }

    function test_addLiquidity_usesOptimalRatio() public {
        _addInitialLiquidity(100e18, 200e18); // price: 1 A = 2 B

        // Bob offers excess B; router should take only the ratio-matching amount.
        vm.prank(bob);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenA), address(tokenB), 10e18, 100e18, 0, 0, bob, DEADLINE
        );
        assertEq(amountA, 10e18);
        assertEq(amountB, 20e18);
    }

    function test_addLiquidity_revertsBelowMin() public {
        _addInitialLiquidity(100e18, 200e18);

        // Ratio forces amountB = 20e18 < amountBMin = 50e18.
        vm.prank(bob);
        vm.expectRevert(Router.InsufficientBAmount.selector);
        router.addLiquidity(
            address(tokenA), address(tokenB), 10e18, 100e18, 0, 50e18, bob, DEADLINE
        );
    }

    function test_removeLiquidity_returnsProRataShare() public {
        Pair p = _addInitialLiquidity(100e18, 100e18);
        uint256 lp = p.balanceOf(alice);

        vm.startPrank(alice);
        p.approve(address(router), lp);
        (uint256 amountA, uint256 amountB) = router.removeLiquidity(
            address(tokenA), address(tokenB), lp, 0, 0, alice, DEADLINE
        );
        vm.stopPrank();

        // Alice gets everything except the locked minimum-liquidity share.
        uint256 locked = (uint256(p.MINIMUM_LIQUIDITY()) * 100e18) / 100e18;
        assertEq(amountA, 100e18 - locked);
        assertEq(amountB, 100e18 - locked);
        assertEq(p.balanceOf(alice), 0);
    }

    function test_removeLiquidity_revertsBelowMin() public {
        Pair p = _addInitialLiquidity(100e18, 100e18);
        uint256 lp = p.balanceOf(alice);

        vm.startPrank(alice);
        p.approve(address(router), lp);
        vm.expectRevert(Router.InsufficientAAmount.selector);
        router.removeLiquidity(
            address(tokenA), address(tokenB), lp, 100e18 + 1, 0, alice, DEADLINE
        );
        vm.stopPrank();
    }

    function test_firstDepositor_cannotStealViaDonation() public {
        // Classic inflation attack: attacker seeds a tiny pool, donates a large
        // amount to skew the share price, hoping the next LP's mint rounds to 0
        // shares. MINIMUM_LIQUIDITY burn keeps the attack uneconomical: the
        // attacker can no longer own ~100% of the pool.
        address attacker = makeAddr("attacker");
        tokenA.mint(attacker, 10_001e18);
        tokenB.mint(attacker, 10_001e18);

        vm.startPrank(attacker);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), 1001, 1001, 0, 0, attacker, DEADLINE);
        Pair p = Pair(factory.getPair(address(tokenA), address(tokenB)));
        // Donate to inflate share price.
        tokenA.transfer(address(p), 10_000e18);
        tokenB.transfer(address(p), 10_000e18);
        p.sync();
        vm.stopPrank();

        // The attacker holds 1 of 1001 total shares: >99.9% of the donation
        // accrues to the locked dead shares, not the attacker.
        assertEq(p.balanceOf(attacker), 1);
        assertEq(p.totalSupply(), 1001);
    }

    // ----------------------------------------------------------------- swaps

    function test_swap_exactAmountOutFormula() public {
        _addInitialLiquidity(1000e18, 1000e18);

        uint256 amountIn = 10e18;
        uint256 expectedOut = router.getAmountOut(amountIn, 1000e18, 1000e18);
        // (10e18 * 997 * 1000e18) / (1000e18 * 1000 + 10e18 * 997)
        assertEq(expectedOut, uint256(10e18 * 997) * 1000e18 / (1000e18 * 1000 + 10e18 * 997));

        uint256 balBefore = tokenB.balanceOf(bob);
        vm.prank(bob);
        uint256 amountOut = router.swapExactTokensForTokens(
            amountIn, expectedOut, address(tokenA), address(tokenB), bob, DEADLINE
        );
        assertEq(amountOut, expectedOut);
        assertEq(tokenB.balanceOf(bob) - balBefore, expectedOut);
    }

    function test_swap_revertsOnSlippage() public {
        _addInitialLiquidity(1000e18, 1000e18);
        uint256 expectedOut = router.getAmountOut(10e18, 1000e18, 1000e18);

        vm.prank(bob);
        vm.expectRevert(Router.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(
            10e18, expectedOut + 1, address(tokenA), address(tokenB), bob, DEADLINE
        );
    }

    function test_swap_revertsPastDeadline() public {
        _addInitialLiquidity(1000e18, 1000e18);
        vm.warp(block.timestamp + 1 hours);

        vm.prank(bob);
        vm.expectRevert(Router.Expired.selector);
        router.swapExactTokensForTokens(
            10e18, 0, address(tokenA), address(tokenB), bob, block.timestamp - 1
        );
    }

    function test_swap_kNeverDecreases() public {
        pair = _addInitialLiquidity(1000e18, 500e18);
        (uint256 rA, uint256 rB) = _reserves();
        uint256 kBefore = rA * rB;

        vm.startPrank(bob);
        router.swapExactTokensForTokens(10e18, 0, address(tokenA), address(tokenB), bob, DEADLINE);
        router.swapExactTokensForTokens(3e18, 0, address(tokenB), address(tokenA), bob, DEADLINE);
        router.swapExactTokensForTokens(100e18, 0, address(tokenA), address(tokenB), bob, DEADLINE);
        vm.stopPrank();

        (rA, rB) = _reserves();
        assertGt(rA * rB, kBefore); // strictly grows because fees stay in the pool
    }

    function test_swap_feesAccrueToLPs() public {
        Pair p = _addInitialLiquidity(1000e18, 1000e18);

        // Round-trip swaps leave fees behind, so burning all LP returns more
        // than was deposited (in aggregate value).
        vm.startPrank(bob);
        uint256 out = router.swapExactTokensForTokens(
            100e18, 0, address(tokenA), address(tokenB), bob, DEADLINE
        );
        router.swapExactTokensForTokens(out, 0, address(tokenB), address(tokenA), bob, DEADLINE);
        vm.stopPrank();

        (uint256 rA, uint256 rB) = _reserves();
        assertGt(rA * rB, 1000e18 * 1000e18);
        // Bob lost value to fees; the pool keeps it for LPs.
        assertGt(rA + rB, 2000e18);
        assertEq(p.balanceOf(bob), 0);
    }

    function test_pair_swapRevertsWithoutInput() public {
        pair = _addInitialLiquidity(1000e18, 1000e18);
        vm.expectRevert("Pair: insufficient input amount");
        pair.swap(1e18, 0, address(this));
    }

    function test_pair_swapRevertsOnUnderpaidInput() public {
        pair = _addInitialLiquidity(1000e18, 1000e18);
        // Pay in slightly less than the fee-adjusted amount the output requires.
        uint256 fairIn = router.getAmountOut(1e18, 1000e18, 1000e18);
        vm.prank(bob);
        tokenB.transfer(address(pair), fairIn - 1e15);
        (uint256 out0,) = address(tokenA) < address(tokenB)
            ? (uint256(1e18), uint256(0))
            : (uint256(0), uint256(1e18));
        vm.expectRevert("Pair: k");
        pair.swap(out0, out0 == 0 ? 1e18 : 0, address(this));
    }

    function test_pair_swapRevertsExceedingReserves() public {
        pair = _addInitialLiquidity(1000e18, 1000e18);
        vm.expectRevert("Pair: insufficient liquidity");
        pair.swap(1000e18, 0, address(this));
    }

    // ----------------------------------------------------------------- fuzz

    function testFuzz_swap_preservesK(uint256 amountIn) public {
        amountIn = bound(amountIn, 1e6, 500_000e18);
        _addInitialLiquidity(1000e18, 1000e18);

        (uint256 rA, uint256 rB) = _reserves();
        uint256 kBefore = rA * rB;

        vm.prank(bob);
        router.swapExactTokensForTokens(amountIn, 0, address(tokenA), address(tokenB), bob, DEADLINE);

        (rA, rB) = _reserves();
        assertGe(rA * rB, kBefore);
    }

    function testFuzz_addRemove_neverProfitable(uint256 amountA, uint256 amountB) public {
        amountA = bound(amountA, 1e9, 100_000e18);
        amountB = bound(amountB, 1e9, 100_000e18);
        _addInitialLiquidity(1000e18, 1000e18);

        uint256 balABefore = tokenA.balanceOf(bob);
        uint256 balBBefore = tokenB.balanceOf(bob);

        vm.startPrank(bob);
        (,, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), amountA, amountB, 0, 0, bob, DEADLINE
        );
        Pair p = Pair(factory.getPair(address(tokenA), address(tokenB)));
        p.approve(address(router), liquidity);
        router.removeLiquidity(address(tokenA), address(tokenB), liquidity, 0, 0, bob, DEADLINE);
        vm.stopPrank();

        // Rounding always favors the pool: bob can never exit with more than he entered.
        assertLe(tokenA.balanceOf(bob), balABefore);
        assertLe(tokenB.balanceOf(bob), balBBefore);
    }

    function testFuzz_getAmountOut_matchesPairKCheck(uint256 amountIn, uint256 rIn, uint256 rOut) public pure {
        rIn = bound(rIn, 1e6, type(uint112).max);
        rOut = bound(rOut, 1e6, type(uint112).max);
        amountIn = bound(amountIn, 1, type(uint112).max);

        uint256 amountInWithFee = amountIn * 997;
        uint256 amountOut = (amountInWithFee * rOut) / (rIn * 1000 + amountInWithFee);

        // The router's quote must always satisfy the pair's fee-adjusted k-check.
        uint256 balInAdj = (rIn + amountIn) * 1000 - amountIn * 3;
        uint256 balOutAdj = (rOut - amountOut) * 1000;
        assertGe(balInAdj * balOutAdj, rIn * rOut * 1000 * 1000);
    }
}
