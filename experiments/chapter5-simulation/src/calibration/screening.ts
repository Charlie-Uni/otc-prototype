import type {
  CalibrationCandidate,
  CalibrationCandidateSummary,
  CalibrationFlagCode,
  CalibrationObservation,
  PilotCalibrationConfig,
} from './types';

export function summarizeCalibrationCandidate(
  candidate: CalibrationCandidate,
  observations: readonly CalibrationObservation[],
  calibration: PilotCalibrationConfig,
): CalibrationCandidateSummary {
  const candidateObservations = observations.filter(({ candidateId }) => (
    candidateId === candidate.candidateId
  ));
  const noShock = candidateObservations.filter(({ regimeId }) => regimeId === 'NO_SHOCK');
  const shock = candidateObservations.filter(({ regimeId }) => regimeId !== 'NO_SHOCK');
  const noShockMean = Math.floor(
    noShock.reduce((sum, value) => sum + value.acceptedRequestRateBps, 0) / noShock.length,
  );
  const latentRangeByReplicate = [...new Set(shock.map(({ replicateId }) => replicateId))]
    .map((replicateId) => {
      const rows = shock.filter((value) => value.replicateId === replicateId);
      return Math.max(...rows.map(({ latentRequestRateBps }) => latentRequestRateBps))
        - Math.min(...rows.map(({ latentRequestRateBps }) => latentRequestRateBps));
    });
  const maximumPeakRequestPressureBps = Math.max(
    ...shock.map(({ peakRequestPressureBps }) => peakRequestPressureBps),
  );
  const meanWithinReplicateRegimeLatentRangeBps = Math.floor(
    latentRangeByReplicate.reduce((sum, value) => sum + value, 0)
      / latentRangeByReplicate.length,
  );
  const flags: CalibrationFlagCode[] = [];
  if (noShockMean === 0) flags.push('NO_SHOCK_REQUESTS_AT_FLOOR');
  if (
    noShockMean
    > calibration.technicalBounds.maximumNoShockAcceptedRequestRateBps
  ) flags.push('NO_SHOCK_ACCEPTED_REQUESTS_NEAR_SATURATION');
  if (
    maximumPeakRequestPressureBps
    > calibration.technicalBounds.maximumPeakRequestPressureBps
  ) flags.push('PEAK_REQUEST_PRESSURE_SATURATED');
  if (
    meanWithinReplicateRegimeLatentRangeBps
    < calibration.technicalBounds.minimumMeanRegimeLatentDemandRangeBps
  ) flags.push('REGIME_LATENT_DEMAND_NOT_SEPARATED');
  return {
    candidate,
    observationCount: candidateObservations.length,
    flags,
    eligibleForValidation: flags.length === 0,
    noShockMeanAcceptedRequestRateBps: noShockMean,
    maximumPeakRequestPressureBps,
    meanWithinReplicateRegimeLatentRangeBps,
  };
}
