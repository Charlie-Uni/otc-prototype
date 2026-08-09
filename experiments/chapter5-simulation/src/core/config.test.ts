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
