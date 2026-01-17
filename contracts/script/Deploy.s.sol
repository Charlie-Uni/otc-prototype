// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {FundToken} from "src/FundToken.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";

contract Deploy is Script {
    function run() external {
        address admin = vm.envAddress("DEPLOYER");
        vm.startBroadcast();
        FundToken token = new FundToken(admin, "OTC Fund", "OTCF");
        NAVRegistry nav = new NAVRegistry(admin);
        // grant roles for self-contained demo
        token.grantRole(token.SUBSCRIPTION_ROLE(), admin);
        token.grantRole(token.REDEMPTION_ROLE(), admin);
        vm.stopBroadcast();

        console2.log("FundToken:", address(token));
        console2.log("NAVRegistry:", address(nav));
    }
}
