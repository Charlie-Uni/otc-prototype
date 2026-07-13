// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "openzeppelin/access/AccessControl.sol";
import {SafeCast} from "openzeppelin/utils/math/SafeCast.sol";

contract RiskRegistry is AccessControl {
    uint16 public constant MAX_BPS = 10_000;
    bytes32 public constant RISK_ORACLE_ROLE = keccak256("RISK_ORACLE_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant GATE_RULE_ID = keccak256("RISK_SCORE_GT_KAPPA");

    struct RiskMetrics {
        uint16 valuationHaircutBps;
        uint16 redemptionPressureBps;
        uint16 redemptionQueueRatioBps;
        uint16 liquidityShortfallBps;
        uint16 stalePricingRiskBps;
        uint16 investorConcentrationBps;
    }

    struct WeightsConfig {
        uint16[6] weightBps;
        uint64 maxStaleAgeSec;
        bytes32 weightsHash;
        bool exists;
    }

    struct RiskSnapshot {
        bytes32 fundId;
        RiskMetrics metrics;
        uint16 riskScoreBps;
        uint16 kappaBps;
        uint64 weightsConfigId;
        uint64 occurredAt;
        uint64 submittedAt;
        bytes32 metricsHash;
        bytes32 payloadHash;
        address submittedBy;
    }

    event WeightsConfigSet(
        uint64 indexed weightsConfigId,
        uint64 maxStaleAgeSec,
        bytes32 weightsHash,
        address indexed by
    );
    event DefaultKappaUpdated(uint16 kappaBps, address indexed by);
    event FundKappaUpdated(bytes32 indexed fundId, uint16 kappaBps, address indexed by);
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

    uint64 public activeWeightsConfigId;
    uint16 public defaultKappaBps;

    mapping(uint64 => WeightsConfig) private weightsConfigs;
    mapping(bytes32 => uint16) private fundKappaBps;
    mapping(bytes32 => bool) private gated;
    mapping(bytes32 => RiskSnapshot[]) private riskHistory;

    constructor(address admin, uint16[6] memory initialWeightBps, uint64 maxStaleAgeSec, uint16 initialKappaBps) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ORACLE_ROLE, admin);
        _grantRole(REGULATOR_ROLE, admin);
        _setWeights(initialWeightBps, maxStaleAgeSec);
        _setDefaultKappa(initialKappaBps);
    }

    function setWeights(uint16[6] calldata weightBps, uint64 maxStaleAgeSec) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setWeights(weightBps, maxStaleAgeSec);
    }

    function setDefaultKappa(uint16 kappaBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultKappa(kappaBps);
    }

    function setFundKappa(bytes32 fundId, uint16 kappaBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validateBps(kappaBps);
        fundKappaBps[fundId] = kappaBps;
        emit FundKappaUpdated(fundId, kappaBps, msg.sender);
    }

    function submitMetrics(
        bytes32 fundId,
        RiskMetrics calldata metrics,
        uint64 weightsConfigId,
        uint64 occurredAt,
        bytes32 payloadHash
    ) external onlyRole(RISK_ORACLE_ROLE) returns (uint256 snapshotId) {
        require(fundId != bytes32(0), "INVALID_FUND");
        require(weightsConfigId == activeWeightsConfigId, "INACTIVE_WEIGHTS");
        require(occurredAt > 0, "INVALID_OCCURRED_AT");
        uint16 riskScoreBps = computeRiskScoreBps(metrics, weightsConfigId);

        uint64 submittedAt = uint64(block.timestamp);
        bytes32 metricsHash = keccak256(abi.encode(fundId, metrics, riskScoreBps, weightsConfigId, occurredAt));
        riskHistory[fundId].push(RiskSnapshot({
            fundId: fundId,
            metrics: metrics,
            riskScoreBps: riskScoreBps,
            kappaBps: effectiveKappaBps(fundId),
            weightsConfigId: weightsConfigId,
            occurredAt: occurredAt,
            submittedAt: submittedAt,
            metricsHash: metricsHash,
            payloadHash: payloadHash,
            submittedBy: msg.sender
        }));
        snapshotId = riskHistory[fundId].length - 1;

        RiskSnapshot storage snapshot = riskHistory[fundId][snapshotId];
        _emitRiskMetricsSubmitted(snapshotId, snapshot);
        _applyRiskControl(snapshotId, snapshot);
    }

    function computeRiskScoreBps(RiskMetrics calldata metrics, uint64 weightsConfigId) public view returns (uint16) {
        require(weightsConfigs[weightsConfigId].exists, "UNKNOWN_WEIGHTS");
        _validateMetrics(metrics);
        return _computeRiskScoreBps(metrics, weightsConfigId);
    }

    function _emitRiskMetricsSubmitted(uint256 snapshotId, RiskSnapshot storage snapshot) private {
        emit RiskMetricsSubmitted(
            snapshot.fundId,
            snapshotId,
            snapshot.riskScoreBps,
            snapshot.weightsConfigId,
            snapshot.occurredAt,
            snapshot.submittedAt,
            snapshot.metricsHash,
            snapshot.payloadHash,
            snapshot.submittedBy
        );
    }

    function _applyRiskControl(uint256 snapshotId, RiskSnapshot storage snapshot) private {
        if (snapshot.riskScoreBps > snapshot.kappaBps) {
            emit RiskWarningEvent(
                snapshot.fundId,
                snapshotId,
                snapshot.riskScoreBps,
                snapshot.kappaBps,
                GATE_RULE_ID,
                snapshot.occurredAt,
                snapshot.submittedAt,
                snapshot.metricsHash
            );
            if (!gated[snapshot.fundId]) {
                gated[snapshot.fundId] = true;
                emit GateTriggered(
                    snapshot.fundId,
                    snapshotId,
                    snapshot.riskScoreBps,
                    snapshot.kappaBps,
                    GATE_RULE_ID,
                    snapshot.occurredAt,
                    snapshot.submittedAt,
                    snapshot.metricsHash
                );
            }
        }
    }

    function releaseGate(bytes32 fundId, bytes32 reasonHash) external onlyRole(REGULATOR_ROLE) {
        require(gated[fundId], "NOT_GATED");
        gated[fundId] = false;
        emit GateReleased(fundId, reasonHash, uint64(block.timestamp), msg.sender);
    }

    function isGated(bytes32 fundId) external view returns (bool) {
        return gated[fundId];
    }

    function effectiveKappaBps(bytes32 fundId) public view returns (uint16) {
        uint16 fundKappa = fundKappaBps[fundId];
        return fundKappa == 0 ? defaultKappaBps : fundKappa;
    }

    function getWeightsConfig(uint64 weightsConfigId)
        external
        view
        returns (uint16[6] memory weightBps, uint64 maxStaleAgeSec, bytes32 weightsHash, bool exists)
    {
        WeightsConfig storage config = weightsConfigs[weightsConfigId];
        return (config.weightBps, config.maxStaleAgeSec, config.weightsHash, config.exists);
    }

    function latestSnapshot(bytes32 fundId) external view returns (RiskSnapshot memory) {
        uint256 length = riskHistory[fundId].length;
        require(length > 0, "NO_RISK_SNAPSHOT");
        return riskHistory[fundId][length - 1];
    }

    function snapshotAt(bytes32 fundId, uint256 index) external view returns (RiskSnapshot memory) {
        require(index < riskHistory[fundId].length, "SNAPSHOT_OUT_OF_RANGE");
        return riskHistory[fundId][index];
    }

    function historyLength(bytes32 fundId) external view returns (uint256) {
        return riskHistory[fundId].length;
    }

    function _setWeights(uint16[6] memory weightBps, uint64 maxStaleAgeSec) private {
        require(maxStaleAgeSec > 0, "INVALID_MAX_STALE_AGE");
        uint256 totalWeightBps;
        for (uint256 i = 0; i < weightBps.length; i++) {
            _validateBps(weightBps[i]);
            totalWeightBps += weightBps[i];
        }
        require(totalWeightBps == MAX_BPS, "WEIGHTS_MUST_SUM_10000");

        activeWeightsConfigId += 1;
        bytes32 weightsHash = keccak256(abi.encode(weightBps, maxStaleAgeSec));
        weightsConfigs[activeWeightsConfigId] = WeightsConfig({
            weightBps: weightBps,
            maxStaleAgeSec: maxStaleAgeSec,
            weightsHash: weightsHash,
            exists: true
        });

        emit WeightsConfigSet(activeWeightsConfigId, maxStaleAgeSec, weightsHash, msg.sender);
    }

    function _setDefaultKappa(uint16 kappaBps) private {
        _validateBps(kappaBps);
        defaultKappaBps = kappaBps;
        emit DefaultKappaUpdated(kappaBps, msg.sender);
    }

    function _validateMetrics(RiskMetrics calldata metrics) private pure {
        _validateBps(metrics.valuationHaircutBps);
        _validateBps(metrics.redemptionPressureBps);
        _validateBps(metrics.redemptionQueueRatioBps);
        _validateBps(metrics.liquidityShortfallBps);
        _validateBps(metrics.stalePricingRiskBps);
        _validateBps(metrics.investorConcentrationBps);
    }

    function _validateBps(uint16 value) private pure {
        require(value <= MAX_BPS, "BPS_OUT_OF_RANGE");
    }

    function _computeRiskScoreBps(RiskMetrics calldata metrics, uint64 weightsConfigId) private view returns (uint16) {
        uint16[6] storage weights = weightsConfigs[weightsConfigId].weightBps;
        uint256 numerator = uint256(metrics.valuationHaircutBps) * weights[0]
            + uint256(metrics.redemptionPressureBps) * weights[1]
            + uint256(metrics.redemptionQueueRatioBps) * weights[2]
            + uint256(metrics.liquidityShortfallBps) * weights[3]
            + uint256(metrics.stalePricingRiskBps) * weights[4]
            + uint256(metrics.investorConcentrationBps) * weights[5];

        uint256 scoreBps = numerator / MAX_BPS;
        require(scoreBps <= MAX_BPS, "SCORE_OUT_OF_RANGE");
        return SafeCast.toUint16(scoreBps);
    }
}
