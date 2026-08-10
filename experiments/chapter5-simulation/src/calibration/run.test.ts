import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { parsePilotCalibrationConfig } from './config';
import { assemblePilotCalibrationReport, runPilotCalibration } from './run';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const fullCalibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);

test('runs a deterministic non-gating calibration and precision-planning cycle', {
  timeout: 20_000,
}, () => {
  const calibration = parsePilotCalibrationConfig({
    ...fullCalibration,
    screeningReplicates: 1,
    validationReplicates: 2,
    windowDays: 3,
    interceptLogOdds: [-4.59511985013459],
    redemptionRequestFractionBps: [2_500],
    demandTransmissionBps: [500],
    technicalBounds: {
      maximumNoShockAcceptedRequestRateBps: 10_000,
      maximumPeakRequestPressureBps: 10_000,
      minimumMeanRegimeLatentDemandRangeBps: 0,
    },
  });
  const first = runPilotCalibration(baseline, calibration);
  const second = runPilotCalibration(baseline, calibration);
  assert.equal(first.screening.observations.length, 6);
  assert.equal(first.validation.observations.length, 12);
  assert.equal(first.validation.detectionThreshold?.baselineValuationShockBps, 2_000);
  assert.equal(first.validation.precisionRecommendations.length, 3);
  assert.equal(first.formalFindingsAllowed, false);
  assert.equal(first.semanticDigestSha256, second.semanticDigestSha256);
  assert.deepEqual(first, second);
  assert.throws(() => assemblePilotCalibrationReport(
    baseline,
    calibration,
    first.screening.observations.slice(1),
    first.validation.observations,
  ), /INCOMPLETE_SCREENING_CALIBRATION_MATRIX/);
  assert.throws(() => assemblePilotCalibrationReport(
    baseline,
    calibration,
    [first.screening.observations[0]!, ...first.screening.observations],
    first.validation.observations,
  ), /DUPLICATE_SCREENING_CALIBRATION_OBSERVATION/);
});

test('reports no selected candidate when technical identifiability fails', () => {
  const calibration = parsePilotCalibrationConfig({
    ...fullCalibration,
    screeningReplicates: 1,
    validationReplicates: 1,
    windowDays: 1,
    interceptLogOdds: [-20],
    redemptionRequestFractionBps: [1],
    demandTransmissionBps: [0],
    technicalBounds: {
      maximumNoShockAcceptedRequestRateBps: 10_000,
      maximumPeakRequestPressureBps: 10_000,
      minimumMeanRegimeLatentDemandRangeBps: 10_000,
    },
  });
  const report = runPilotCalibration(baseline, calibration);
  assert.equal(report.screening.selectedCandidateId, null);
  assert.equal(report.validation.detectionThreshold, null);
  assert.deepEqual(report.validation.observations, []);
  assert.deepEqual(report.validation.precisionRecommendations, []);
});
