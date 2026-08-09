import { MAX_BPS } from '../artifact/risk/calc';
import { randomUnitInterval } from '../core/rng';
import { publicnessBps, publicRiskSignalBps } from './beliefs';
import { expectedOthersRedeemBps } from './expectations';
import type {
  RedemptionBehaviorCoefficients,
  RedemptionDecision,
  RedemptionDecisionIdentity,
  ExpectedOthersRedeemWeights,
  InvestorRedemptionEvaluation,
  InvestorRiskBelief,
  RedemptionProbabilityInput,
} from './types';

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

function requireIdentifier(value: string, field: string): void {
  if (!value.trim()) throw new Error(`INVALID_${field}`);
}

function requireCoefficient(value: number, field: string, allowNegative = false): void {
  if (!Number.isFinite(value) || Math.abs(value) > 20 || (!allowNegative && value < 0)) {
    throw new Error(`INVALID_${field}`);
  }
}

function normalizedBps(value: number): number {
  return value / MAX_BPS;
}

function logistic(logOdds: number): number {
  if (logOdds >= 0) return 1 / (1 + Math.exp(-logOdds));
  const exponential = Math.exp(logOdds);
  return exponential / (1 + exponential);
}

export function redemptionLogOdds(
  input: RedemptionProbabilityInput,
  coefficients: RedemptionBehaviorCoefficients,
): number {
  requireBps(input.perceivedRiskBps, 'PERCEIVED_RISK_BPS');
  requireBps(input.publicnessBps, 'PUBLICNESS_BPS');
  requireBps(input.signalSynchronicityBps, 'SIGNAL_SYNCHRONICITY_BPS');
  requireBps(input.expectedOthersRedeemBps, 'EXPECTED_OTHERS_REDEEM_BPS');
  requireBps(input.firstMoverAdvantageBps, 'FIRST_MOVER_ADVANTAGE_BPS');
  requireCoefficient(coefficients.interceptLogOdds, 'INTERCEPT_LOG_ODDS', true);
  requireCoefficient(coefficients.perceivedRisk, 'PERCEIVED_RISK_COEFFICIENT');
  requireCoefficient(coefficients.publicness, 'PUBLICNESS_COEFFICIENT');
  requireCoefficient(coefficients.signalSynchronicity, 'SYNCHRONICITY_COEFFICIENT');
  requireCoefficient(coefficients.expectedOthersRedeem, 'EXPECTED_OTHERS_COEFFICIENT');
  requireCoefficient(coefficients.firstMoverAdvantage, 'FIRST_MOVER_ADVANTAGE_COEFFICIENT');

  return coefficients.interceptLogOdds
    + coefficients.perceivedRisk * normalizedBps(input.perceivedRiskBps)
    + coefficients.publicness * normalizedBps(input.publicnessBps)
    + coefficients.signalSynchronicity * normalizedBps(input.signalSynchronicityBps)
    + coefficients.expectedOthersRedeem * normalizedBps(input.expectedOthersRedeemBps)
    + coefficients.firstMoverAdvantage * normalizedBps(input.firstMoverAdvantageBps);
}

export function redemptionProbability(
  input: RedemptionProbabilityInput,
  coefficients: RedemptionBehaviorCoefficients,
): number {
  return logistic(redemptionLogOdds(input, coefficients));
}

export function drawRedemptionDecision(
  input: RedemptionProbabilityInput,
  coefficients: RedemptionBehaviorCoefficients,
  identity: RedemptionDecisionIdentity,
): RedemptionDecision {
  requireIdentifier(identity.investorId, 'DECISION_INVESTOR_ID');
  requireIdentifier(identity.fundId, 'DECISION_FUND_ID');
  const probability = redemptionProbability(input, coefficients);
  const randomDraw = randomUnitInterval({
    masterSeed: identity.masterSeed,
    replicateId: identity.replicateId,
    entityId: JSON.stringify([identity.investorId, identity.fundId]),
    moduleId: 'redemption-decision',
    tick: identity.tick,
    drawPurpose: 'redeem-or-not',
  });
  return {
    probability,
    randomDraw,
    redeem: randomDraw < probability,
  };
}

export function evaluateInvestorRedemption(
  belief: InvestorRiskBelief,
  signalSynchronicityBps: number,
  laggedRedemptionPressureBps: number,
  firstMoverAdvantageBps: number,
  expectationWeightsBps: ExpectedOthersRedeemWeights,
  coefficients: RedemptionBehaviorCoefficients,
  identity: RedemptionDecisionIdentity,
): InvestorRedemptionEvaluation {
  if (belief.investorId !== identity.investorId || belief.fundId !== identity.fundId) {
    throw new Error('REDEMPTION_BELIEF_IDENTITY_MISMATCH');
  }
  const expectedOthers = expectedOthersRedeemBps({
    publicRiskSignalBps: publicRiskSignalBps(belief),
    signalSynchronicityBps,
    laggedRedemptionPressureBps,
  }, expectationWeightsBps);
  const probabilityInput: RedemptionProbabilityInput = {
    perceivedRiskBps: belief.perceivedRiskBps,
    publicnessBps: publicnessBps(belief),
    signalSynchronicityBps,
    expectedOthersRedeemBps: expectedOthers,
    firstMoverAdvantageBps,
  };
  return {
    expectedOthersRedeemBps: expectedOthers,
    probabilityInput,
    decision: drawRedemptionDecision(probabilityInput, coefficients, identity),
  };
}
