import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePilotCalibrationConfig } from './config';

const input = JSON.parse(readFileSync(
  new URL('../../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown;

test('parses the exploratory calibration grid and precision plan', () => {
  const config = parsePilotCalibrationConfig(input);
  assert.equal(config.interceptLogOdds.length, 3);
  assert.equal(config.redemptionRequestFractionBps.length, 3);
  assert.equal(config.demandTransmissionBps.length, 3);
  assert.equal(config.baselineValuationShockBps, 2_000);
  assert.equal(config.detectionThresholdCalibration.candidatesBps.length, 9);
  assert.equal(config.validationReplicates, 100);
});

test('rejects duplicated grid values and unknown fields', () => {
  const config = parsePilotCalibrationConfig(input);
  assert.throws(() => parsePilotCalibrationConfig({
    ...config,
    interceptLogOdds: [config.interceptLogOdds[0], config.interceptLogOdds[0]],
  }), /DUPLICATE_CALIBRATION_INTERCEPT/);
  assert.throws(() => parsePilotCalibrationConfig({
    ...config,
    demandTransmissionBps: [250, 250],
  }), /DUPLICATE_CALIBRATION_DEMAND_TRANSMISSION/);
  assert.throws(() => parsePilotCalibrationConfig({
    ...config,
    detectionThresholdCalibration: {
      ...config.detectionThresholdCalibration,
      candidatesBps: [400, 300],
    },
  }), /DETECTION_THRESHOLDS_NOT_ASCENDING/);
  assert.throws(() => parsePilotCalibrationConfig({ ...config, conclusion: 'R1 > R0' }));
});
