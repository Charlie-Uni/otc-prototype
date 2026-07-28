// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {Deploy} from "script/Deploy.s.sol";
import {FundToken} from "src/FundToken.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

/// Fixes the deployment role-separation claim as an executable test instead of
/// relying only on the end-to-end smoke's cast checks: after Deploy.run(), the
/// risk oracle, liquidity oracle, and regulator roles must live on dedicated
/// accounts and must have been revoked from admin.
contract DeployTest is Test {
    // Deterministic Anvil developer keys (same set as scripts/test-chapter3.sh).
    uint256 private constant ADMIN_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 private constant ORACLE_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 private constant REGULATOR_KEY = 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;
    uint256 private constant LIQUIDITY_KEY = 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e;

    function _setDeployEnv(uint256 oracleKey, uint256 regulatorKey, uint256 liquidityKey) private {
        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(ADMIN_KEY)));
        vm.setEnv("ORACLE_PRIVATE_KEY", vm.toString(bytes32(oracleKey)));
        vm.setEnv("REGULATOR_PRIVATE_KEY", vm.toString(bytes32(regulatorKey)));
        vm.setEnv("LIQUIDITY_ORACLE_PRIVATE_KEY", vm.toString(bytes32(liquidityKey)));
        vm.setEnv("FUND_ID_LABEL", "OTC_FUND_1");
    }

    function testDeploySeparatesRiskDutiesFromAdminAndWiresGate() public {
        _setDeployEnv(ORACLE_KEY, REGULATOR_KEY, LIQUIDITY_KEY);

        Deploy deployScript = new Deploy();
        vm.recordLogs();
        deployScript.run();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Recover deployed addresses from the RiskGateConfigured event emitted by FundToken.
        bytes32 gateConfiguredSig = keccak256("RiskGateConfigured(address,bytes32)");
        address tokenAddress;
        address riskAddress;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == gateConfiguredSig) {
                tokenAddress = logs[i].emitter;
                riskAddress = address(uint160(uint256(logs[i].topics[1])));
            }
        }
        assertTrue(tokenAddress != address(0), "FundToken not found in deployment logs");
        assertTrue(riskAddress != address(0), "RiskRegistry not found in deployment logs");

        FundToken token = FundToken(tokenAddress);
        RiskRegistry risk = RiskRegistry(riskAddress);
        address admin = vm.addr(ADMIN_KEY);
        address oracle = vm.addr(ORACLE_KEY);
        address regulator = vm.addr(REGULATOR_KEY);
        address liquidityOracle = vm.addr(LIQUIDITY_KEY);

        // fundId single-source: token fundId is derived from the same label as the script.
        assertEq(token.fundId(), keccak256(bytes("OTC_FUND_1")));
        assertEq(address(token.riskGate()), riskAddress);

        // Dedicated accounts hold the risk-duty roles.
        assertTrue(risk.hasRole(risk.RISK_ORACLE_ROLE(), oracle));
        assertTrue(risk.hasRole(risk.LIQUIDITY_ORACLE_ROLE(), liquidityOracle));
        assertTrue(risk.hasRole(risk.REGULATOR_ROLE(), regulator));

        // Admin no longer holds any of the three risk-duty roles.
        assertFalse(risk.hasRole(risk.RISK_ORACLE_ROLE(), admin));
        assertFalse(risk.hasRole(risk.LIQUIDITY_ORACLE_ROLE(), admin));
        assertFalse(risk.hasRole(risk.REGULATOR_ROLE(), admin));

        // Documented prototype boundary: admin keeps governance plus fund-operation roles.
        assertTrue(risk.hasRole(risk.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.SUBSCRIPTION_ROLE(), admin));
        assertTrue(token.hasRole(token.REDEMPTION_ROLE(), admin));

        // Default research parameters reached the contracts.
        assertEq(risk.defaultKappaBps(), 7_000);
        (, uint64 maxStaleAgeSec,, bool exists) = risk.getWeightsConfig(risk.activeWeightsConfigId());
        assertTrue(exists);
        assertEq(maxStaleAgeSec, uint64(30 days));
    }

    function testDeployRejectsRoleAccountCollisions() public {
        Deploy deployScript = new Deploy();

        _setDeployEnv(ADMIN_KEY, REGULATOR_KEY, LIQUIDITY_KEY);
        vm.expectRevert(bytes("ORACLE_MUST_DIFFER_FROM_ADMIN"));
        deployScript.run();

        _setDeployEnv(ORACLE_KEY, ORACLE_KEY, LIQUIDITY_KEY);
        vm.expectRevert(bytes("ORACLE_REGULATOR_ROLE_COLLISION"));
        deployScript.run();

        _setDeployEnv(ORACLE_KEY, REGULATOR_KEY, REGULATOR_KEY);
        vm.expectRevert(bytes("REGULATOR_LIQUIDITY_ROLE_COLLISION"));
        deployScript.run();
    }
}
