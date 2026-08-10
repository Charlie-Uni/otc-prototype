import type { TransparencyRegimeId } from '../artifact/risk/regimes';

export const DETECTION_CENSOR_REASONS = [
  'threshold_not_crossed',
  'shock_metric_not_observed',
  'no_successful_submission',
  'threshold_not_identifiable',
  'not_disclosed_within_horizon',
  'not_observed_within_horizon',
] as const;

export type DetectionCensorReason = typeof DETECTION_CENSOR_REASONS[number];

export type DetectionLagOutcome =
  | {
      status: 'detected';
      detectedAt: number;
      lagSec: number;
      sourceSubmissionId: string;
    }
  | {
      status: 'censored';
      reason: DetectionCensorReason;
    };

export type DetectionLagMetrics = {
  fundId: string;
  shockAt: number;
  system: DetectionLagOutcome;
  regulatorDisclosure: DetectionLagOutcome;
  publicDisclosure: DetectionLagOutcome;
  publicObservation: DetectionLagOutcome;
};

export type ShockLinkedDetectionLagMetrics = {
  fundId: string;
  shockAt: number;
  anchor: 'paired_valuation_haircut_increase';
  system: DetectionLagOutcome;
  regulatorDisclosure: DetectionLagOutcome;
};

export type SettlementDelaySummary = {
  settledRequestCount: number;
  meanSec: number | null;
  medianSec: number | null;
  p95Sec: number | null;
};

export type FundRunOutcome = {
  fundId: string;
  shocked: boolean;
  windowDays: number;
  initialAum: number;
  initialTotalShares: number;
  cumulativeRequestedShares: number;
  cumulativeRequestRateBps: number;
  cumulativeLatentRequestedShares: number;
  cumulativeLatentRequestRateBps: number;
  peakRedemptionBps: number;
  settledShares: number;
  pendingRequestCount: number;
  pendingShares: number;
  pendingRateBps: number;
  settlementDelay: SettlementDelaySummary;
  blockedSharesByGate: number;
  gateFrozenShareRatioBps: number;
  totalExtraWaitingSec: number;
  averageExtraWaitingSec: number | null;
  lossAmount: number;
  lossMagnitudeBps: number;
  fireSaleDiscountLoss: number;
  minimumLiquidityBufferRatioBps: number;
  liquidityBufferDepletionBps: number;
  firstLiquidityBufferExhaustionAt: number | null;
};

export type RunOutcomeMetrics = {
  schemaVersion: 1;
  treatmentId: string;
  configDigestSha256: string;
  regimeId: TransparencyRegimeId;
  replicateId: number;
  scenarioId: string;
  shockAt: number;
  windowDays: number;
  detection: DetectionLagMetrics;
  funds: FundRunOutcome[];
};

export type PairedFundDifference = {
  fundId: string;
  shocked: boolean;
  treatmentRequestRateBps: number;
  counterfactualRequestRateBps: number;
  excessRequestRateBps: number;
};

export type SpilloverScopeMetrics = {
  thresholdBps: number;
  unshockedFundCount: number;
  meanContinuousSpilloverBps: number;
  affectedFundCount: number;
  affectedFundShareBps: number;
  byFund: PairedFundDifference[];
};

export type LossReductionMetrics = {
  noControlLossMagnitudeBps: number;
  controlLossMagnitudeBps: number;
  absoluteReductionBps: number;
  relativeReductionBps: number | null;
};

export type ControlCostMetrics = {
  gateFrozenShareRatioBps: number;
  averageExtraWaitingSec: number | null;
  pendingRateBps: number;
};

export type StabilityComponent = {
  componentId: string;
  benefitBps: number;
  weightBps: number;
};

export type FundNetStabilityBenefit = {
  valueBps: number;
  components: StabilityComponent[];
};
