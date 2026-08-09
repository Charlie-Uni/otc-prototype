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
  cumulativeSettlementAmount: number;
  cumulativeFireSaleDiscountLoss: number;
  lastValuationAsOf: number;
  lastValuationUpdateAt: number;
  gated: boolean;
  reportedRiskMetrics: RiskMetrics;
};

export const PENDING_REDEMPTION_REASONS = [
  'queued',
  'settlement_delay',
  'gated',
  'settlement_amount_rounds_to_zero',
  'insufficient_liquidity',
  'fund_closure_out_of_scope',
] as const;

export type PendingRedemptionReason = typeof PENDING_REDEMPTION_REASONS[number];

export type RedemptionRequestState = {
  requestId: string;
  fundId: string;
  investorId: string;
  tick: number;
  requestedAt: number;
  requestedShares: number;
  status: 'pending' | 'settled';
  pendingReason: PendingRedemptionReason | null;
  settledAt: number | null;
  settlementAmount: number | null;
  settlementNavPerShareBps: number | null;
  fireSaleDiscountLoss: number | null;
};

export type AssetSaleState = {
  saleId: string;
  requestId: string;
  fundId: string;
  assetClassId: string;
  occurredAt: number;
  grossAmount: number;
  proceeds: number;
  priceImpactBps: number;
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
  redemptionRequests: RedemptionRequestState[];
  assetSales: AssetSaleState[];
  appliedValuationShocks: AppliedValuationShock[];
  oracleRiskSnapshots: OracleRiskSnapshot[];
};
