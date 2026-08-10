import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseFormalAnalysisPlan } from './analysis-plan';

const input = JSON.parse(readFileSync(
  new URL('../../config/formal-analysis-plan.json', import.meta.url),
  'utf8',
));

test('freezes all six hypotheses without turning expected directions into model gates', () => {
  const plan = parseFormalAnalysisPlan(input);
  assert.deepEqual(plan.hypotheses.map(({ id }) => id), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  assert.ok(plan.hypotheses.every(({ usedAsModelGate }) => !usedAsModelGate));
  assert.equal(plan.detection.anchor, 'paired_valuation_haircut_increase');
  assert.equal(plan.detection.sensitivityThresholdBps, 6_000);
  assert.equal(plan.controlExperiment.artifactPolicyBaselineKappaBps, 7_000);
  assert.equal(plan.controlExperiment.mechanismExperimentKappaBps, 1_500);
});

test('rejects result contamination and invalid supplementary weights', () => {
  assert.throws(
    () => parseFormalAnalysisPlan({ ...input, result: { H1: 'supported' } }),
    /PREREG_OUTCOME_FIELD/,
  );
  const invalid = structuredClone(input);
  invalid.supplementaryStabilityWeightSchemes[0].weightBps[0] = 2_499;
  assert.throws(() => parseFormalAnalysisPlan(invalid), /STABILITY_WEIGHTS_MUST_SUM_10000/);
});
