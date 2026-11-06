// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArcSplit} from "../src/ArcSplit.sol";

/// One genuine settlement on Arc Testnet: create -> approve -> pay a small 70/30 invoice.
/// Env: ARCSPLIT_ADDRESS, RECIPIENT_A, RECIPIENT_B, optional DEMO_AMOUNT (atomic units, default 1 USDC).
contract DemoPayment is Script {
    function run() external {
        require(block.chainid == 5_042_002, "Arc Testnet only");
        ArcSplit split = ArcSplit(vm.envAddress("ARCSPLIT_ADDRESS"));
        address a = vm.envAddress("RECIPIENT_A");
        address b = vm.envAddress("RECIPIENT_B");
        uint256 amount = vm.envOr("DEMO_AMOUNT", uint256(1e6));
        IERC20 usdc = split.usdc();

        vm.startBroadcast();
        uint256 id = split.createInvoice(a, b, amount, 7_000, uint64(block.timestamp + 1 days));
        usdc.approve(address(split), amount);
        split.payInvoice(id);
        vm.stopBroadcast();

        console2.log("invoice id", id);
        console2.log("recipient A balance", usdc.balanceOf(a));
        console2.log("recipient B balance", usdc.balanceOf(b));
    }
}
