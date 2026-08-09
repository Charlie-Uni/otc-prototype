import {
  computeInvestorConcentrationBps,
  computeLiquidityShortfallBps,
  computeRedemptionPressureBps,
  MAX_BPS,
  normalizeStalePricingRiskBps,
  type RiskMetrics,
} from '../artifact/risk/calc';
import { computeWeightedRiskScoreBps } from '../artifact/simulation/sensitivity';
import { allocateIntegerProportionally } from '../core/allocation';
import type { SimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import type { NetworkModel } from '../network/types';
import type { SimulationState } from '../state/types';

export type RiskDerivationInput = {
  fundId: string;
  occurredAt: number;
  requestedSharesInWindow: number;
};

export type DerivedRiskSubmission = {
  fundId: string;
  occurredAt: number;
  navUpdated: boolean;
  nextReportedAum: number;
  nextReportedNavPerShareBps: number;
  staleAgeSecRaw: number;
  liquidityBufferRatioBps: number;
  metrics: RiskMetrics;
  riskScoreBps: number;
  detected: boolean;
  interventionTriggered: boolean;
};

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function declineBps(previousValue: number, currentValue: number): number {
  if (previousValue === 0 || currentValue >= previousValue) return 0;
  return Number(
    (BigInt(previousValue - currentValue) * BigInt(MAX_BPS)) / BigInt(previousValue),
  );
}

function liquidityBufferRatioBps(
  state: SimulationState,
  network: NetworkModel,
  fundId: string,
  expectedClaims: number,
): number {
  if (expectedClaims <= 0) throw new Error('INVALID_EXPECTED_REDEMPTION_CLAIMS');
  const liquidAssetIds = new Set(network.assetClasses
    .filter(({ liquidity }) => liquidity === 'liquid')
    .map(({ id }) => id));
  const liquidAssets = state.assetPositions
    .filter((position) => position.fundId === fundId && liquidAssetIds.has(position.assetClassId))
    .reduce((sum, position) => sum + position.value, 0);
  return Number((BigInt(liquidAssets) * BigInt(MAX_BPS)) / BigInt(expectedClaims));
}

export function evaluateRiskThresholds(
  riskScoreBps: number,
  detectionThresholdBps: number,
  kappaBps: number,
): { detected: boolean; interventionTriggered: boolean } {
  for (const [field, value] of [
    ['RISK_SCORE', riskScoreBps],
    ['DETECTION_THRESHOLD', detectionThresholdBps],
    ['KAPPA', kappaBps],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
      throw new Error(`INVALID_${field}`);
    }
  }
  return {
    detected: riskScoreBps >= detectionThresholdBps,
    interventionTriggered: riskScoreBps > kappaBps,
  };
}

export function deriveRiskSubmission(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  input: RiskDerivationInput,
): DerivedRiskSubmission {
  requireSafeNonNegative(input.occurredAt, 'RISK_OCCURRED_AT');
  requireSafeNonNegative(input.requestedSharesInWindow, 'REQUESTED_SHARES_IN_WINDOW');
  if (input.occurredAt < state.nowSec) throw new Error('RISK_OCCURRED_BEFORE_STATE_TIME');
  const runtimeFund = state.funds.find(({ fundId }) => fundId === input.fundId);
  const networkFund = network.funds.find(({ id }) => id === input.fundId);
  if (!runtimeFund || !networkFund) throw new Error('UNKNOWN_RISK_FUND');
  if (input.occurredAt < runtimeFund.lastValuationAsOf) {
    throw new Error('RISK_OCCURRED_BEFORE_LAST_VALUATION_AS_OF');
  }
  if (input.occurredAt < runtimeFund.lastValuationUpdateAt) {
    throw new Error('RISK_OCCURRED_BEFORE_LAST_VALUATION_UPDATE');
  }

  const navUpdateIntervalSec = networkFund.navUpdateIntervalDays * TICK_SEC;
  const navUpdated = input.occurredAt - runtimeFund.lastValuationAsOf >= navUpdateIntervalSec;
  const nextReportedAum = navUpdated ? runtimeFund.economicAum : runtimeFund.reportedAum;
  const nextReportedNavPerShareBps = Number(
    (BigInt(nextReportedAum) * BigInt(MAX_BPS)) / BigInt(runtimeFund.totalShares),
  );
  const staleAgeSecRaw = navUpdated ? 0 : input.occurredAt - runtimeFund.lastValuationUpdateAt;
  const expectedClaims = Number(
    (BigInt(networkFund.initialAum) * BigInt(networkFund.expectedRedemptionClaimsBps))
      / BigInt(MAX_BPS),
  );
  const currentLiquidityBufferRatioBps = liquidityBufferRatioBps(
    state,
    network,
    input.fundId,
    expectedClaims,
  );
  const holderSharesBps = allocateIntegerProportionally(
    MAX_BPS,
    state.holderBalances
      .filter(({ fundId }) => fundId === input.fundId)
      .map(({ shares }) => shares),
  );
  const metrics: RiskMetrics = {
    valuationHaircutBps: navUpdated
      ? declineBps(runtimeFund.reportedAum, nextReportedAum)
      : runtimeFund.reportedRiskMetrics.valuationHaircutBps,
    redemptionPressureBps: computeRedemptionPressureBps(
      BigInt(input.requestedSharesInWindow),
      BigInt(runtimeFund.totalShares),
    ),
    redemptionQueueRatioBps: computeRedemptionPressureBps(
      BigInt(runtimeFund.queuedRedemptionShares),
      BigInt(runtimeFund.totalShares),
    ),
    liquidityShortfallBps: computeLiquidityShortfallBps(currentLiquidityBufferRatioBps),
    stalePricingRiskBps: normalizeStalePricingRiskBps(
      staleAgeSecRaw,
      config.risk.maxStaleAgeDays * TICK_SEC,
    ),
    investorConcentrationBps: computeInvestorConcentrationBps(holderSharesBps),
  };
  const riskScoreBps = computeWeightedRiskScoreBps(metrics, config.risk.weightBps);
  return {
    fundId: input.fundId,
    occurredAt: input.occurredAt,
    navUpdated,
    nextReportedAum,
    nextReportedNavPerShareBps,
    staleAgeSecRaw,
    liquidityBufferRatioBps: currentLiquidityBufferRatioBps,
    metrics,
    riskScoreBps,
    ...evaluateRiskThresholds(
      riskScoreBps,
      config.thresholds.detectionBps,
      config.thresholds.baselineKappaBps,
    ),
  };
}
