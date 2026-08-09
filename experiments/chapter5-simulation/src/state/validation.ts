import {
  computeLiquidityShortfallBps,
  MAX_BPS,
  normalizeStalePricingRiskBps,
} from '../artifact/risk/calc';
import { computeWeightedRiskScoreBps } from '../artifact/simulation/sensitivity';
import { TICK_SEC } from '../core/pipeline';
import type { NetworkModel } from '../network/types';
import type { SimulationState } from './types';

function requireSafeNonNegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${label}`);
}

export function validateSimulationState(state: SimulationState, network: NetworkModel): void {
  if (state.schemaVersion !== 1) throw new Error('UNSUPPORTED_SIMULATION_STATE_SCHEMA');
  requireSafeNonNegative(state.nowSec, 'STATE_TIME');
  if (state.funds.length !== network.funds.length) throw new Error('STATE_FUND_COUNT_MISMATCH');

  const networkFundIds = new Set(network.funds.map(({ id }) => id));
  const assetClassIds = new Set(network.assetClasses.map(({ id }) => id));
  const seenFunds = new Set<string>();
  for (const fund of state.funds) {
    if (!networkFundIds.has(fund.fundId)) throw new Error('UNKNOWN_STATE_FUND');
    if (seenFunds.has(fund.fundId)) throw new Error('DUPLICATE_STATE_FUND');
    seenFunds.add(fund.fundId);
    requireSafeNonNegative(fund.economicAum, 'ECONOMIC_AUM');
    requireSafeNonNegative(fund.reportedAum, 'REPORTED_AUM');
    requireSafeNonNegative(fund.totalShares, 'TOTAL_SHARES');
    requireSafeNonNegative(fund.queuedRedemptionShares, 'QUEUED_REDEMPTION_SHARES');
    requireSafeNonNegative(fund.cumulativeRequestedShares, 'CUMULATIVE_REQUESTED_SHARES');
    requireSafeNonNegative(fund.cumulativeSettledShares, 'CUMULATIVE_SETTLED_SHARES');
    requireSafeNonNegative(fund.lastValuationAsOf, 'LAST_VALUATION_AS_OF');
    requireSafeNonNegative(fund.lastValuationUpdateAt, 'LAST_VALUATION_UPDATE_AT');
    if (fund.lastValuationAsOf > fund.lastValuationUpdateAt) {
      throw new Error('VALUATION_AS_OF_AFTER_UPDATE');
    }
    if (fund.lastValuationUpdateAt > state.nowSec) throw new Error('VALUATION_UPDATE_AFTER_STATE_TIME');
    if (fund.totalShares === 0) throw new Error('ZERO_TOTAL_SHARES');
    if (fund.queuedRedemptionShares > fund.totalShares) throw new Error('QUEUE_EXCEEDS_TOTAL_SHARES');
    const expectedNavBps = Number(
      (BigInt(fund.reportedAum) * BigInt(MAX_BPS)) / BigInt(fund.totalShares),
    );
    if (fund.reportedNavPerShareBps !== expectedNavBps) throw new Error('REPORTED_NAV_MISMATCH');
    for (const metric of Object.values(fund.reportedRiskMetrics)) {
      if (!Number.isInteger(metric) || metric < 0 || metric > MAX_BPS) {
        throw new Error('INVALID_REPORTED_RISK_METRIC');
      }
    }
  }

  const expectedHoldingPairs = new Set(network.holdings.map(
    ({ fundId, investorId }) => `${fundId}\u0000${investorId}`,
  ));
  if (state.holderBalances.length !== expectedHoldingPairs.size) {
    throw new Error('HOLDER_BALANCE_COUNT_MISMATCH');
  }
  const holdingPairs = new Set<string>();
  const holdingTotals = new Map<string, number>();
  for (const holding of state.holderBalances) {
    const pair = `${holding.fundId}\u0000${holding.investorId}`;
    if (!expectedHoldingPairs.has(pair)) throw new Error('UNEXPECTED_HOLDER_BALANCE');
    if (holdingPairs.has(pair)) throw new Error('DUPLICATE_HOLDER_BALANCE');
    holdingPairs.add(pair);
    requireSafeNonNegative(holding.shares, 'HOLDER_SHARES');
    holdingTotals.set(
      holding.fundId,
      (holdingTotals.get(holding.fundId) ?? 0) + holding.shares,
    );
  }
  for (const fund of state.funds) {
    if (holdingTotals.get(fund.fundId) !== fund.totalShares) {
      throw new Error('HOLDER_SHARES_TOTAL_SUPPLY_MISMATCH');
    }
  }

  const positionPairs = new Set<string>();
  const expectedPositionPairs = new Set(network.assetExposures.map(
    ({ fundId, assetClassId }) => `${fundId}\u0000${assetClassId}`,
  ));
  if (state.assetPositions.length !== expectedPositionPairs.size) {
    throw new Error('ASSET_POSITION_COUNT_MISMATCH');
  }
  const positionTotals = new Map<string, number>();
  for (const position of state.assetPositions) {
    if (!networkFundIds.has(position.fundId)) throw new Error('UNKNOWN_POSITION_FUND');
    if (!assetClassIds.has(position.assetClassId)) throw new Error('UNKNOWN_POSITION_ASSET');
    requireSafeNonNegative(position.value, 'ASSET_POSITION_VALUE');
    const pair = `${position.fundId}\u0000${position.assetClassId}`;
    if (!expectedPositionPairs.has(pair)) throw new Error('UNEXPECTED_ASSET_POSITION');
    if (positionPairs.has(pair)) throw new Error('DUPLICATE_ASSET_POSITION');
    positionPairs.add(pair);
    positionTotals.set(position.fundId, (positionTotals.get(position.fundId) ?? 0) + position.value);
  }
  for (const fund of state.funds) {
    if (positionTotals.get(fund.fundId) !== fund.economicAum) {
      throw new Error('ECONOMIC_AUM_POSITION_MISMATCH');
    }
  }

  const shockIds = new Set<string>();
  if (state.appliedValuationShocks.length > 1) throw new Error('MULTIPLE_BASELINE_SHOCKS');
  for (const shock of state.appliedValuationShocks) {
    if (shockIds.has(shock.scenarioId)) throw new Error('DUPLICATE_APPLIED_SHOCK');
    shockIds.add(shock.scenarioId);
    if (!networkFundIds.has(shock.targetFundId)) throw new Error('UNKNOWN_SHOCK_TARGET_FUND');
    requireSafeNonNegative(shock.shockAt, 'APPLIED_SHOCK_TIME');
    requireSafeNonNegative(shock.lossAmount, 'APPLIED_SHOCK_LOSS');
    requireSafeNonNegative(shock.preShockEconomicAum, 'PRE_SHOCK_ECONOMIC_AUM');
    requireSafeNonNegative(shock.postShockEconomicAum, 'POST_SHOCK_ECONOMIC_AUM');
    if (shock.shockAt > state.nowSec) throw new Error('APPLIED_SHOCK_AFTER_STATE_TIME');
    if (shock.navDropBps <= 0 || shock.navDropBps > MAX_BPS) {
      throw new Error('INVALID_APPLIED_SHOCK_MAGNITUDE');
    }
    if (shock.preShockEconomicAum - shock.lossAmount !== shock.postShockEconomicAum) {
      throw new Error('APPLIED_SHOCK_ACCOUNTING_MISMATCH');
    }
    const expectedLoss = Number(
      (BigInt(shock.preShockEconomicAum) * BigInt(shock.navDropBps)) / BigInt(MAX_BPS),
    );
    if (shock.lossAmount !== expectedLoss) throw new Error('APPLIED_SHOCK_MAGNITUDE_MISMATCH');
  }

  const submissionIds = new Set<string>();
  for (const snapshot of state.oracleRiskSnapshots) {
    if (submissionIds.has(snapshot.submissionId)) throw new Error('DUPLICATE_ORACLE_SUBMISSION');
    submissionIds.add(snapshot.submissionId);
    if (!networkFundIds.has(snapshot.fundId)) throw new Error('UNKNOWN_ORACLE_SUBMISSION_FUND');
    requireSafeNonNegative(snapshot.replicateId, 'ORACLE_REPLICATE_ID');
    requireSafeNonNegative(snapshot.tick, 'ORACLE_TICK');
    requireSafeNonNegative(snapshot.occurredAt, 'ORACLE_OCCURRED_AT');
    requireSafeNonNegative(snapshot.submittedAt, 'ORACLE_SUBMITTED_AT');
    requireSafeNonNegative(snapshot.staleAgeSecRaw, 'ORACLE_STALE_AGE');
    requireSafeNonNegative(snapshot.liquidityBufferRatioBps, 'ORACLE_LIQUIDITY_BUFFER_RATIO');
    if (!snapshot.weightSchemeId.trim()) throw new Error('INVALID_ORACLE_WEIGHT_SCHEME_ID');
    if (!Number.isSafeInteger(snapshot.maxStaleAgeDays) || snapshot.maxStaleAgeDays <= 0) {
      throw new Error('INVALID_ORACLE_MAX_STALE_AGE_DAYS');
    }
    if (snapshot.submittedAt < snapshot.occurredAt) throw new Error('ORACLE_SUBMITTED_BEFORE_OCCURRED');
    if (snapshot.submittedAt > state.nowSec) throw new Error('ORACLE_SUBMITTED_AFTER_STATE_TIME');
    if (snapshot.navUpdated && snapshot.staleAgeSecRaw !== 0) {
      throw new Error('ORACLE_NAV_UPDATE_WITH_STALE_AGE');
    }
    if (!Number.isInteger(snapshot.attemptCount) || snapshot.attemptCount <= 0) {
      throw new Error('INVALID_ORACLE_ATTEMPT_COUNT');
    }
    if (
      !Number.isInteger(snapshot.failedAttemptCount)
      || snapshot.failedAttemptCount < 0
      || snapshot.failedAttemptCount >= snapshot.attemptCount
    ) {
      throw new Error('INVALID_ORACLE_FAILED_ATTEMPT_COUNT');
    }
    const expectedScore = computeWeightedRiskScoreBps(snapshot.metrics, snapshot.weightBps);
    if (snapshot.riskScoreBps !== expectedScore) throw new Error('ORACLE_RISK_SCORE_MISMATCH');
    if (
      !Number.isInteger(snapshot.detectionThresholdBps)
      || snapshot.detectionThresholdBps < 0
      || snapshot.detectionThresholdBps > MAX_BPS
      || !Number.isInteger(snapshot.kappaBps)
      || snapshot.kappaBps < 0
      || snapshot.kappaBps > MAX_BPS
    ) {
      throw new Error('INVALID_ORACLE_THRESHOLD');
    }
    if (
      snapshot.metrics.liquidityShortfallBps
      !== computeLiquidityShortfallBps(snapshot.liquidityBufferRatioBps)
    ) {
      throw new Error('ORACLE_LIQUIDITY_SHORTFALL_MISMATCH');
    }
    const expectedStaleRisk = normalizeStalePricingRiskBps(
      snapshot.staleAgeSecRaw,
      snapshot.maxStaleAgeDays * TICK_SEC,
    );
    if (snapshot.metrics.stalePricingRiskBps !== expectedStaleRisk) {
      throw new Error('ORACLE_STALE_RISK_MISMATCH');
    }
    if (snapshot.detected !== (snapshot.riskScoreBps >= snapshot.detectionThresholdBps)) {
      throw new Error('ORACLE_DETECTION_MISMATCH');
    }
    if (snapshot.interventionTriggered !== (snapshot.riskScoreBps > snapshot.kappaBps)) {
      throw new Error('ORACLE_INTERVENTION_MISMATCH');
    }
  }
}
