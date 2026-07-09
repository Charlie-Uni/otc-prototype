// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract RiskRegistryTest is Test {
    event RiskMetricsSubmitted(
        bytes32 indexed fundId,
        uint256 indexed snapshotId,
        uint16 riskScoreBps,
        uint64 weightsConfigId,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 metricsHash,
        bytes32 payloadHash,
        address indexed submittedBy
    );
    event RiskWarningEvent(
        bytes32 indexed fundId,
        uint256 indexed snapshotId,
        uint16 riskScoreBps,
        uint16 kappaBps,
        bytes32 ruleId,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 metricsHash
    );
    event GateTriggered(
        bytes32 indexed fundId,
        uint256 indexed snapshotId,
        uint16 riskScoreBps,
        uint16 kappaBps,
        bytes32 ruleId,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 metricsHash
    );
    event GateReleased(bytes32 indexed fundId, bytes32 reasonHash, uint64 submittedAt, address indexed by);

    RiskRegistry registry;
    bytes32 fundId = keccak256("OTC_FUND_1");
    bytes32 payloadHash = keccak256("payload");
    address regulator = address(0xBEEF);
    address stranger = address(0xCAFE);

    function setUp() public {
        registry = new RiskRegistry(address(this), _validWeights(), uint64(30 days), 7_000);
    }

    function testInitialWeightsConfigIsStoredAndHashable() public view {
        (uint16[6] memory weights, uint64 maxStaleAgeSec, bytes32 weightsHash, bool exists) =
            registry.getWeightsConfig(1);

        assertTrue(exists);
        assertEq(maxStaleAgeSec, uint64(30 days));
        assertEq(weightsHash, keccak256(abi.encode(_validWeights(), uint64(30 days))));
        uint16[6] memory expectedWeights = _validWeights();
        for (uint256 i = 0; i < expectedWeights.length; i++) {
            assertEq(weights[i], expectedWeights[i]);
        }
        assertEq(registry.activeWeightsConfigId(), 1);
        assertEq(registry.defaultKappaBps(), 7_000);
    }

    function testDeployRevertsWhenWeightsDoNotSumToMaxBps() public {
        uint16[6] memory badWeights = [uint16(1_000), 1_000, 1_000, 1_000, 1_000, 1_000];

        vm.expectRevert(bytes("WEIGHTS_MUST_SUM_10000"));
        new RiskRegistry(address(this), badWeights, uint64(30 days), 7_000);
    }

    function testSubmitMetricsRevertsWhenMetricIsOutOfRange() public {
        RiskRegistry.RiskMetrics memory metrics = _lowRiskMetrics();
        metrics.valuationHaircutBps = 10_001;

        vm.expectRevert(bytes("BPS_OUT_OF_RANGE"));
        registry.submitMetrics(fundId, metrics, 3_000, 1, uint64(block.timestamp), payloadHash);
    }

    function testOnlyRiskOracleCanSubmitMetrics() public {
        vm.prank(stranger);
        vm.expectRevert();
        registry.submitMetrics(fundId, _lowRiskMetrics(), 3_000, 1, uint64(block.timestamp), payloadHash);
    }

    function testLowRiskSnapshotDoesNotGateFund() public {
        uint64 occurredAt = 1_710_000_000;
        vm.warp(1_710_000_100);

        uint256 snapshotId = registry.submitMetrics(fundId, _lowRiskMetrics(), 3_000, 1, occurredAt, payloadHash);

        RiskRegistry.RiskSnapshot memory snapshot = registry.latestSnapshot(fundId);
        assertEq(snapshotId, 0);
        assertEq(registry.historyLength(fundId), 1);
        assertFalse(registry.isGated(fundId));
        assertEq(snapshot.fundId, fundId);
        assertEq(snapshot.riskScoreBps, 3_000);
        assertEq(snapshot.weightsConfigId, 1);
        assertEq(snapshot.occurredAt, occurredAt);
        assertEq(snapshot.submittedAt, uint64(block.timestamp));
        assertEq(snapshot.payloadHash, payloadHash);
        assertEq(snapshot.submittedBy, address(this));
        assertEq(snapshot.metricsHash, keccak256(abi.encode(fundId, _lowRiskMetrics(), uint16(3_000), uint64(1), occurredAt)));
    }

    function testRiskScoreEqualToKappaDoesNotGateFund() public {
        registry.submitMetrics(fundId, _highRiskMetrics(), 7_000, 1, uint64(block.timestamp), payloadHash);

        assertFalse(registry.isGated(fundId));
    }

    function testRiskScoreAboveKappaEmitsWarningAndTriggersGate() public {
        uint64 occurredAt = 1_710_000_000;
        vm.warp(1_710_000_100);

        RiskRegistry.RiskMetrics memory metrics = _highRiskMetrics();
        uint16 riskScoreBps = 8_000;
        uint64 weightsConfigId = 1;
        uint256 snapshotId = 0;
        uint64 submittedAt = uint64(block.timestamp);
        bytes32 metricsHash = keccak256(abi.encode(fundId, metrics, riskScoreBps, weightsConfigId, occurredAt));

        vm.expectEmit(true, true, true, true, address(registry));
        emit RiskMetricsSubmitted(
            fundId,
            snapshotId,
            riskScoreBps,
            weightsConfigId,
            occurredAt,
            submittedAt,
            metricsHash,
            payloadHash,
            address(this)
        );
        vm.expectEmit(true, true, false, true, address(registry));
        emit RiskWarningEvent(
            fundId,
            snapshotId,
            riskScoreBps,
            7_000,
            registry.GATE_RULE_ID(),
            occurredAt,
            submittedAt,
            metricsHash
        );
        vm.expectEmit(true, true, false, true, address(registry));
        emit GateTriggered(
            fundId,
            snapshotId,
            riskScoreBps,
            7_000,
            registry.GATE_RULE_ID(),
            occurredAt,
            submittedAt,
            metricsHash
        );

        registry.submitMetrics(fundId, metrics, riskScoreBps, weightsConfigId, occurredAt, payloadHash);

        assertTrue(registry.isGated(fundId));
    }

    function testRepeatedHighRiskWarningDoesNotRetriggerGate() public {
        registry.submitMetrics(fundId, _highRiskMetrics(), 8_000, 1, uint64(block.timestamp), payloadHash);
        assertTrue(registry.isGated(fundId));

        vm.recordLogs();
        registry.submitMetrics(fundId, _highRiskMetrics(), 8_500, 1, uint64(block.timestamp), payloadHash);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 warningSignature =
            keccak256("RiskWarningEvent(bytes32,uint256,uint16,uint16,bytes32,uint64,uint64,bytes32)");
        bytes32 gateSignature = keccak256("GateTriggered(bytes32,uint256,uint16,uint16,bytes32,uint64,uint64,bytes32)");
        uint256 warningCount;
        uint256 gateCount;

        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == warningSignature) {
                warningCount++;
            }
            if (logs[i].topics[0] == gateSignature) {
                gateCount++;
            }
        }

        assertEq(registry.historyLength(fundId), 2);
        assertTrue(registry.isGated(fundId));
        assertEq(warningCount, 1);
        assertEq(gateCount, 0);
    }

    function testFundSpecificKappaOverridesDefaultKappa() public {
        registry.setFundKappa(fundId, 5_000);
        assertEq(registry.effectiveKappaBps(fundId), 5_000);

        registry.submitMetrics(fundId, _highRiskMetrics(), 6_000, 1, uint64(block.timestamp), payloadHash);

        assertTrue(registry.isGated(fundId));
    }

    function testWeightsRotationRejectsInactiveConfigButKeepsHistoryReadable() public {
        uint16[6] memory newWeights = [uint16(1_500), 1_500, 2_000, 2_000, 1_500, 1_500];
        registry.setWeights(newWeights, uint64(45 days));
        assertEq(registry.activeWeightsConfigId(), 2);

        vm.expectRevert(bytes("INACTIVE_WEIGHTS"));
        registry.submitMetrics(fundId, _lowRiskMetrics(), 3_000, 1, uint64(block.timestamp), payloadHash);

        (uint16[6] memory oldWeights, uint64 oldMaxStaleAgeSec, bytes32 oldWeightsHash, bool oldExists) =
            registry.getWeightsConfig(1);
        assertTrue(oldExists);
        assertEq(oldMaxStaleAgeSec, uint64(30 days));
        assertEq(oldWeightsHash, keccak256(abi.encode(_validWeights(), uint64(30 days))));
        uint16[6] memory expectedOldWeights = _validWeights();
        for (uint256 i = 0; i < expectedOldWeights.length; i++) {
            assertEq(oldWeights[i], expectedOldWeights[i]);
        }

        (uint16[6] memory activeWeights, uint64 activeMaxStaleAgeSec, bytes32 activeWeightsHash, bool activeExists) =
            registry.getWeightsConfig(2);
        assertTrue(activeExists);
        assertEq(activeMaxStaleAgeSec, uint64(45 days));
        assertEq(activeWeightsHash, keccak256(abi.encode(newWeights, uint64(45 days))));
        for (uint256 i = 0; i < newWeights.length; i++) {
            assertEq(activeWeights[i], newWeights[i]);
        }
    }

    function testOnlyAdminCanUpdateRiskParameters() public {
        uint16[6] memory newWeights = [uint16(1_500), 1_500, 2_000, 2_000, 1_500, 1_500];

        vm.startPrank(stranger);
        vm.expectRevert();
        registry.setWeights(newWeights, uint64(45 days));
        vm.expectRevert();
        registry.setDefaultKappa(6_000);
        vm.expectRevert();
        registry.setFundKappa(fundId, 5_000);
        vm.stopPrank();
    }

    function testOnlyRegulatorCanReleaseGate() public {
        registry.submitMetrics(fundId, _highRiskMetrics(), 8_000, 1, uint64(block.timestamp), payloadHash);
        assertTrue(registry.isGated(fundId));

        vm.prank(stranger);
        vm.expectRevert();
        registry.releaseGate(fundId, keccak256("not allowed"));

        registry.grantRole(registry.REGULATOR_ROLE(), regulator);
        vm.prank(regulator);
        registry.releaseGate(fundId, keccak256("risk normalized"));

        assertFalse(registry.isGated(fundId));
    }

    function testGateReleaseEmitsAuditableReasonHash() public {
        registry.submitMetrics(fundId, _highRiskMetrics(), 8_000, 1, uint64(block.timestamp), payloadHash);

        bytes32 reasonHash = keccak256("risk normalized");
        vm.warp(1_710_000_200);

        vm.expectEmit(true, false, true, true, address(registry));
        emit GateReleased(fundId, reasonHash, uint64(block.timestamp), address(this));

        registry.releaseGate(fundId, reasonHash);
    }

    function _validWeights() private pure returns (uint16[6] memory weights) {
        weights = [uint16(2_000), 2_000, 2_000, 2_000, 1_000, 1_000];
    }

    function _lowRiskMetrics() private pure returns (RiskRegistry.RiskMetrics memory) {
        return RiskRegistry.RiskMetrics({
            valuationHaircutBps: 500,
            redemptionPressureBps: 800,
            redemptionQueueRatioBps: 700,
            liquidityShortfallBps: 1_000,
            stalePricingRiskBps: 600,
            investorConcentrationBps: 900
        });
    }

    function _highRiskMetrics() private pure returns (RiskRegistry.RiskMetrics memory) {
        return RiskRegistry.RiskMetrics({
            valuationHaircutBps: 8_000,
            redemptionPressureBps: 8_500,
            redemptionQueueRatioBps: 7_900,
            liquidityShortfallBps: 8_800,
            stalePricingRiskBps: 7_500,
            investorConcentrationBps: 7_800
        });
    }
}
