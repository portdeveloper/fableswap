// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Factory} from "../src/Factory.sol";
import {Router} from "../src/Router.sol";
import {Pair} from "../src/Pair.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Deploys the full stack and seeds the demo pool with initial liquidity.
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        Factory factory = new Factory();
        Router router = new Router(address(factory));
        MockERC20 wmon = new MockERC20("Wrapped Monad (Demo)", "WMON");
        MockERC20 usdc = new MockERC20("USD Coin (Demo)", "USDC");

        // Seed pool: 10,000 WMON / 20,000 USDC (price: 1 WMON = 2 USDC).
        address deployer = msg.sender;
        wmon.mint(deployer, 10_000e18);
        usdc.mint(deployer, 20_000e18);
        wmon.approve(address(router), type(uint256).max);
        usdc.approve(address(router), type(uint256).max);
        router.addLiquidity(
            address(wmon), address(usdc),
            10_000e18, 20_000e18,
            0, 0,
            deployer,
            block.timestamp + 300
        );

        vm.stopBroadcast();

        console.log("FACTORY=%s", address(factory));
        console.log("ROUTER=%s", address(router));
        console.log("WMON=%s", address(wmon));
        console.log("USDC=%s", address(usdc));
        console.log("PAIR=%s", factory.getPair(address(wmon), address(usdc)));
    }
}
