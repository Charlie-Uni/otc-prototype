import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeLiquidityShortfallBps,
  computeInvestorConcentrationBps,
  computeWeightedRiskScoreBps,
  normalizeStalePricingRiskBps,
  riskLevelFor,
} from './calc';

test('normalizes stale pricing risk into bounded bps', () => {
  assert.equal(normalizeStalePricingRiskBps(15 * 24 * 60 * 60, 30 * 24 * 60 * 60), 5_000);
  assert.equal(normalizeStalePricingRiskBps(45 * 24 * 60 * 60, 30 * 24 * 60 * 60), 10_000);
});

test('computes investor concentration as HHI from full holder shares', () => {
  assert.equal(computeInvestorConcentrationBps([4_000, 3_000, 2_000, 1_000]), 3_000);
  assert.throws(() => computeInvestorConcentrationBps([5_000, 2_000]), /HOLDER_SHARES_MUST_SUM_10000/);
});

test('computes liquidity shortfall and clamps surplus buffers to zero', () => {
  assert.equal(computeLiquidityShortfallBps(6_500), 3_500);
  assert.equal(computeLiquidityShortfallBps(12_000), 0);
});

test('computes six-factor weighted risk score in thesis metric order', () => {
  const score = computeWeightedRiskScoreBps(
    {
      valuationHaircutBps: 1_000,
      redemptionPressureBps: 2_000,
      redemptionQueueRatioBps: 3_000,
      liquidityShortfallBps: 4_000,
      stalePricingRiskBps: 5_000,
      investorConcentrationBps: 6_000,
    },
    [2_000, 2_000, 2_000, 2_000, 1_000, 1_000],
  );

  assert.equal(score, 3_100);
});

test('forces public risk level to red while gate is active', () => {
  assert.equal(riskLevelFor(1_000, true), 'red');
  assert.equal(riskLevelFor(4_000, false), 'yellow');
  assert.equal(riskLevelFor(7_000, false), 'red');
});
