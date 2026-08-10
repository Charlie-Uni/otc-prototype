import { TRANSPARENCY_REGIME_IDS, type TransparencyRegimeId } from '../artifact/risk/regimes';
import type {
  CalibrationObservation,
  DetectionThresholdCalibrationSummary,
  PilotCalibrationConfig,
} from './types';

export function thresholdKey(thresholdBps: number): string {
  if (!Number.isInteger(thresholdBps) || thresholdBps < 0 || thresholdBps > 10_000) {
    throw new Error('INVALID_CALIBRATION_DETECTION_THRESHOLD');
  }
  return String(thresholdBps);
}

export function regulatorDetectionLagAtThreshold(
  observation: CalibrationObservation,
  thresholdBps: number,
): number | null {
  const key = thresholdKey(thresholdBps);
  if (!(key in observation.regulatorDetectionLagSecByThresholdBps)) {
    throw new Error('MISSING_CALIBRATION_DETECTION_THRESHOLD');
  }
  return observation.regulatorDetectionLagSecByThresholdBps[key] ?? null;
}

function detectionRateBps(
  observations: readonly CalibrationObservation[],
  thresholdBps: number,
): number {
  if (observations.length === 0) throw new Error('EMPTY_DETECTION_CALIBRATION_CELL');
  const detected = observations.filter((observation) => (
    regulatorDetectionLagAtThreshold(observation, thresholdBps) !== null
  )).length;
  return Math.floor((detected * 10_000) / observations.length);
}

export function summarizeDetectionThresholdCalibration(
  observations: readonly CalibrationObservation[],
  calibration: PilotCalibrationConfig,
): DetectionThresholdCalibrationSummary {
  const expectedReplicates = calibration.validationReplicates;
  const noShock = observations.filter(({ regimeId }) => regimeId === 'NO_SHOCK');
  if (noShock.length !== expectedReplicates) {
    throw new Error('INCOMPLETE_NO_SHOCK_DETECTION_CALIBRATION');
  }
  const byRegime = Object.fromEntries(TRANSPARENCY_REGIME_IDS.map((regimeId) => {
    const rows = observations.filter((observation) => observation.regimeId === regimeId);
    if (rows.length !== expectedReplicates) {
      throw new Error('INCOMPLETE_REGIME_DETECTION_CALIBRATION');
    }
    return [regimeId, rows];
  })) as Record<TransparencyRegimeId, CalibrationObservation[]>;
  const candidates = calibration.detectionThresholdCalibration.candidatesBps.map(
    (thresholdBps) => {
      const shockDetectionRateBpsByRegime = Object.fromEntries(
        TRANSPARENCY_REGIME_IDS.map((regimeId) => [
          regimeId,
          detectionRateBps(byRegime[regimeId], thresholdBps),
        ]),
      ) as Record<TransparencyRegimeId, number>;
      const minimumShockDetectionRateBps = Math.min(
        ...Object.values(shockDetectionRateBpsByRegime),
      );
      return {
        thresholdBps,
        noShockDetectionRateBps: detectionRateBps(noShock, thresholdBps),
        shockDetectionRateBpsByRegime,
        minimumShockDetectionRateBps,
        eligible: minimumShockDetectionRateBps
          >= calibration.detectionThresholdCalibration.minimumShockDetectionRateBps,
      };
    },
  );
  return {
    baselineValuationShockBps: calibration.baselineValuationShockBps,
    minimumRequiredShockDetectionRateBps:
      calibration.detectionThresholdCalibration.minimumShockDetectionRateBps,
    candidates,
    selectedThresholdBps: candidates.filter(({ eligible }) => eligible).at(-1)?.thresholdBps
      ?? null,
  };
}
