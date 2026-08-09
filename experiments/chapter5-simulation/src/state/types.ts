import type { RiskMetrics } from '../artifact/risk/calc';

export type FundRuntimeState = {
  fundId: string;
  economicAum: number;
  reportedAum: number;
  totalShares: number;
  reportedNavPerShareBps: number;
  queuedRedemptionShares: number;
  cumulativeRequestedShares: number;
  cumulativeSettledShares: number;
  lastValuationAsOf: number;
  lastValuationUpdateAt: number;
  gated: boolean;
  reportedRiskMetrics: RiskMetrics;
};

export type OracleRiskSnapshot = {
  submissionId: string;
  replicateId: number;
  tick: number;
  fundId: string;
  occurredAt: number;
  submittedAt: number;
  attemptCount: number;
  failedAttemptCount: number;
  navUpdated: boolean;
  staleAgeSecRaw: number;
  liquidityBufferRatioBps: number;
  metrics: RiskMetrics;
  weightSchemeId: string;
  weightBps: readonly [number, number, number, number, number, number];
  maxStaleAgeDays: number;
  riskScoreBps: number;
  detectionThresholdBps: number;
  kappaBps: number;
  detected: boolean;
  interventionTriggered: boolean;
};

export type AssetPositionState = {
  fundId: string;
  assetClassId: string;
  value: number;
};

export type InvestorHoldingState = {
  fundId: string;
  investorId: string;
  shares: number;
};

export type AppliedValuationShock = {
  scenarioId: string;
  targetFundId: string;
  shockAt: number;
  navDropBps: number;
  lossAmount: number;
  preShockEconomicAum: number;
  postShockEconomicAum: number;
};

export type SimulationState = {
  schemaVersion: 1;
  nowSec: number;
  funds: FundRuntimeState[];
  holderBalances: InvestorHoldingState[];
  assetPositions: AssetPositionState[];
  appliedValuationShocks: AppliedValuationShock[];
  oracleRiskSnapshots: OracleRiskSnapshot[];
};
