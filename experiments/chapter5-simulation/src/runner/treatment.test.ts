import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { createValuationShockScenarios } from '../shocks/scenario';
import {
  assertPairedRunInputs,
  assertPairedTreatments,
  createSimulationTreatment,
  sameValuationShockScenario,
  validateSimulationTreatment,
} from './treatment';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;
const config = parseSimulationConfig(baselineInput);

test('allows only declared policy-package differences', () => {
  const r0 = createSimulationTreatment('r0', config, 'R0');
  const r1 = createSimulationTreatment('r1', config, 'R1');
  assert.doesNotThrow(() => assertPairedTreatments(r0, r1, ['regime']));
  assert.throws(() => assertPairedTreatments(r0, r1, []), /UNAPPROVED_TREATMENT_DIFFERENCE/);
});

test('permits a declared channel ablation but rejects undeclared config drift', () => {
  const ablationInput = structuredClone(baselineInput);
  (ablationInput.propagation.channels as Record<string, unknown>).investorOverlap = false;
  const baseline = createSimulationTreatment('baseline', config, 'R1');
  const comparison = createSimulationTreatment(
    'no-overlap', parseSimulationConfig(ablationInput), 'R1',
  );
  assert.doesNotThrow(() => assertPairedTreatments(
    baseline,
    comparison,
    ['config.propagation.channels.investorOverlap'],
  ));
  assert.throws(
    () => assertPairedTreatments(baseline, comparison, []),
    /UNAPPROVED_TREATMENT_DIFFERENCE/,
  );
});

test('never permits paired randomness seeds to drift', () => {
  const changedInput = structuredClone(baselineInput);
  changedInput.network.networkSeed = Number(changedInput.network.networkSeed) + 1;
  const changed = createSimulationTreatment(
    'changed-seed', parseSimulationConfig(changedInput), 'R1',
  );
  assert.throws(
    () => assertPairedTreatments(
      createSimulationTreatment('baseline', config, 'R1'),
      changed,
      ['config.network.networkSeed'],
    ),
    /PAIRED_RANDOMNESS_MISMATCH:config.network.networkSeed/,
  );
});

test('requires the exact same scenario and horizon for paired runs', () => {
  const network = generateNetworkModel(config);
  const [small, medium] = createValuationShockScenarios(config, network, 0);
  const treatment = createSimulationTreatment('baseline', config, 'R1');
  assert.throws(() => assertPairedRunInputs(
    { treatment, scenario: small!, horizonDays: 10 },
    { treatment, scenario: medium!, horizonDays: 10 },
    [],
  ), /PAIRED_SCENARIO_MISMATCH/);
  assert.throws(() => assertPairedRunInputs(
    { treatment, scenario: small!, horizonDays: 10 },
    { treatment, scenario: small!, horizonDays: 11 },
    [],
  ), /PAIRED_HORIZON_MISMATCH/);
  assert.throws(() => assertPairedRunInputs(
    { treatment, scenario: small!, shockEnabled: true },
    { treatment, scenario: small!, shockEnabled: false },
    [],
  ), /PAIRED_SHOCK_ENABLEMENT_MISMATCH/);
  assert.equal(sameValuationShockScenario(small!, { ...small! }), true);
});

test('rejects malformed custom transparency packages before a run starts', () => {
  const treatment = createSimulationTreatment('custom', config, 'R1');
  assert.throws(() => validateSimulationTreatment({
    ...treatment,
    regime: { ...treatment.regime, delaySec: -1 },
  }), /INVALID_REGIME_DELAY_SEC/);
});
