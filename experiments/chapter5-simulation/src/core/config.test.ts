import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from './config';

const baseline = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown;

test('accepts the mentor-approved pilot baseline', () => {
  const config = parseSimulationConfig(baseline);
  assert.equal(config.time.tickSec, 86_400);
  assert.deepEqual(config.time.robustnessWindowDays, [60, 90]);
  assert.equal(config.network.fundCount, 10);
  assert.equal(config.network.investorCount, 200);
  assert.equal(config.network.assetClassCount, 5);
  assert.equal(config.network.sharedInvestorCoreBps, 3_000);
  assert.equal(config.heterogeneity.holderCountPerFund, 20);
  assert.equal(config.monteCarlo.formalMinimumReplicatesPerCell, 500);
  assert.equal(config.shock.r0CycleSec, 604_800);
  assert.deepEqual(config.shock.navDropBps, [1_000, 2_000, 3_000]);
  assert.equal(config.shock.cycleStartAt % config.shock.r0CycleSec, 0);
  assert.deepEqual(config.risk.weightBps, [1_667, 1_667, 1_667, 1_667, 1_666, 1_666]);
  assert.equal(config.risk.maxStaleAgeDays, 30);
  assert.equal(config.oracle.baselineLatencySec, 0);
  assert.equal(config.oracle.baselineExecutionFailureBps, 0);
  assert.equal(config.thresholds.baselineKappaBps, 7_000);
});

test('rejects formal and robustness replication counts below the approved minima', () => {
  const value = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  value.monteCarlo.formalMinimumReplicatesPerCell = 499;
  value.monteCarlo.keyRobustnessReplicatesPerCell = 999;
  assert.throws(() => parseSimulationConfig(value), /FORMAL_REPLICATES_BELOW_MENTOR_MINIMUM/);
});

test('rejects analysis windows outside the simulation horizon', () => {
  const value = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  value.time.primaryWindowDays = 91;
  assert.throws(() => parseSimulationConfig(value), /PRIMARY_WINDOW_EXCEEDS_HORIZON/);
});

test('rejects unordered heterogeneity tiers', () => {
  const value = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  value.heterogeneity.navUpdateIntervalDaysByStalePricingTier = {
    low: 14,
    medium: 7,
    high: 1,
  };
  assert.throws(() => parseSimulationConfig(value), /STALE_PRICING_TIERS_NOT_ORDERED/);
});

test('rejects a network without enough investors for the declared overlap design', () => {
  const value = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  value.network.investorCount = 145;
  assert.throws(() => parseSimulationConfig(value), /INSUFFICIENT_INVESTORS_FOR_OVERLAP_DESIGN/);
});

test('rejects unordered magnitudes and a shock cycle not aligned to the R0 epoch', () => {
  const unordered = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  unordered.shock.navDropBps = [2_000, 1_000];
  assert.throws(() => parseSimulationConfig(unordered), /SHOCK_MAGNITUDES_NOT_ASCENDING/);

  const unaligned = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  unaligned.shock.cycleStartAt = 1_799_884_801;
  assert.throws(() => parseSimulationConfig(unaligned), /SHOCK_CYCLE_START_NOT_R0_ALIGNED/);
});

test('rejects invalid risk weights and a baseline kappa outside the scan', () => {
  const weights = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  weights.risk.weightBps = [1, 1, 1, 1, 1, 1];
  assert.throws(() => parseSimulationConfig(weights), /RISK_WEIGHTS_MUST_SUM_10000/);

  const kappa = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  kappa.thresholds.baselineKappaBps = 7_001;
  assert.throws(() => parseSimulationConfig(kappa), /BASELINE_KAPPA_NOT_IN_SCAN/);
});

test('bounds Oracle retries so one tick cannot create an unbounded attempt loop', () => {
  const value = structuredClone(baseline) as Record<string, Record<string, unknown>>;
  value.oracle.maxAttempts = 17;
  assert.throws(() => parseSimulationConfig(value), /ORACLE_MAX_ATTEMPTS_EXCEEDED/);
});
