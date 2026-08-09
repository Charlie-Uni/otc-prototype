import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSPARENCY_REGIMES,
  controlDisclosureAllowedFor,
  disclosureTimeFor,
} from './risk/regimes';
import {
  CHAPTER3_WEIGHT_SCHEMES,
  computeWeightedRiskScoreBps,
  runRiskSensitivity,
} from './simulation/sensitivity';
import {
  firstScheduledObservationAt,
  publicThresholdIsIdentifiable,
} from './simulation/observation';

test('reproduces the Chapter 3 integer score vector exactly', () => {
  const score = computeWeightedRiskScoreBps({
    valuationHaircutBps: 1_000,
    redemptionPressureBps: 2_000,
    redemptionQueueRatioBps: 3_000,
    liquidityShortfallBps: 4_000,
    stalePricingRiskBps: 5_000,
    investorConcentrationBps: 6_000,
  }, CHAPTER3_WEIGHT_SCHEMES[0].weightBps);
  assert.equal(score, 3_499);
});

test('locks the distinct detection and intervention boundary operators', () => {
  const [row] = runRiskSensitivity({
    metricsWithoutStale: {
      valuationHaircutBps: 6_000,
      redemptionPressureBps: 6_000,
      redemptionQueueRatioBps: 6_000,
      liquidityShortfallBps: 6_000,
      investorConcentrationBps: 6_000,
    },
    staleAgeSecRaw: 18 * 86_400,
    maxStaleAgeDays: [30],
    weightSchemes: [CHAPTER3_WEIGHT_SCHEMES[0]],
    detectionThresholdBps: 6_000,
    kappaBpsValues: [6_000],
  });
  assert.equal(row.riskScoreBps, 6_000);
  assert.equal(row.detected, true, 'detection uses score >= tau');
  assert.equal(row.interventionTriggered, false, 'intervention uses score > kappa');
});

test('reproduces the frozen R0-R4 transparency packages', () => {
  assert.deepEqual(TRANSPARENCY_REGIMES, {
    R0: {
      id: 'R0',
      label: 'low_frequency_disclosure',
      frequencySec: 604_800,
      visibility: 'public',
      granularity: 'aggregate',
      delaySec: 0,
      controlDisclosure: 'delayed',
    },
    R1: {
      id: 'R1',
      label: 'fully_real_time_public',
      frequencySec: 0,
      visibility: 'public',
      granularity: 'detailed',
      delaySec: 0,
      controlDisclosure: 'public',
    },
    R2: {
      id: 'R2',
      label: 'regulator_real_time_investor_aggregate',
      frequencySec: 0,
      visibility: 'role_based',
      granularity: 'aggregate',
      delaySec: 0,
      controlDisclosure: 'private',
    },
    R3: {
      id: 'R3',
      label: 'delayed_public_disclosure',
      frequencySec: 0,
      visibility: 'public',
      granularity: 'detailed',
      delaySec: 86_400,
      controlDisclosure: 'delayed',
    },
    R4: {
      id: 'R4',
      label: 'tiered_lifecycle_transparency',
      frequencySec: 0,
      visibility: 'tiered',
      granularity: 'tiered',
      delaySec: 0,
      controlDisclosure: 'tiered',
    },
  });
});

test('reproduces Chapter 3 disclosure and observation timing', () => {
  assert.equal(disclosureTimeFor(1, TRANSPARENCY_REGIMES.R0), 604_800);
  assert.equal(disclosureTimeFor(1_000, TRANSPARENCY_REGIMES.R1), 1_000);
  assert.equal(disclosureTimeFor(1_000, TRANSPARENCY_REGIMES.R2), 1_000);
  assert.equal(disclosureTimeFor(1_000, TRANSPARENCY_REGIMES.R3), 87_400);
  assert.equal(disclosureTimeFor(1_000, TRANSPARENCY_REGIMES.R4), 1_000);
  assert.equal(firstScheduledObservationAt(1_101, 1_000, 60), 1_120);
});

test('preserves threshold censoring and R4 control disclosure semantics', () => {
  assert.equal(publicThresholdIsIdentifiable('detailed', 6_500), true);
  assert.equal(publicThresholdIsIdentifiable('aggregate', 6_500), false);
  assert.equal(publicThresholdIsIdentifiable('tiered', 6_500), false);
  assert.equal(publicThresholdIsIdentifiable('aggregate', 6_000), true);
  assert.equal(controlDisclosureAllowedFor(TRANSPARENCY_REGIMES.R4, {
    audience: 'public',
    currentGated: false,
    riskScoreBps: 3_000,
    eventName: null,
  }), false);
  assert.equal(controlDisclosureAllowedFor(TRANSPARENCY_REGIMES.R4, {
    audience: 'public',
    currentGated: true,
    riskScoreBps: 7_000,
    eventName: 'GateTriggered',
  }), true);
});
