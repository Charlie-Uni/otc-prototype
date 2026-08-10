import type { SimulationConfig } from '../core/config';
import { parseSimulationConfig } from '../core/config';
import type {
  CalibrationCandidate,
  CalibrationCandidateSummary,
  PilotCalibrationConfig,
} from './types';

export function createCalibrationCandidates(
  calibration: PilotCalibrationConfig,
): CalibrationCandidate[] {
  return [...calibration.interceptLogOdds]
    .sort((left, right) => left - right)
    .flatMap((interceptLogOdds, interceptIndex) => (
      [...calibration.redemptionRequestFractionBps]
        .sort((left, right) => left - right)
        .flatMap((redemptionRequestFractionBps, fractionIndex) => (
          [...calibration.demandTransmissionBps]
            .sort((left, right) => left - right)
            .map((demandTransmissionBps, transmissionIndex) => ({
              candidateId: `candidate-i${interceptIndex + 1}-f${fractionIndex + 1}-d${transmissionIndex + 1}`,
              interceptLogOdds,
              redemptionRequestFractionBps,
              demandTransmissionBps,
            }))
        ))
    ));
}

export function configForCalibrationCandidate(
  baseline: SimulationConfig,
  candidate: CalibrationCandidate,
): SimulationConfig {
  const value = structuredClone(baseline);
  value.behavior.coefficients.interceptLogOdds = candidate.interceptLogOdds;
  value.liquidity.redemptionRequestFractionBps = candidate.redemptionRequestFractionBps;
  value.propagation.investorOverlapTransmissionBps = candidate.demandTransmissionBps;
  value.propagation.publicRiskTransmissionBps = candidate.demandTransmissionBps;
  value.propagation.publicControlTransmissionBps = candidate.demandTransmissionBps;
  return parseSimulationConfig(value);
}

function distanceFromBaseline(
  candidate: CalibrationCandidate,
  baseline: SimulationConfig,
): number {
  return Math.abs(
    candidate.interceptLogOdds - baseline.behavior.coefficients.interceptLogOdds,
  ) + Math.abs(
    candidate.redemptionRequestFractionBps
      - baseline.liquidity.redemptionRequestFractionBps,
  ) / 10_000 + Math.abs(
    candidate.demandTransmissionBps
      - baseline.propagation.publicRiskTransmissionBps,
  ) / 10_000;
}

export function selectCalibrationCandidate(
  summaries: readonly CalibrationCandidateSummary[],
  baseline: SimulationConfig,
): CalibrationCandidate | null {
  return summaries
    .filter(({ eligibleForValidation }) => eligibleForValidation)
    .sort((left, right) => (
      distanceFromBaseline(left.candidate, baseline)
        - distanceFromBaseline(right.candidate, baseline)
      || left.candidate.candidateId.localeCompare(right.candidate.candidateId)
    ))[0]?.candidate ?? null;
}
