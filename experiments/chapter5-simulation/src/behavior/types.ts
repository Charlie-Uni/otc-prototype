export type InvestorRiskBelief = {
  investorId: string;
  fundId: string;
  perceivedRiskBps: number;
  publicSignalAvailable: boolean;
  sourceSignalKind: 'prior' | 'exact' | 'band';
  sourceSubmissionId: string | null;
  lastDisclosedAt: number | null;
  lastObservedAt: number | null;
};

export type ExpectedOthersRedeemInput = {
  publicRiskSignalBps: number;
  signalSynchronicityBps: number;
  laggedRedemptionPressureBps: number;
};

export type ExpectedOthersRedeemWeights = readonly [number, number, number];

export type RedemptionBehaviorCoefficients = {
  interceptLogOdds: number;
  perceivedRisk: number;
  publicness: number;
  signalSynchronicity: number;
  expectedOthersRedeem: number;
  firstMoverAdvantage: number;
};

export type RedemptionProbabilityInput = {
  perceivedRiskBps: number;
  publicnessBps: number;
  signalSynchronicityBps: number;
  expectedOthersRedeemBps: number;
  firstMoverAdvantageBps: number;
};

export type RedemptionDecisionIdentity = {
  masterSeed: bigint;
  replicateId: number;
  investorId: string;
  fundId: string;
  tick: number;
};

export type RedemptionDecision = {
  probability: number;
  randomDraw: number;
  redeem: boolean;
};

export type InvestorRedemptionEvaluation = {
  expectedOthersRedeemBps: number;
  probabilityInput: RedemptionProbabilityInput;
  decision: RedemptionDecision;
};
