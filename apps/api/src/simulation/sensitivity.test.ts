import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAPTER3_KAPPA_BPS_VALUES,
  CHAPTER3_MAX_STALE_AGE_DAYS,
  CHAPTER3_WEIGHT_SCHEMES,
  computeWeightedRiskScoreBps,
  runRiskSensitivity,
} from './sensitivity';

test('equal baseline weights sum exactly to 10000 and reproduce chain integer scoring', () => {
  const score = computeWeightedRiskScoreBps(
    {
      valuationHaircutBps: 1_000,
      redemptionPressureBps: 2_000,
      redemptionQueueRatioBps: 3_000,
      liquidityShortfallBps: 4_000,
      stalePricingRiskBps: 5_000,
      investorConcentrationBps: 6_000,
    },
    CHAPTER3_WEIGHT_SCHEMES[0].weightBps,
  );
  assert.equal(score, 3_499);
  assert.equal(CHAPTER3_WEIGHT_SCHEMES[0].weightBps.reduce((sum, weight) => sum + weight, 0), 10_000);
});

test('generates the full 4-by-2-by-4 stale-age, weight, and kappa sensitivity matrix', () => {
  const rows = runRiskSensitivity({
    metricsWithoutStale: {
      valuationHaircutBps: 9_000,
      redemptionPressureBps: 9_000,
      redemptionQueueRatioBps: 1_800,
      liquidityShortfallBps: 10_000,
      investorConcentrationBps: 3_000,
    },
    staleAgeSecRaw: 14 * 24 * 60 * 60,
    maxStaleAgeDays: CHAPTER3_MAX_STALE_AGE_DAYS,
    weightSchemes: CHAPTER3_WEIGHT_SCHEMES,
    detectionThresholdBps: 6_000,
    kappaBpsValues: CHAPTER3_KAPPA_BPS_VALUES,
  });

  assert.equal(rows.length, 32);
  assert.deepEqual(
    rows.filter((row) => row.weightSchemeId === 'equal_weight_baseline')
      .filter((row) => row.kappaBps === 7_000)
      .map((row) => row.stalePricingRiskBps),
    [10_000, 10_000, 4_666, 3_111],
  );
  assert.deepEqual([...new Set(rows.map((row) => row.kappaBps))], [5_000, 6_000, 7_000, 8_000]);
  assert.ok(rows.every((row) => row.staleAgeSecRaw === 14 * 24 * 60 * 60));
});

test('keeps detection threshold and intervention kappa as separate comparisons', () => {
  const [row] = runRiskSensitivity({
    metricsWithoutStale: {
      valuationHaircutBps: 6_000,
      redemptionPressureBps: 6_000,
      redemptionQueueRatioBps: 6_000,
      liquidityShortfallBps: 6_000,
      investorConcentrationBps: 6_000,
    },
    staleAgeSecRaw: 7 * 24 * 60 * 60,
    maxStaleAgeDays: [7],
    weightSchemes: [CHAPTER3_WEIGHT_SCHEMES[0]],
    detectionThresholdBps: 6_000,
    kappaBpsValues: [7_000],
  });

  assert.equal(row.riskScoreBps, 6_666);
  assert.equal(row.detected, true);
  assert.equal(row.interventionTriggered, false);
});

test('scans intervention kappa independently while preserving the same risk score', () => {
  const rows = runRiskSensitivity({
    metricsWithoutStale: {
      valuationHaircutBps: 7_800,
      redemptionPressureBps: 7_800,
      redemptionQueueRatioBps: 7_800,
      liquidityShortfallBps: 7_800,
      investorConcentrationBps: 7_800,
    },
    staleAgeSecRaw: 0,
    maxStaleAgeDays: [30],
    weightSchemes: [CHAPTER3_WEIGHT_SCHEMES[0]],
    detectionThresholdBps: 5_000,
    kappaBpsValues: [5_000, 6_000, 7_000],
  });

  assert.deepEqual(rows.map((row) => row.riskScoreBps), [6_500, 6_500, 6_500]);
  assert.deepEqual(rows.map((row) => row.interventionTriggered), [true, true, false]);
  assert.deepEqual(rows.map((row) => row.detected), [true, true, true]);
});

test('rejects duplicate and unbounded kappa sensitivity inputs', () => {
  const input = {
    metricsWithoutStale: {
      valuationHaircutBps: 1_000,
      redemptionPressureBps: 1_000,
      redemptionQueueRatioBps: 1_000,
      liquidityShortfallBps: 1_000,
      investorConcentrationBps: 1_000,
    },
    staleAgeSecRaw: 0,
    maxStaleAgeDays: [30],
    weightSchemes: CHAPTER3_WEIGHT_SCHEMES,
    detectionThresholdBps: 6_000,
  } as const;

  assert.throws(
    () => runRiskSensitivity({ ...input, kappaBpsValues: [7_000, 7_000] }),
    /DUPLICATE_KAPPA_VALUES/,
  );
  assert.throws(
    () => runRiskSensitivity({
      ...input,
      kappaBpsValues: Array.from({ length: 17 }, (_, index) => index),
    }),
    /TOO_MANY_KAPPA_VALUES/,
  );
});
