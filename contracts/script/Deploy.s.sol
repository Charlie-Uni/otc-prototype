// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {FundToken} from "src/FundToken.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract Deploy is Script {
    uint256 private constant MAX_BPS = 10_000;

    struct DeploymentConfig {
        uint256 deployerPrivateKey;
        address admin;
        address oracle;
        address regulator;
        address liquidityOracle;
        string fundIdLabel;
        bytes32 fundId;
        uint16[6] weights;
        uint64 maxStaleAgeSec;
        uint16 kappaBps;
    }

    function run() external {
        DeploymentConfig memory config = _loadConfig();

        vm.startBroadcast(config.deployerPrivateKey);
        FundToken token = new FundToken(config.admin, "OTC Fund", "OTCF", config.fundId);
        NAVRegistry nav = new NAVRegistry(config.admin);
        RiskRegistry risk = new RiskRegistry(config.admin, config.weights, config.maxStaleAgeSec, config.kappaBps);
        // Configure demo operators while keeping risk duties separate from admin.
        token.grantRole(token.SUBSCRIPTION_ROLE(), config.admin);
        token.grantRole(token.REDEMPTION_ROLE(), config.admin);
        risk.grantRole(risk.RISK_ORACLE_ROLE(), config.oracle);
        risk.grantRole(risk.LIQUIDITY_ORACLE_ROLE(), config.liquidityOracle);
        risk.grantRole(risk.REGULATOR_ROLE(), config.regulator);
        risk.revokeRole(risk.RISK_ORACLE_ROLE(), config.admin);
        risk.revokeRole(risk.LIQUIDITY_ORACLE_ROLE(), config.admin);
        risk.revokeRole(risk.REGULATOR_ROLE(), config.admin);
        token.setRiskGate(address(risk));
        vm.stopBroadcast();

        console2.log("FundToken:", address(token));
        console2.log("NAVRegistry:", address(nav));
        console2.log("RiskRegistry:", address(risk));
        console2.log("RiskOracle:", config.oracle);
        console2.log("LiquidityOracle:", config.liquidityOracle);
        console2.log("Regulator:", config.regulator);
        console2.log("FundIdLabel:", config.fundIdLabel);
        console2.log("KappaBps:", config.kappaBps);
        console2.log("MaxStaleAgeSec:", config.maxStaleAgeSec);
    }

    function _loadConfig() private view returns (DeploymentConfig memory config) {
        config.deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        config.admin = vm.addr(config.deployerPrivateKey);
        config.oracle = vm.addr(vm.envUint("ORACLE_PRIVATE_KEY"));
        config.regulator = vm.addr(vm.envUint("REGULATOR_PRIVATE_KEY"));
        config.liquidityOracle = vm.addr(vm.envUint("LIQUIDITY_ORACLE_PRIVATE_KEY"));
        require(config.oracle != config.admin, "ORACLE_MUST_DIFFER_FROM_ADMIN");
        require(config.regulator != config.admin, "REGULATOR_MUST_DIFFER_FROM_ADMIN");
        require(config.liquidityOracle != config.admin, "LIQUIDITY_ORACLE_MUST_DIFFER_FROM_ADMIN");
        require(config.oracle != config.regulator, "ORACLE_REGULATOR_ROLE_COLLISION");
        require(config.oracle != config.liquidityOracle, "ORACLE_LIQUIDITY_ROLE_COLLISION");
        require(config.regulator != config.liquidityOracle, "REGULATOR_LIQUIDITY_ROLE_COLLISION");
        config.fundIdLabel = vm.envOr("FUND_ID_LABEL", string("OTC_FUND_1"));
        config.fundId = keccak256(bytes(config.fundIdLabel));
        config.weights[0] = _envBps("RISK_WEIGHT_1_BPS", 1_667);
        config.weights[1] = _envBps("RISK_WEIGHT_2_BPS", 1_667);
        config.weights[2] = _envBps("RISK_WEIGHT_3_BPS", 1_667);
        config.weights[3] = _envBps("RISK_WEIGHT_4_BPS", 1_667);
        config.weights[4] = _envBps("RISK_WEIGHT_5_BPS", 1_666);
        config.weights[5] = _envBps("RISK_WEIGHT_6_BPS", 1_666);
        config.kappaBps = _envBps("KAPPA_BPS", 7_000);

        uint256 maxStaleAgeSec = vm.envOr("MAX_STALE_AGE_SEC", uint256(30 days));
        require(maxStaleAgeSec > 0 && maxStaleAgeSec <= type(uint64).max, "INVALID_MAX_STALE_AGE");
        config.maxStaleAgeSec = uint64(maxStaleAgeSec);
    }

    function _envBps(string memory name, uint256 defaultValue) private view returns (uint16) {
        uint256 value = vm.envOr(name, defaultValue);
        require(value <= MAX_BPS, "BPS_OUT_OF_RANGE");
        return uint16(value);
    }
}
