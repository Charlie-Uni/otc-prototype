import type { SimulationConfig } from '../core/config';
import { semanticDigestSha256 } from '../runner/digest';
import {
  createCalibrationCandidates,
  selectCalibrationCandidate,
} from './grid';
import { summarizeDetectionThresholdCalibration } from './detection-threshold';
import { observationsForCandidate } from './observations';
import { precisionRecommendations, summariesByRegime } from './precision';
import { summarizeCalibrationCandidate } from './screening';
import type { PilotCalibrationConfig, PilotCalibrationReport } from './types';

const REGIME_ORDER = ['NO_SHOCK', 'R0', 'R1', 'R2', 'R3', 'R4'] as const;

function validateCalibrationAgainstBaseline(
  baseline: SimulationConfig,
  calibration: PilotCalibrationConfig,
): void {
  if (calibration.windowDays > baseline.time.horizonDays) {
    throw new Error('CALIBRATION_WINDOW_EXCEEDS_HORIZON');
  }
  if (!baseline.shock.navDropBps.includes(calibration.baselineValuationShockBps)) {
    throw new Error('BASELINE_CALIBRATION_SHOCK_NOT_CONFIGURED');
  }
}

function assertObservationMatrix(
  observations: PilotCalibrationReport['screening']['observations'],
  candidateIds: readonly string[],
  replicateCount: number,
  context: 'SCREENING' | 'VALIDATION',
): void {
  const expectedKeys = new Set(candidateIds.flatMap((candidateId) => (
    Array.from({ length: replicateCount }, (_, replicateId) => (
      REGIME_ORDER.map((regimeId) => `${candidateId}:${replicateId}:${regimeId}`)
    )).flat()
  )));
  const actualKeys = observations.map(({ candidateId, replicateId, regimeId }) => (
    `${candidateId}:${replicateId}:${regimeId}`
  ));
  if (new Set(actualKeys).size !== actualKeys.length) {
    throw new Error(`DUPLICATE_${context}_CALIBRATION_OBSERVATION`);
  }
  if (
    actualKeys.length !== expectedKeys.size
    || actualKeys.some((key) => !expectedKeys.has(key))
  ) throw new Error(`INCOMPLETE_${context}_CALIBRATION_MATRIX`);
}

function sortedObservations(
  observations: PilotCalibrationReport['screening']['observations'],
): PilotCalibrationReport['screening']['observations'] {
  return [...observations].sort((left, right) => (
    left.candidateId.localeCompare(right.candidateId)
      || left.replicateId - right.replicateId
      || REGIME_ORDER.indexOf(left.regimeId) - REGIME_ORDER.indexOf(right.regimeId)
  ));
}

export function summarizeCalibrationScreening(
  baseline: SimulationConfig,
  calibration: PilotCalibrationConfig,
  screeningObservations: PilotCalibrationReport['screening']['observations'],
) {
  const candidates = createCalibrationCandidates(calibration);
  const summaries = candidates.map((candidate) => summarizeCalibrationCandidate(
    candidate,
    screeningObservations,
    calibration,
  ));
  return {
    candidates,
    summaries,
    selected: selectCalibrationCandidate(summaries, baseline),
  };
}

export function assemblePilotCalibrationReport(
  baseline: SimulationConfig,
  calibration: PilotCalibrationConfig,
  screeningInput: PilotCalibrationReport['screening']['observations'],
  validationInput: PilotCalibrationReport['validation']['observations'],
  implementationDigestSha256: string | null = null,
): PilotCalibrationReport {
  validateCalibrationAgainstBaseline(baseline, calibration);
  if (
    implementationDigestSha256 !== null
    && !/^[a-f0-9]{64}$/.test(implementationDigestSha256)
  ) throw new Error('INVALID_CALIBRATION_IMPLEMENTATION_DIGEST');
  const screeningObservations = sortedObservations(screeningInput);
  const screening = summarizeCalibrationScreening(
    baseline,
    calibration,
    screeningObservations,
  );
  assertObservationMatrix(
    screeningObservations,
    screening.candidates.map(({ candidateId }) => candidateId),
    calibration.screeningReplicates,
    'SCREENING',
  );
  const selected = screening.selected;
  const validationObservations = sortedObservations(validationInput);
  if (selected) {
    assertObservationMatrix(
      validationObservations,
      [selected.candidateId],
      calibration.validationReplicates,
      'VALIDATION',
    );
  } else if (validationObservations.length !== 0) {
    throw new Error('UNEXPECTED_CALIBRATION_VALIDATION_OBSERVATIONS');
  }
  const detectionThreshold = selected
    ? summarizeDetectionThresholdCalibration(validationObservations, calibration)
    : null;
  const selectedDetectionThresholdBps = detectionThreshold?.selectedThresholdBps ?? null;
  const reportWithoutDigest = {
    schemaVersion: 1 as const,
    baselineConfigDigestSha256: semanticDigestSha256(baseline),
    calibrationConfigDigestSha256: semanticDigestSha256(calibration),
    implementationDigestSha256,
    screening: {
      observations: screeningObservations,
      candidates: screening.summaries,
      selectedCandidateId: selected?.candidateId ?? null,
    },
    validation: {
      candidate: selected,
      detectionThreshold,
      observations: validationObservations,
      summaries: selected
        ? summariesByRegime(
          validationObservations,
          calibration.precisionPlanning.zScore,
          selectedDetectionThresholdBps,
        )
        : {},
      precisionRecommendations: selected
        ? precisionRecommendations(
          validationObservations,
          baseline,
          calibration,
          selectedDetectionThresholdBps,
        )
        : [],
    },
    formalFindingsAllowed: false as const,
  };
  return {
    ...reportWithoutDigest,
    semanticDigestSha256: semanticDigestSha256(reportWithoutDigest),
  };
}

export function runPilotCalibration(
  baseline: SimulationConfig,
  calibration: PilotCalibrationConfig,
): PilotCalibrationReport {
  validateCalibrationAgainstBaseline(baseline, calibration);
  const candidates = createCalibrationCandidates(calibration);
  const screeningObservations = candidates.flatMap((candidate) => observationsForCandidate(
    baseline,
    candidate,
    calibration.screeningReplicates,
    calibration,
  ));
  const selected = summarizeCalibrationScreening(
    baseline,
    calibration,
    screeningObservations,
  ).selected;
  const validationObservations = selected
    ? observationsForCandidate(
      baseline,
      selected,
      calibration.validationReplicates,
      calibration,
    )
    : [];
  return assemblePilotCalibrationReport(
    baseline,
    calibration,
    screeningObservations,
    validationObservations,
  );
}
