import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { parsePilotCalibrationConfig } from './config';
import { precisionRecommendations } from './precision';
import type { CalibrationObservation } from './types';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const calibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);

function observation(
  replicateId: number,
  regimeId: CalibrationObservation['regimeId'],
  lagSec: number | null,
): CalibrationObservation {
  return {
    candidateId: 'candidate',
    replicateId,
    regimeId,
    acceptedRequestRateBps: replicateId * 10 + 100,
    latentRequestRateBps: 200,
    peakRequestPressureBps: 300,
    lossMagnitudeBps: replicateId * 20 + 400,
    regulatorDetectionLagSec: lagSec,
    regulatorDetectionCensored: lagSec === null,
    regulatorDetectionLagSecByThresholdBps: Object.fromEntries(
      calibration.detectionThresholdCalibration.candidatesBps.map((thresholdBps) => [
        String(thresholdBps),
        lagSec,
      ]),
    ),
    runDigestSha256: `${replicateId}`.padStart(64, '0'),
  };
}

test('marks precision unavailable instead of treating fully censored pairs as zero variance', () => {
  const observations = [0, 1].flatMap((replicateId) => [
    observation(replicateId, 'R0', 604_800),
    observation(replicateId, 'R1', 0),
    observation(replicateId, 'R2', 0),
    observation(replicateId, 'R3', null),
    observation(replicateId, 'R4', 0),
  ]);
  const recommendations = precisionRecommendations(observations, baseline, calibration, 400);
  const detection = recommendations.find(({ metricId }) => (
    metricId === 'regulatorDetectionLagSec'
  ));
  assert.equal(detection?.status, 'unavailable');
  assert.equal(detection?.pilotPairsByRegime.R0, 2);
  assert.equal(detection?.pilotPairsByRegime.R3, 0);
  assert.equal(detection?.recommendedReplicates, null);
  assert.ok(recommendations.filter(({ status }) => status === 'estimated').length >= 2);
});
