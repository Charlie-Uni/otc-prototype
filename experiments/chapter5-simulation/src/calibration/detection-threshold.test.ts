import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePilotCalibrationConfig } from './config';
import {
  regulatorDetectionLagAtThreshold,
  summarizeDetectionThresholdCalibration,
} from './detection-threshold';
import type { CalibrationObservation } from './types';

const fullCalibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);

function observation(
  replicateId: number,
  regimeId: CalibrationObservation['regimeId'],
): CalibrationObservation {
  const isNoShock = regimeId === 'NO_SHOCK';
  return {
    candidateId: 'candidate',
    replicateId,
    regimeId,
    acceptedRequestRateBps: 100,
    latentRequestRateBps: 100,
    peakRequestPressureBps: 100,
    lossMagnitudeBps: isNoShock ? 0 : 2_000,
    regulatorDetectionLagSec: null,
    regulatorDetectionCensored: true,
    regulatorDetectionLagSecByThresholdBps: {
      '400': isNoShock ? null : replicateId * 100,
      '600': isNoShock || replicateId === 1 ? null : 0,
    },
    runDigestSha256: `${replicateId}`.padStart(64, '0'),
  };
}

test('selects the highest threshold meeting the preregistration coverage floor', () => {
  const calibration = parsePilotCalibrationConfig({
    ...fullCalibration,
    validationReplicates: 2,
    detectionThresholdCalibration: {
      candidatesBps: [400, 600],
      minimumShockDetectionRateBps: 7_500,
    },
  });
  const observations = [0, 1].flatMap((replicateId) => [
    observation(replicateId, 'NO_SHOCK'),
    observation(replicateId, 'R0'),
    observation(replicateId, 'R1'),
    observation(replicateId, 'R2'),
    observation(replicateId, 'R3'),
    observation(replicateId, 'R4'),
  ]);
  const summary = summarizeDetectionThresholdCalibration(observations, calibration);
  assert.equal(summary.selectedThresholdBps, 400);
  assert.equal(summary.candidates[0]?.minimumShockDetectionRateBps, 10_000);
  assert.equal(summary.candidates[1]?.minimumShockDetectionRateBps, 5_000);
  assert.equal(summary.candidates[0]?.noShockDetectionRateBps, 0);
  assert.equal(regulatorDetectionLagAtThreshold(observations[1]!, 400), 0);
  assert.throws(
    () => regulatorDetectionLagAtThreshold(observations[1]!, 800),
    /MISSING_CALIBRATION_DETECTION_THRESHOLD/,
  );
});

test('rejects an incomplete threshold calibration matrix', () => {
  const calibration = parsePilotCalibrationConfig({
    ...fullCalibration,
    validationReplicates: 2,
  });
  assert.throws(
    () => summarizeDetectionThresholdCalibration([
      observation(0, 'NO_SHOCK'),
      observation(1, 'NO_SHOCK'),
    ], calibration),
    /INCOMPLETE_REGIME_DETECTION_CALIBRATION/,
  );
});
