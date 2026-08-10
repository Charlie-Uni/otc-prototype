import type { TransparencyRegimeId } from '../artifact/risk/regimes';

export type PilotCalibrationConfig = {
  schemaVersion: 1;
  screeningReplicates: number;
  validationReplicates: number;
  windowDays: number;
  interceptLogOdds: number[];
  redemptionRequestFractionBps: number[];
  demandTransmissionBps: number[];
  baselineValuationShockBps: number;
  technicalBounds: {
    maximumNoShockAcceptedRequestRateBps: number;
    maximumPeakRequestPressureBps: number;
    minimumMeanRegimeLatentDemandRangeBps: number;
  };
  detectionThresholdCalibration: {
    candidatesBps: number[];
    minimumShockDetectionRateBps: number;
  };
  precisionPlanning: {
    zScore: number;
    targetHalfWidth: {
      acceptedRequestRateBps: number;
      lossMagnitudeBps: number;
      regulatorDetectionLagSec: number;
    };
  };
};

export type CalibrationCandidate = {
  candidateId: string;
  interceptLogOdds: number;
  redemptionRequestFractionBps: number;
  demandTransmissionBps: number;
};

export const CALIBRATION_FLAG_CODES = [
  'NO_SHOCK_REQUESTS_AT_FLOOR',
  'NO_SHOCK_ACCEPTED_REQUESTS_NEAR_SATURATION',
  'PEAK_REQUEST_PRESSURE_SATURATED',
  'REGIME_LATENT_DEMAND_NOT_SEPARATED',
] as const;

export type CalibrationFlagCode = typeof CALIBRATION_FLAG_CODES[number];

export type CalibrationObservation = {
  candidateId: string;
  replicateId: number;
  regimeId: TransparencyRegimeId | 'NO_SHOCK';
  acceptedRequestRateBps: number;
  latentRequestRateBps: number;
  peakRequestPressureBps: number;
  lossMagnitudeBps: number;
  regulatorDetectionLagSec: number | null;
  regulatorDetectionCensored: boolean;
  regulatorDetectionLagSecByThresholdBps: Record<string, number | null>;
  runDigestSha256: string;
};

export type CalibrationCandidateSummary = {
  candidate: CalibrationCandidate;
  observationCount: number;
  flags: CalibrationFlagCode[];
  eligibleForValidation: boolean;
  noShockMeanAcceptedRequestRateBps: number;
  maximumPeakRequestPressureBps: number;
  meanWithinReplicateRegimeLatentRangeBps: number;
};

export type CalibrationShard = {
  schemaVersion: 1;
  baselineConfigDigestSha256: string;
  calibrationConfigDigestSha256: string;
  implementationDigestSha256: string;
  candidate: CalibrationCandidate;
  replicateStart: number;
  replicateCount: number;
  windowDays: number;
  observations: CalibrationObservation[];
  semanticDigestSha256: string;
};

export type SampleSummary = {
  count: number;
  mean: number;
  median: number;
  standardDeviation: number;
  standardError: number;
  ci95Lower: number;
  ci95Upper: number;
};

export type ReplicationEstimate = {
  metricId: keyof PilotCalibrationConfig['precisionPlanning']['targetHalfWidth'];
  targetHalfWidth: number;
  observedStandardDeviation: number;
  impliedReplicates: number;
  thesisMinimumReplicates: number;
  recommendedReplicates: number;
};

export type PrecisionRecommendation = {
  metricId: ReplicationEstimate['metricId'];
  pilotPairsByRegime: Record<TransparencyRegimeId, number>;
  targetHalfWidth: number;
  thesisMinimumReplicates: number;
} & ({
  status: 'estimated';
  observedStandardDeviation: number;
  impliedReplicates: number;
  recommendedReplicates: number;
} | {
  status: 'unavailable';
  observedStandardDeviation: null;
  impliedReplicates: null;
  recommendedReplicates: null;
});

export type DetectionThresholdCandidateSummary = {
  thresholdBps: number;
  noShockDetectionRateBps: number;
  shockDetectionRateBpsByRegime: Record<TransparencyRegimeId, number>;
  minimumShockDetectionRateBps: number;
  eligible: boolean;
};

export type DetectionThresholdCalibrationSummary = {
  baselineValuationShockBps: number;
  minimumRequiredShockDetectionRateBps: number;
  candidates: DetectionThresholdCandidateSummary[];
  selectedThresholdBps: number | null;
};

export type PilotCalibrationReport = {
  schemaVersion: 1;
  baselineConfigDigestSha256: string;
  calibrationConfigDigestSha256: string;
  implementationDigestSha256: string | null;
  screening: {
    observations: CalibrationObservation[];
    candidates: CalibrationCandidateSummary[];
    selectedCandidateId: string | null;
  };
  validation: {
    candidate: CalibrationCandidate | null;
    detectionThreshold: DetectionThresholdCalibrationSummary | null;
    observations: CalibrationObservation[];
    summaries: Partial<Record<
      CalibrationObservation['regimeId'],
      {
        acceptedRequestRateBps: SampleSummary;
        lossMagnitudeBps: SampleSummary;
        regulatorDetectionLagSec: SampleSummary | null;
      }
    >>;
    precisionRecommendations: PrecisionRecommendation[];
  };
  formalFindingsAllowed: false;
  semanticDigestSha256: string;
};
