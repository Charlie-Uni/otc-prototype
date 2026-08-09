import type { PendingRedemptionReason, SimulationState } from '../state/types';

export type InvestorRedemptionIntent = {
  investorId: string;
  fundId: string;
  tick: number;
  redeem: boolean;
};

export type QueueRedemptionSummary = {
  fundId: string;
  eligibleInvestorCount: number;
  redeemingInvestorCount: number;
  decisionPressureBps: number;
  requestedShares: number;
  requestPressureBps: number;
  requestIds: string[];
};

export type QueueRedemptionResult = {
  state: SimulationState;
  summary: QueueRedemptionSummary;
};

export type SettlementBatchSummary = {
  attemptedRequestCount: number;
  settledRequestCount: number;
  settledShares: number;
  settlementAmount: number;
  fireSaleDiscountLoss: number;
  pendingRequestCount: number;
  pendingByReason: Partial<Record<PendingRedemptionReason, number>>;
};

export type SettlementBatchResult = {
  state: SimulationState;
  summary: SettlementBatchSummary;
};
