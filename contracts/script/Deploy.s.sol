// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {FundToken} from "src/FundToken.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerPrivateKey);
        uint256 oraclePrivateKey = vm.envUint("ORACLE_PRIVATE_KEY");
        address oracle = vm.addr(oraclePrivateKey);
        string memory fundIdLabel = vm.envOr("FUND_ID_LABEL", string("OTC_FUND_1"));
        bytes32 fundId = keccak256(bytes(fundIdLabel));
        uint16[6] memory weights = [uint16(2_000), 2_000, 2_000, 2_000, 1_000, 1_000];
        vm.startBroadcast(deployerPrivateKey);
        FundToken token = new FundToken(admin, "OTC Fund", "OTCF");
        NAVRegistry nav = new NAVRegistry(admin);
        RiskRegistry risk = new RiskRegistry(admin, weights, uint64(30 days), 7_000);
        // grant roles for self-contained demo
        token.grantRole(token.SUBSCRIPTION_ROLE(), admin);
        token.grantRole(token.REDEMPTION_ROLE(), admin);
        risk.grantRole(risk.RISK_ORACLE_ROLE(), oracle);
        token.setRiskGate(address(risk), fundId);
        vm.stopBroadcast();

        console2.log("FundToken:", address(token));
        console2.log("NAVRegistry:", address(nav));
        console2.log("RiskRegistry:", address(risk));
        console2.log("RiskOracle:", oracle);
        console2.log("FundIdLabel:", fundIdLabel);
    }
}
