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
