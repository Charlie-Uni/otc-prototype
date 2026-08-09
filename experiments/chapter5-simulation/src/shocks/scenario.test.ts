import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { createValuationShockScenarios } from './scenario';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);

test('creates three magnitude cells with one paired shock time and target fund', () => {
  const scenarios = createValuationShockScenarios(config, network, 7);
  assert.deepEqual(scenarios.map(({ navDropBps }) => navDropBps), [1_000, 2_000, 3_000]);
  assert.equal(new Set(scenarios.map(({ shockAt }) => shockAt)).size, 1);
  assert.equal(new Set(scenarios.map(({ targetFundId }) => targetFundId)).size, 1);
  assert.equal(new Set(scenarios.map(({ replicateId }) => replicateId)).size, 1);
  assert.ok(scenarios.every(({ cycleOffsetSec }) => (
    cycleOffsetSec >= 0 && cycleOffsetSec < config.shock.r0CycleSec
  )));
  assert.deepEqual(scenarios[0], {
    scenarioId: 'valuation-r000007-m1000',
    shockType: 'valuation',
    replicateId: 7,
    targetFundId: 'fund-009',
    shockAt: 1_800_004_304,
    cycleOffsetSec: 119_504,
    navDropBps: 1_000,
  });
});

test('balances the shocked fund exactly within each block of ten replicates', () => {
  const targets = Array.from({ length: network.funds.length }, (_, replicateId) => (
    createValuationShockScenarios(config, network, replicateId)[0]!.targetFundId
  ));
  assert.deepEqual(new Set(targets), new Set(network.funds.map(({ id }) => id)));
});

test('is deterministic and independent of transparency regime labels', () => {
  const first = createValuationShockScenarios(config, network, 11);
  const second = createValuationShockScenarios(config, network, 11);
  assert.deepEqual(second, first);
  assert.ok(first.every((scenario) => !('regimeId' in scenario)));
});

test('samples the complete R0 cycle at second rather than day resolution', () => {
  const offsets = Array.from({ length: 100 }, (_, replicateId) => (
    createValuationShockScenarios(config, network, replicateId)[0]!.cycleOffsetSec
  ));
  assert.ok(offsets.every((offset) => offset >= 0 && offset < 604_800));
  assert.ok(offsets.some((offset) => offset % 86_400 !== 0));
  assert.ok(new Set(offsets).size > 90);
});

test('rejects invalid replicate identifiers', () => {
  assert.throws(
    () => createValuationShockScenarios(config, network, -1),
    /INVALID_SHOCK_REPLICATE_ID/,
  );
});
