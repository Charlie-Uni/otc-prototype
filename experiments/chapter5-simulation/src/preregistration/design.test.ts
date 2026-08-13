import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { parseFormalExperimentDesign } from './design';

const read = (path: string): unknown => JSON.parse(readFileSync(
  new URL(`../../config/${path}`, import.meta.url),
  'utf8',
));

test('formal baseline uses only the pilot-selected behavior and demand parameters', () => {
  const config = parseSimulationConfig(read('formal-baseline.json'));
  assert.equal(config.behavior.coefficients.interceptLogOdds, -5.293304824724492);
  assert.equal(config.liquidity.redemptionRequestFractionBps, 1_000);
  assert.deepEqual([
    config.propagation.investorOverlapTransmissionBps,
    config.propagation.publicRiskTransmissionBps,
    config.propagation.publicControlTransmissionBps,
  ], [500, 500, 500]);
  assert.equal(config.propagation.sharedAssetPassThroughBps, 10_000);
});

test('design covers the policy packages, seven ablations, and required robustness dimensions', () => {
  const design = parseFormalExperimentDesign(read('formal-experiment-design.json'));
  assert.deepEqual(design.primaryPolicy.regimeIds, ['R0', 'R1', 'R2', 'R3', 'R4']);
  assert.deepEqual(design.primaryPolicy.valuationShockBps, [1_000, 2_000, 3_000]);
  assert.deepEqual(
    design.ablations.map(({ id }) => id),
    ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
  );
  assert.equal(design.controlExperimentKappaBps, 1_500);
  assert.deepEqual(
    design.ablations.find(({ id }) => id === 'A6')?.fixedChanges,
    [{ path: 'config.thresholds.baselineKappaBps', value: 1_500 }],
  );
  assert.deepEqual(
    design.ablations.find(({ id }) => id === 'A7'),
    {
      id: 'A7',
      label: 'signal-analogy channel on versus off',
      regimeId: 'R1',
      changedPath: 'config.propagation.channels.signalAnalogy',
      baselineValue: true,
      comparisonValue: false,
      fixedChanges: [],
      hypothesisIds: ['H4b'],
    },
  );
  assert.deepEqual(
    design.ablations
      .filter(({ id }) => id === 'A4' || id === 'A5')
      .map(({ hypothesisIds }) => hypothesisIds),
    [['H4a'], ['H4a']],
  );
  const scans = new Set(design.robustnessScans.map(({ id }) => id));
  for (const required of [
    'NETWORK_SCALE',
    'INVESTOR_OVERLAP',
    'ILLIQUID_ASSET_SHARE',
    'NAV_UPDATE_FREQUENCY',
    'SETTLEMENT_DELAY',
    'CONTROL_KAPPA',
    'CONTROL_PHI',
    'RISK_WEIGHTS',
    'MAX_STALE_AGE',
    'ORACLE_LATENCY',
    'EXECUTION_FAILURE',
    'PROXIMITY_WEIGHTS',
    'SHOCK_TYPE',
  ]) assert.ok(scans.has(required), required);
});
