import { MAX_BPS } from '../artifact/risk/calc';
import type { InvestorRedemptionEvaluation } from '../behavior/types';

export type SpilloverAdjustedEvaluation = InvestorRedemptionEvaluation & {
  baseProbability: number;
  incomingSpilloverRedemptionBps: number;
};

export function applyIncomingSpilloverToDecision(
  evaluation: InvestorRedemptionEvaluation,
  incomingSpilloverRedemptionBps: number,
): SpilloverAdjustedEvaluation {
  if (
    !Number.isInteger(incomingSpilloverRedemptionBps)
    || incomingSpilloverRedemptionBps < 0
    || incomingSpilloverRedemptionBps > MAX_BPS
  ) {
    throw new Error('INVALID_INCOMING_SPILLOVER_REDEMPTION_BPS');
  }
  const baseProbability = evaluation.decision.probability;
  const probability = Math.min(1, baseProbability + incomingSpilloverRedemptionBps / MAX_BPS);
  return {
    ...evaluation,
    baseProbability,
    incomingSpilloverRedemptionBps,
    decision: {
      ...evaluation.decision,
      probability,
      redeem: evaluation.decision.randomDraw < probability,
    },
  };
}
