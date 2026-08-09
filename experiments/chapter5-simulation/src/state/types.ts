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
  lastValuationUpdateAt: number;
  gated: boolean;
  reportedRiskMetrics: RiskMetrics;
};

export type AssetPositionState = {
  fundId: string;
  assetClassId: string;
  value: number;
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
  assetPositions: AssetPositionState[];
  appliedValuationShocks: AppliedValuationShock[];
};
