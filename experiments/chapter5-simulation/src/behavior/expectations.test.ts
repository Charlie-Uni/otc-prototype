import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedOthersRedeemBps } from './expectations';

const weights = [4_000, 3_000, 3_000] as const;
const baseline = {
  publicRiskSignalBps: 2_000,
  signalSynchronicityBps: 5_000,
  laggedRedemptionPressureBps: 1_000,
};

test('computes the configured convex combination in basis points', () => {
  assert.equal(expectedOthersRedeemBps(baseline, weights), 2_600);
  assert.equal(expectedOthersRedeemBps({
    publicRiskSignalBps: 10_000,
    signalSynchronicityBps: 10_000,
    laggedRedemptionPressureBps: 10_000,
  }, weights), 10_000);
});

test('is weakly increasing in every strategic-complementarity input', () => {
  const baseValue = expectedOthersRedeemBps(baseline, weights);
  const variants = [
    { ...baseline, publicRiskSignalBps: 2_001 },
    { ...baseline, signalSynchronicityBps: 5_001 },
    { ...baseline, laggedRedemptionPressureBps: 1_001 },
  ];
  variants.forEach((variant) => {
    assert.ok(expectedOthersRedeemBps(variant, weights) >= baseValue);
  });
});

test('rejects invalid inputs and non-convex weights', () => {
  assert.throws(
    () => expectedOthersRedeemBps({ ...baseline, publicRiskSignalBps: 10_001 }, weights),
    /INVALID_PUBLIC_RISK_SIGNAL_BPS/,
  );
  assert.throws(
    () => expectedOthersRedeemBps(baseline, [1, 1, 1]),
    /EXPECTATION_WEIGHTS_MUST_SUM_10000/,
  );
});
