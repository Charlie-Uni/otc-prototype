import assert from 'node:assert/strict';
import test from 'node:test';
import {
  controlCost,
  lossReduction,
  publicControlSpillover,
  redemptionAccelerationBps,
  spilloverScope,
} from './counterfactual';
import type { FundRunOutcome, RunOutcomeMetrics } from './outcome-types';

function fund(
  fundId: string,
  shocked: boolean,
  requestRateBps: number,
  lossMagnitudeBps: number,
  overrides: Partial<FundRunOutcome> = {},
): FundRunOutcome {
  const initialTotalShares = 10_000;
  const initialAum = 100_000;
  const cumulativeRequestedShares = requestRateBps;
  const lossAmount = lossMagnitudeBps * 10;
  return {
    fundId,
    shocked,
    windowDays: 30,
    initialAum,
    initialTotalShares,
    cumulativeRequestedShares,
    cumulativeRequestRateBps: requestRateBps,
    cumulativeLatentRequestedShares: cumulativeRequestedShares,
    cumulativeLatentRequestRateBps: requestRateBps,
    peakRedemptionBps: requestRateBps,
    settledShares: cumulativeRequestedShares,
    pendingRequestCount: 0,
    pendingShares: 0,
    pendingRateBps: 0,
    settlementDelay: {
      settledRequestCount: 1,
      meanSec: 0,
      medianSec: 0,
      p95Sec: 0,
    },
    blockedSharesByGate: 0,
    gateFrozenShareRatioBps: 0,
    totalExtraWaitingSec: 0,
    averageExtraWaitingSec: 0,
    lossAmount,
    lossMagnitudeBps,
    fireSaleDiscountLoss: 0,
    minimumLiquidityBufferRatioBps: 5_000,
    liquidityBufferDepletionBps: 5_000,
    firstLiquidityBufferExhaustionAt: null,
    ...overrides,
  };
}

function outcome(treatmentId: string, funds: FundRunOutcome[]): RunOutcomeMetrics {
  return {
    schemaVersion: 1,
    treatmentId,
    regimeId: 'R1',
    replicateId: 7,
    scenarioId: 'scenario-7',
    shockAt: 1_000,
    windowDays: 30,
    detection: {
      fundId: 'fund-001',
      shockAt: 1_000,
      system: { status: 'censored', reason: 'threshold_not_crossed' },
      regulatorDisclosure: { status: 'censored', reason: 'threshold_not_crossed' },
      publicDisclosure: { status: 'censored', reason: 'threshold_not_crossed' },
      publicObservation: { status: 'censored', reason: 'threshold_not_crossed' },
    },
    funds,
  };
}

test('computes paired redemption acceleration and spillover scope on unshocked funds', () => {
  const treatment = outcome('network-on', [
    fund('fund-001', true, 2_000, 1_000),
    fund('fund-002', false, 800, 500),
    fund('fund-003', false, 300, 100),
  ]);
  const counterfactual = outcome('network-off', [
    fund('fund-001', true, 1_000, 1_000),
    fund('fund-002', false, 200, 100),
    fund('fund-003', false, 400, 100),
  ]);
  assert.equal(redemptionAccelerationBps(treatment, counterfactual), 500);
  assert.deepEqual(spilloverScope(treatment, counterfactual, 500), {
    thresholdBps: 500,
    unshockedFundCount: 2,
    meanContinuousSpilloverBps: 250,
    affectedFundCount: 1,
    affectedFundShareBps: 5_000,
    byFund: [
      {
        fundId: 'fund-002',
        shocked: false,
        treatmentRequestRateBps: 800,
        counterfactualRequestRateBps: 200,
        excessRequestRateBps: 600,
      },
      {
        fundId: 'fund-003',
        shocked: false,
        treatmentRequestRateBps: 300,
        counterfactualRequestRateBps: 400,
        excessRequestRateBps: -100,
      },
    ],
  });
  assert.deepEqual(
    publicControlSpillover(treatment, counterfactual, 500),
    spilloverScope(treatment, counterfactual, 500),
  );
  assert.equal(spilloverScope(treatment, counterfactual, 600).affectedFundCount, 0);
});

test('reports absolute and relative paired loss reduction including negative effects', () => {
  const noControl = outcome('no-control', [
    fund('fund-001', true, 0, 2_000),
    fund('fund-002', false, 0, 1_000),
  ]);
  const control = outcome('control', [
    fund('fund-001', true, 0, 1_000),
    fund('fund-002', false, 0, 500),
  ]);
  assert.deepEqual(lossReduction(control, noControl), {
    noControlLossMagnitudeBps: 1_500,
    controlLossMagnitudeBps: 750,
    absoluteReductionBps: 750,
    relativeReductionBps: 5_000,
  });
  assert.equal(lossReduction(noControl, control).absoluteReductionBps, -750);
  const noLoss = outcome('no-loss', [fund('fund-001', true, 0, 0)]);
  assert.equal(lossReduction(noLoss, noLoss).relativeReductionBps, null);
});

test('aggregates the three mentor-confirmed control-cost components', () => {
  const controlled = outcome('control', [
    fund('fund-001', true, 1_000, 0, {
      cumulativeLatentRequestedShares: 2_000,
      blockedSharesByGate: 1_000,
      pendingShares: 250,
      settlementDelay: {
        settledRequestCount: 2,
        meanSec: 100,
        medianSec: 100,
        p95Sec: 100,
      },
      totalExtraWaitingSec: 200,
      averageExtraWaitingSec: 100,
    }),
    fund('fund-002', false, 1_000, 0, {
      cumulativeLatentRequestedShares: 1_000,
      pendingShares: 250,
      settlementDelay: {
        settledRequestCount: 1,
        meanSec: 400,
        medianSec: 400,
        p95Sec: 400,
      },
      totalExtraWaitingSec: 400,
      averageExtraWaitingSec: 400,
    }),
  ]);
  assert.deepEqual(controlCost(controlled), {
    gateFrozenShareRatioBps: 3_333,
    averageExtraWaitingSec: 200,
    pendingRateBps: 2_500,
  });
  assert.equal(controlCost(outcome('empty', [fund('fund-001', true, 0, 0, {
    settlementDelay: {
      settledRequestCount: 0,
      meanSec: null,
      medianSec: null,
      p95Sec: null,
    },
    averageExtraWaitingSec: null,
  })])).averageExtraWaitingSec, null);
});

test('fails fast when scenario pairing is broken', () => {
  const baseline = outcome('baseline', [fund('fund-001', true, 0, 0)]);
  assert.throws(() => redemptionAccelerationBps(
    baseline,
    { ...baseline, scenarioId: 'other' },
  ), /UNPAIRED_OUTCOME_METRICS/);
  assert.throws(() => lossReduction(
    { ...baseline, funds: [{ ...baseline.funds[0]!, initialAum: 99_999 }] },
    baseline,
  ), /PAIRED_OUTCOME_INITIAL_STATE_MISMATCH/);
});
