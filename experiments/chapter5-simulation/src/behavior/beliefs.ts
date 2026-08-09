import { MAX_BPS } from '../artifact/risk/calc';
import type { InvestorRiskObservation } from '../observation/types';
import type { InvestorRiskBelief } from './types';

function requireIdentifier(value: string, field: string): void {
  if (!value.trim()) throw new Error(`INVALID_${field}`);
}

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

export function initializeInvestorRiskBelief(
  investorId: string,
  fundId: string,
  initialPriorBps: number,
): InvestorRiskBelief {
  requireIdentifier(investorId, 'BELIEF_INVESTOR_ID');
  requireIdentifier(fundId, 'BELIEF_FUND_ID');
  requireBps(initialPriorBps, 'INITIAL_RISK_PRIOR_BPS');
  return {
    investorId,
    fundId,
    perceivedRiskBps: initialPriorBps,
    publicSignalAvailable: false,
    sourceSignalKind: 'prior',
    sourceSubmissionId: null,
    lastDisclosedAt: null,
    lastObservedAt: null,
  };
}

function compareObservation(
  left: InvestorRiskObservation,
  right: InvestorRiskObservation,
): number {
  return left.observedAt - right.observedAt
    || left.disclosedAt - right.disclosedAt
    || left.sourceSubmissionId.localeCompare(right.sourceSubmissionId);
}

export function updateInvestorRiskBelief(
  previous: InvestorRiskBelief,
  observations: readonly InvestorRiskObservation[],
  decisionAt: number,
): InvestorRiskBelief {
  requireSafeNonNegative(decisionAt, 'BELIEF_DECISION_AT');
  requireBps(previous.perceivedRiskBps, 'PERCEIVED_RISK_BPS');

  const eligible: InvestorRiskObservation[] = [];
  for (const observation of observations) {
    if (observation.investorId !== previous.investorId) {
      throw new Error('BELIEF_OBSERVATION_INVESTOR_MISMATCH');
    }
    if (observation.fundId !== previous.fundId) {
      throw new Error('BELIEF_OBSERVATION_FUND_MISMATCH');
    }
    requireSafeNonNegative(observation.observedAt, 'OBSERVED_AT');
    requireSafeNonNegative(observation.disclosedAt, 'DISCLOSED_AT');
    if (observation.observedAt < observation.disclosedAt) {
      throw new Error('OBSERVATION_BEFORE_DISCLOSURE');
    }
    requireIdentifier(observation.sourceSubmissionId, 'SOURCE_SUBMISSION_ID');
    requireBps(observation.signal.valueBps, 'OBSERVED_RISK_BPS');
    if (observation.observedAt <= decisionAt) eligible.push(observation);
  }

  if (eligible.length === 0) return { ...previous };
  eligible.sort(compareObservation);
  const latest = eligible.at(-1)!;
  if (
    previous.lastObservedAt !== null
    && (
      latest.observedAt < previous.lastObservedAt
      || (
        latest.observedAt === previous.lastObservedAt
        && previous.sourceSubmissionId !== null
        && latest.sourceSubmissionId <= previous.sourceSubmissionId
      )
    )
  ) {
    return { ...previous };
  }

  return {
    investorId: previous.investorId,
    fundId: previous.fundId,
    perceivedRiskBps: latest.signal.valueBps,
    publicSignalAvailable: true,
    sourceSignalKind: latest.signal.kind,
    sourceSubmissionId: latest.sourceSubmissionId,
    lastDisclosedAt: latest.disclosedAt,
    lastObservedAt: latest.observedAt,
  };
}

export function publicRiskSignalBps(belief: InvestorRiskBelief): number {
  requireBps(belief.perceivedRiskBps, 'PERCEIVED_RISK_BPS');
  return belief.publicSignalAvailable ? belief.perceivedRiskBps : 0;
}

export function publicnessBps(belief: InvestorRiskBelief): number {
  return belief.publicSignalAvailable ? MAX_BPS : 0;
}
