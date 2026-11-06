// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ArcSplit} from "../src/ArcSplit.sol";

/// @title DeployArcSplit — Arc Testnet deployment script (testnet only)
/// @notice Deploys ArcSplit against the official Arc Testnet USDC ERC-20 interface.
/// @dev The signer is chosen on the command line (--account, --ledger, ...); no key is read from
/// the environment or stored in this file. Without --broadcast the script only simulates.
///
///   forge script script/DeployArcSplit.s.sol:DeployArcSplit \
///     --rpc-url arc_testnet --account <keystore-name> --sender <deployer-address>            # simulate
///   ... same command plus --broadcast                                                        # deploy
contract DeployArcSplit is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    /// @dev Official Arc Testnet USDC ERC-20 interface (6 decimals). Source: docs.arc.io, Contract addresses.
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcSplit split) {
        require(block.chainid == ARC_TESTNET_CHAIN_ID, "DeployArcSplit: connect to Arc Testnet (5042002)");
        require(ARC_TESTNET_USDC.code.length > 0, "DeployArcSplit: no USDC code at expected address");
        require(IERC20Metadata(ARC_TESTNET_USDC).decimals() == 6, "DeployArcSplit: USDC ERC-20 view must be 6 decimals");

        vm.startBroadcast();
        split = new ArcSplit(ARC_TESTNET_USDC);
        vm.stopBroadcast();

        console2.log("ArcSplit:", address(split));
        console2.log("USDC:", address(split.usdc()));
        console2.log("Deployment block (simulation value unless --broadcast):", block.number);
    }
}
