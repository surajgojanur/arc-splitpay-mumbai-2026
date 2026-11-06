// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ArcSplit} from "../src/ArcSplit.sol";

/// forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcSplit split) {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "Deploy: Arc Testnet (5042002) only");
        address usdc = vm.envOr("USDC_ADDRESS", ARC_TESTNET_USDC);
        require(usdc == ARC_TESTNET_USDC, "Deploy: USDC_ADDRESS is not official Arc Testnet USDC");

        vm.startBroadcast();
        split = new ArcSplit(usdc);
        vm.stopBroadcast();

        console2.log("ArcSplit deployed at", address(split));
        console2.log("USDC", usdc);
    }
}
