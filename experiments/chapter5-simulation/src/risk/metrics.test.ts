import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeInvestorConcentrationBps, MAX_BPS } from '../artifact/risk/calc';
import { allocateIntegerProportionally } from '../core/allocation';
import { parseSimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import { generateNetworkModel } from '../network/generator';
import type { RiskTier } from '../network/types';
import { applyValuationShock } from '../shocks/valuation';
import { createInitialSimulationState } from '../state/initialization';
import type { SimulationState } from '../state/types';
import { deriveRiskSubmission, evaluateRiskThresholds } from './metrics';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);
const BASE_AT = config.shock.cycleStartAt;

function fundIdForStaleTier(tier: RiskTier): string {
  return network.funds.find(({ stalePricingTier }) => stalePricingTier === tier)!.id;
}

function deriveAt(
  state: SimulationState,
  fundId: string,
  occurredAt: number,
  requestedSharesInWindow = 0,
) {
  return deriveRiskSubmission(state, network, config, {
    fundId,
    occurredAt,
    requestedSharesInWindow,
  });
}

test('respects the 1, 7, and 14 day NAV update cadence tiers', () => {
  const state = createInitialSimulationState(network, BASE_AT);
  const low = fundIdForStaleTier('low');
  const medium = fundIdForStaleTier('medium');
  const high = fundIdForStaleTier('high');

  assert.equal(deriveAt(state, low, BASE_AT + TICK_SEC).navUpdated, true);
  assert.equal(deriveAt(state, medium, BASE_AT + TICK_SEC).navUpdated, false);
  assert.equal(deriveAt(state, high, BASE_AT + TICK_SEC).navUpdated, false);
  assert.equal(deriveAt(state, medium, BASE_AT + 7 * TICK_SEC).navUpdated, true);
  assert.equal(deriveAt(state, high, BASE_AT + 7 * TICK_SEC).navUpdated, false);
  assert.equal(deriveAt(state, high, BASE_AT + 14 * TICK_SEC).navUpdated, true);
});

test('keeps an unreported valuation shock economic until the fund NAV cadence is due', () => {
  const fundId = fundIdForStaleTier('high');
  const shocked = applyValuationShock(
    createInitialSimulationState(network, BASE_AT),
    network,
    {
      scenarioId: 'risk-metric-shock',
      shockType: 'valuation',
      replicateId: 0,
      targetFundId: fundId,
      shockAt: BASE_AT,
      cycleOffsetSec: 0,
      navDropBps: 2_000,
    },
  );

  const beforeDue = deriveAt(shocked, fundId, BASE_AT + 13 * TICK_SEC);
  assert.equal(beforeDue.navUpdated, false);
  assert.equal(beforeDue.nextReportedAum, 100_000_000);
  assert.equal(beforeDue.metrics.valuationHaircutBps, 0);
  assert.equal(beforeDue.staleAgeSecRaw, 13 * TICK_SEC);
  assert.equal(beforeDue.metrics.stalePricingRiskBps, 4_333);

  const atDue = deriveAt(shocked, fundId, BASE_AT + 14 * TICK_SEC);
  assert.equal(atDue.navUpdated, true);
  assert.equal(atDue.nextReportedAum, 80_000_000);
  assert.equal(atDue.nextReportedNavPerShareBps, 8_000);
  assert.equal(atDue.metrics.valuationHaircutBps, 2_000);
  assert.equal(atDue.staleAgeSecRaw, 0);
  assert.equal(atDue.metrics.stalePricingRiskBps, 0);
});

test('produces monotone reported haircut and raw score across shock magnitudes', () => {
  const fundId = fundIdForStaleTier('high');
  const rows = config.shock.navDropBps.map((navDropBps) => {
    const shocked = applyValuationShock(
      createInitialSimulationState(network, BASE_AT),
      network,
      {
        scenarioId: `risk-dose-${navDropBps}`,
        shockType: 'valuation',
        replicateId: 0,
        targetFundId: fundId,
        shockAt: BASE_AT,
        cycleOffsetSec: 0,
        navDropBps,
      },
    );
    return deriveAt(shocked, fundId, BASE_AT + 14 * TICK_SEC);
  });

  assert.deepEqual(rows.map(({ metrics }) => metrics.valuationHaircutBps), [1_000, 2_000, 3_000]);
  assert.ok(rows[0]!.riskScoreBps < rows[1]!.riskScoreBps);
  assert.ok(rows[1]!.riskScoreBps < rows[2]!.riskScoreBps);
});

test('derives all six metrics from runtime state and registered holdings', () => {
  const fundId = fundIdForStaleTier('high');
  const state = createInitialSimulationState(network, BASE_AT);
  const runtimeFund = state.funds.find((fund) => fund.fundId === fundId)!;
  const networkFund = network.funds.find((fund) => fund.id === fundId)!;
  runtimeFund.queuedRedemptionShares = 10_000_000;
  const balances = state.holderBalances.filter((holding) => holding.fundId === fundId);
  balances[0]!.shares += 1_000_000;
  balances[1]!.shares -= 1_000_000;

  const derived = deriveAt(state, fundId, BASE_AT + 7 * TICK_SEC, 20_000_000);
  assert.equal(derived.metrics.valuationHaircutBps, 0);
  assert.equal(derived.metrics.redemptionPressureBps, 2_000);
  assert.equal(derived.metrics.redemptionQueueRatioBps, 1_000);
  assert.equal(
    derived.metrics.liquidityShortfallBps,
    Math.max(0, 10_000 - networkFund.liquidityBufferRatioBps),
  );
  assert.equal(derived.staleAgeSecRaw, 7 * TICK_SEC);
  assert.equal(derived.metrics.stalePricingRiskBps, 2_333);
  const currentSharesBps = allocateIntegerProportionally(
    MAX_BPS,
    balances.map(({ shares }) => shares),
  );
  assert.equal(
    derived.metrics.investorConcentrationBps,
    computeInvestorConcentrationBps(currentSharesBps),
  );
  assert.notEqual(derived.metrics.investorConcentrationBps, networkFund.investorConcentrationBps);
  assert.ok(Number.isInteger(derived.riskScoreBps));
  assert.ok(derived.riskScoreBps >= 0 && derived.riskScoreBps <= 10_000);
});

test('uses raw score boundaries for detection and intervention', () => {
  assert.deepEqual(evaluateRiskThresholds(5_999, 6_000, 7_000), {
    detected: false,
    interventionTriggered: false,
  });
  assert.deepEqual(evaluateRiskThresholds(6_000, 6_000, 7_000), {
    detected: true,
    interventionTriggered: false,
  });
  assert.deepEqual(evaluateRiskThresholds(7_000, 6_000, 7_000), {
    detected: true,
    interventionTriggered: false,
  });
  assert.deepEqual(evaluateRiskThresholds(7_001, 6_000, 7_000), {
    detected: true,
    interventionTriggered: true,
  });
  assert.throws(() => evaluateRiskThresholds(10_001, 6_000, 7_000), /INVALID_RISK_SCORE/);
});

test('rejects retrospective or malformed risk derivation inputs', () => {
  const state = createInitialSimulationState(network, BASE_AT + TICK_SEC);
  const fundId = state.funds[0]!.fundId;
  assert.throws(
    () => deriveAt(state, fundId, BASE_AT),
    /RISK_OCCURRED_BEFORE_STATE_TIME/,
  );
  assert.throws(
    () => deriveAt(state, fundId, BASE_AT + TICK_SEC, -1),
    /INVALID_REQUESTED_SHARES_IN_WINDOW/,
  );
  assert.throws(
    () => deriveAt(state, 'missing-fund', BASE_AT + TICK_SEC),
    /UNKNOWN_RISK_FUND/,
  );
});
