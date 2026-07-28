// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "openzeppelin/access/AccessControl.sol";
import {SafeCast} from "openzeppelin/utils/math/SafeCast.sol";

contract RiskRegistry is AccessControl {
    uint16 public constant MAX_BPS = 10_000;
    bytes32 public constant RISK_ORACLE_ROLE = keccak256("RISK_ORACLE_ROLE");
    bytes32 public constant LIQUIDITY_ORACLE_ROLE = keccak256("LIQUIDITY_ORACLE_ROLE");
    bytes32 public constant CONTROL_OPERATOR_ROLE = keccak256("CONTROL_OPERATOR_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant GATE_RULE_ID = keccak256("RISK_SCORE_GT_KAPPA");
    bytes32 public constant STALE_PRICING_RULE_ID = keccak256("STALE_PRICING_REACHED_MAX_AGE");

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

    struct LiquidityBufferSnapshot {
        uint256 liquidityBufferRatioBps;
        uint64 occurredAt;
        uint64 submittedAt;
        bytes32 payloadHash;
        address submittedBy;
        bool exists;
    }

    struct ExtendedControlState {
        bool swingPricingActive;
        bool sidePocketActive;
        uint16 swingPricingAdjustmentBps;
        uint16 lastRiskScoreBps;
        bytes32 lastRuleId;
        bytes32 sidePocketAssetCommitmentHash;
    }

    event WeightsConfigSet(
        uint64 indexed weightsConfigId, uint64 maxStaleAgeSec, bytes32 weightsHash, address indexed by
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
    event StalePricingWarning(
        bytes32 indexed fundId,
        uint256 indexed snapshotId,
        uint16 stalePricingRiskBps,
        uint64 maxStaleAgeSec,
        bytes32 ruleId,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 metricsHash
    );
    event LiquidityBufferUpdated(
        bytes32 indexed fundId,
        uint256 liquidityBufferRatioBps,
        uint64 occurredAt,
        uint64 submittedAt,
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
    event SwingPricingApplied(
        bytes32 indexed fundId,
        uint16 adjustmentBps,
        uint16 riskScoreBps,
        bytes32 ruleId,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 payloadHash,
        address indexed by
    );
    event SidePocketCreated(
        bytes32 indexed fundId,
        bytes32 assetCommitmentHash,
        uint16 riskScoreBps,
        bytes32 ruleId,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 payloadHash,
        address indexed by
    );

    uint64 public activeWeightsConfigId;
    uint16 public defaultKappaBps;

    mapping(uint64 => WeightsConfig) private weightsConfigs;
    mapping(bytes32 => uint16) private fundKappaBps;
    mapping(bytes32 => bool) private gated;
    mapping(bytes32 => RiskSnapshot[]) private riskHistory;
    mapping(bytes32 => LiquidityBufferSnapshot) private liquidityBuffers;
    mapping(bytes32 => ExtendedControlState) public extendedControlState;

    constructor(address admin, uint16[6] memory initialWeightBps, uint64 maxStaleAgeSec, uint16 initialKappaBps) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ORACLE_ROLE, admin);
        _grantRole(LIQUIDITY_ORACLE_ROLE, admin);
        _grantRole(CONTROL_OPERATOR_ROLE, admin);
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
        require(fundId != bytes32(0), "INVALID_FUND");
        // Zero is reserved as the "unset" sentinel in effectiveKappaBps; rejecting it
        // keeps the FundKappaUpdated event consistent with the effective threshold.
        require(kappaBps > 0, "INVALID_FUND_KAPPA");
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
        require(occurredAt <= block.timestamp, "FUTURE_OCCURRED_AT");
        require(payloadHash != bytes32(0), "INVALID_PAYLOAD_HASH");
        uint16 riskScoreBps = computeRiskScoreBps(metrics, weightsConfigId);

        uint64 submittedAt = uint64(block.timestamp);
        bytes32 metricsHash = keccak256(abi.encode(fundId, metrics, riskScoreBps, weightsConfigId, occurredAt));
        riskHistory[fundId].push(
            RiskSnapshot({
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
            })
        );
        snapshotId = riskHistory[fundId].length - 1;

        RiskSnapshot storage snapshot = riskHistory[fundId][snapshotId];
        _emitRiskMetricsSubmitted(snapshotId, snapshot);
        _emitStalePricingWarning(snapshotId, snapshot);
        _applyRiskControl(snapshotId, snapshot);
    }

    function submitLiquidityBuffer(
        bytes32 fundId,
        uint256 liquidityBufferRatioBps,
        uint64 occurredAt,
        bytes32 payloadHash
    ) external onlyRole(LIQUIDITY_ORACLE_ROLE) {
        _validateStateSubmission(fundId, occurredAt, payloadHash);
        LiquidityBufferSnapshot storage previous = liquidityBuffers[fundId];
        // Overwrite-style snapshot: keep occurredAt monotone (>= allows same-time corrections),
        // matching the NAV asOf ordering rule so "latest" can never move backwards in time.
        require(!previous.exists || occurredAt >= previous.occurredAt, "OCCURRED_AT_BEFORE_LATEST");
        uint64 submittedAt = uint64(block.timestamp);
        liquidityBuffers[fundId] = LiquidityBufferSnapshot({
            liquidityBufferRatioBps: liquidityBufferRatioBps,
            occurredAt: occurredAt,
            submittedAt: submittedAt,
            payloadHash: payloadHash,
            submittedBy: msg.sender,
            exists: true
        });
        emit LiquidityBufferUpdated(fundId, liquidityBufferRatioBps, occurredAt, submittedAt, payloadHash, msg.sender);
    }

    function applySwingPricing(
        bytes32 fundId,
        uint16 adjustmentBps,
        bytes32 ruleId,
        uint64 occurredAt,
        bytes32 payloadHash
    ) external onlyRole(CONTROL_OPERATOR_ROLE) {
        require(adjustmentBps > 0, "INVALID_SWING_ADJUSTMENT");
        _validateBps(adjustmentBps);
        _validateControlSubmission(fundId, ruleId, occurredAt, payloadHash);
        RiskSnapshot storage snapshot = _latestRiskSnapshot(fundId);
        ExtendedControlState storage state = extendedControlState[fundId];
        state.swingPricingActive = true;
        state.swingPricingAdjustmentBps = adjustmentBps;
        state.lastRiskScoreBps = snapshot.riskScoreBps;
        state.lastRuleId = ruleId;
        emit SwingPricingApplied(
            fundId,
            adjustmentBps,
            snapshot.riskScoreBps,
            ruleId,
            occurredAt,
            uint64(block.timestamp),
            payloadHash,
            msg.sender
        );
    }

    function createSidePocket(
        bytes32 fundId,
        bytes32 assetCommitmentHash,
        bytes32 ruleId,
        uint64 occurredAt,
        bytes32 payloadHash
    ) external onlyRole(CONTROL_OPERATOR_ROLE) {
        require(assetCommitmentHash != bytes32(0), "INVALID_ASSET_COMMITMENT");
        _validateControlSubmission(fundId, ruleId, occurredAt, payloadHash);
        RiskSnapshot storage snapshot = _latestRiskSnapshot(fundId);
        ExtendedControlState storage state = extendedControlState[fundId];
        require(!state.sidePocketActive, "SIDE_POCKET_ALREADY_ACTIVE");
        state.sidePocketActive = true;
        state.lastRiskScoreBps = snapshot.riskScoreBps;
        state.lastRuleId = ruleId;
        state.sidePocketAssetCommitmentHash = assetCommitmentHash;
        emit SidePocketCreated(
            fundId,
            assetCommitmentHash,
            snapshot.riskScoreBps,
            ruleId,
            occurredAt,
            uint64(block.timestamp),
            payloadHash,
            msg.sender
        );
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

    function _emitStalePricingWarning(uint256 snapshotId, RiskSnapshot storage snapshot) private {
        if (snapshot.metrics.stalePricingRiskBps == MAX_BPS) {
            emit StalePricingWarning(
                snapshot.fundId,
                snapshotId,
                snapshot.metrics.stalePricingRiskBps,
                weightsConfigs[snapshot.weightsConfigId].maxStaleAgeSec,
                STALE_PRICING_RULE_ID,
                snapshot.occurredAt,
                snapshot.submittedAt,
                snapshot.metricsHash
            );
        }
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
        require(reasonHash != bytes32(0), "INVALID_REASON_HASH");
        gated[fundId] = false;
        emit GateReleased(fundId, reasonHash, uint64(block.timestamp), msg.sender);
    }

    function isGated(bytes32 fundId) external view returns (bool) {
        return gated[fundId];
    }

    function latestLiquidityBuffer(bytes32 fundId) external view returns (LiquidityBufferSnapshot memory) {
        LiquidityBufferSnapshot memory snapshot = liquidityBuffers[fundId];
        require(snapshot.exists, "NO_LIQUIDITY_BUFFER");
        return snapshot;
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

    function _latestRiskSnapshot(bytes32 fundId) private view returns (RiskSnapshot storage snapshot) {
        uint256 length = riskHistory[fundId].length;
        require(length > 0, "NO_RISK_SNAPSHOT");
        return riskHistory[fundId][length - 1];
    }

    function _validateStateSubmission(bytes32 fundId, uint64 occurredAt, bytes32 payloadHash) private view {
        require(fundId != bytes32(0), "INVALID_FUND");
        require(occurredAt > 0, "INVALID_OCCURRED_AT");
        require(occurredAt <= block.timestamp, "FUTURE_OCCURRED_AT");
        require(payloadHash != bytes32(0), "INVALID_PAYLOAD_HASH");
    }

    function _validateControlSubmission(bytes32 fundId, bytes32 ruleId, uint64 occurredAt, bytes32 payloadHash)
        private
        view
    {
        _validateStateSubmission(fundId, occurredAt, payloadHash);
        require(ruleId != bytes32(0), "INVALID_RULE_ID");
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
            weightBps: weightBps, maxStaleAgeSec: maxStaleAgeSec, weightsHash: weightsHash, exists: true
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
        uint256 numerator = uint256(metrics.valuationHaircutBps) * weights[0] + uint256(metrics.redemptionPressureBps)
            * weights[1] + uint256(metrics.redemptionQueueRatioBps) * weights[2]
            + uint256(metrics.liquidityShortfallBps) * weights[3] + uint256(metrics.stalePricingRiskBps) * weights[4]
            + uint256(metrics.investorConcentrationBps) * weights[5];

        uint256 scoreBps = numerator / MAX_BPS;
        require(scoreBps <= MAX_BPS, "SCORE_OUT_OF_RANGE");
        return SafeCast.toUint16(scoreBps);
    }
}
