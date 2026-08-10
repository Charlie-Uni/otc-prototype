import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  parseControlThresholdCalibrationConfig,
  parseControlThresholdEvidence,
  selectControlExperimentKappa,
} from './control-threshold';

const input = JSON.parse(readFileSync(
  new URL('../../config/control-threshold-calibration.json', import.meta.url),
  'utf8',
));

test('selects the technically interior control threshold without using no-shock outcomes', () => {
  const config = parseControlThresholdCalibrationConfig(input);
  const counts = new Map(config.candidateKappaBps.map((kappaBps) => [
    kappaBps,
    { shocked: kappaBps === 1_500 ? 48 : 0, noShock: kappaBps === 1_500 ? 99 : 0 },
  ]));
  counts.set(1_250, { shocked: 55, noShock: 0 });
  const selected = selectControlExperimentKappa(config, counts);
  assert.equal(selected.selectedKappaBps, 1_500);
  assert.equal(
    selected.reachability.find(({ kappaBps }) => kappaBps === 1_500)?.noShockActivationRateBps,
    9_900,
  );
});

test('rejects incomplete counts and unordered candidates', () => {
  const config = parseControlThresholdCalibrationConfig(input);
  assert.throws(
    () => selectControlExperimentKappa(config, new Map()),
    /MISSING_CONTROL_THRESHOLD_COUNT/,
  );
  assert.throws(
    () => parseControlThresholdCalibrationConfig({
      ...input,
      candidateKappaBps: [1_500, 1_000],
    }),
    /CONTROL_THRESHOLD_CANDIDATES_NOT_ASCENDING/,
  );
});

test('validates the archived reachability evidence against the locked selection rule', () => {
  const config = parseControlThresholdCalibrationConfig(input);
  const evidence = JSON.parse(readFileSync(
    new URL('../../spec/control-threshold-calibration-evidence.json', import.meta.url),
    'utf8',
  ));
  assert.equal(parseControlThresholdEvidence(config, evidence).selectedKappaBps, 1_500);
  const corrupted = structuredClone(evidence);
  corrupted.reachability[2].shockedActivationCount = 49;
  assert.throws(
    () => parseControlThresholdEvidence(config, corrupted),
    /CONTROL_THRESHOLD_EVIDENCE_MISMATCH/,
  );
});
