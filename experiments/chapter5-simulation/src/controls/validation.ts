import { MAX_BPS } from '../artifact/risk/calc';
import {
  GATE_TRANSITION_KINDS,
  type FundRuntimeState,
  type SimulationState,
} from '../state/types';

const gateTransitionKinds = new Set<string>(GATE_TRANSITION_KINDS);

function requireSafeNonNegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${label}`);
}

export function validateFundGateFields(fund: FundRuntimeState, stateTime: number): void {
  requireSafeNonNegative(fund.gatePhiBps, 'GATE_PHI_BPS');
  if (fund.gatePhiBps > MAX_BPS) throw new Error('GATE_PHI_BPS_OUT_OF_RANGE');
  requireSafeNonNegative(fund.gateReleaseStreakTicks, 'GATE_RELEASE_STREAK_TICKS');
  if ((fund.lastControlSubmissionId === null) !== (fund.lastControlEvaluationTick === null)) {
    throw new Error('INCOMPLETE_CONTROL_EVALUATION_PROVENANCE');
  }
  if (fund.lastControlEvaluationTick !== null) {
    requireSafeNonNegative(fund.lastControlEvaluationTick, 'LAST_CONTROL_EVALUATION_TICK');
  }
  if (fund.gateReleaseDelayTicksRemaining !== null) {
    requireSafeNonNegative(
      fund.gateReleaseDelayTicksRemaining,
      'GATE_RELEASE_DELAY_TICKS_REMAINING',
    );
    if (fund.gateReleaseDelayTicksRemaining === 0) {
      throw new Error('ZERO_ACTIVE_GATE_RELEASE_DELAY');
    }
  }
  requireSafeNonNegative(fund.gateSettlementBudgetCarry, 'GATE_SETTLEMENT_BUDGET_CARRY');
  if (fund.gateSettlementBudgetCarry > 0 && fund.gateSettlementBudgetUpdatedAt === null) {
    throw new Error('GATE_SETTLEMENT_BUDGET_WITHOUT_UPDATE_TIME');
  }
  if (fund.gateSettlementBudgetUpdatedAt !== null) {
    requireSafeNonNegative(fund.gateSettlementBudgetUpdatedAt, 'GATE_SETTLEMENT_BUDGET_UPDATED_AT');
    if (fund.gateSettlementBudgetUpdatedAt > stateTime) {
      throw new Error('GATE_SETTLEMENT_BUDGET_UPDATED_AFTER_STATE_TIME');
    }
  }
  if (fund.gated) {
    if (fund.gatedAt === null || fund.gateTriggerSubmissionId === null) {
      throw new Error('INCOMPLETE_ACTIVE_GATE_STATE');
    }
    requireSafeNonNegative(fund.gatedAt, 'GATED_AT');
    if (fund.gatedAt > stateTime) throw new Error('GATE_TRIGGERED_AFTER_STATE_TIME');
    if (
      fund.gateSettlementBudgetUpdatedAt !== null
      && fund.gateSettlementBudgetUpdatedAt < fund.gatedAt
    ) {
      throw new Error('GATE_SETTLEMENT_BUDGET_UPDATED_BEFORE_TRIGGER');
    }
    if (fund.gateReleaseDelayTicksRemaining !== null && fund.gateReleaseStreakTicks === 0) {
      throw new Error('GATE_RELEASE_DELAY_WITHOUT_EVIDENCE');
    }
    if (
      (fund.gatePhiBps === 0 || fund.gatePhiBps === MAX_BPS)
      && (
        fund.gateSettlementBudgetCarry !== 0
        || fund.gateSettlementBudgetUpdatedAt !== null
      )
    ) {
      throw new Error('UNUSED_GATE_SETTLEMENT_BUDGET_STATE');
    }
  } else if (
    fund.gatePhiBps !== 0
    || fund.gatedAt !== null
    || fund.gateTriggerSubmissionId !== null
    || fund.gateReleaseStreakTicks !== 0
    || fund.gateReleaseDelayTicksRemaining !== null
    || fund.gateSettlementBudgetCarry !== 0
    || fund.gateSettlementBudgetUpdatedAt !== null
  ) {
    throw new Error('STALE_INACTIVE_GATE_STATE');
  }
}

export function validateControlTransitions(state: SimulationState): void {
  const submissionById = new Map(
    state.oracleRiskSnapshots.map((snapshot) => [snapshot.submissionId, snapshot]),
  );
  const transitionIds = new Set<string>();
  const transitionsByFund = new Map<string, SimulationState['controlTransitions']>();
  for (const transition of state.controlTransitions) {
    if (!transition.transitionId.trim()) throw new Error('INVALID_GATE_TRANSITION_ID');
    if (transitionIds.has(transition.transitionId)) throw new Error('DUPLICATE_GATE_TRANSITION');
    transitionIds.add(transition.transitionId);
    if (!gateTransitionKinds.has(transition.kind)) throw new Error('INVALID_GATE_TRANSITION_KIND');
    const source = submissionById.get(transition.sourceSubmissionId);
    if (!source) throw new Error('UNKNOWN_GATE_TRANSITION_SOURCE');
    if (
      transition.fundId !== source.fundId
      || transition.tick !== source.tick
      || transition.sourceOccurredAt !== source.occurredAt
      || transition.transitionedAt !== source.submittedAt
      || transition.riskScoreBps !== source.riskScoreBps
      || transition.kappaBps !== source.kappaBps
    ) {
      throw new Error('GATE_TRANSITION_SOURCE_MISMATCH');
    }
    requireSafeNonNegative(transition.gatePhiBps, 'TRANSITION_GATE_PHI_BPS');
    if (transition.gatePhiBps > MAX_BPS) throw new Error('TRANSITION_GATE_PHI_OUT_OF_RANGE');
    if (transition.kind === 'GateTriggered' && !source.interventionTriggered) {
      throw new Error('GATE_TRIGGER_WITHOUT_INTERVENTION');
    }
    if (transition.kind === 'GateReleased' && source.riskScoreBps > source.kappaBps) {
      throw new Error('GATE_RELEASE_WITHOUT_LOW_SCORE');
    }
    const fundTransitions = transitionsByFund.get(transition.fundId) ?? [];
    const previous = fundTransitions.at(-1);
    if (!previous && transition.kind !== 'GateTriggered') {
      throw new Error('INVALID_GATE_TRANSITION_SEQUENCE');
    }
    if (
      previous
      && (
        transition.tick < previous.tick
        || transition.transitionedAt < previous.transitionedAt
        || transition.kind === previous.kind
        || (transition.kind === 'GateReleased'
          && transition.gatePhiBps !== previous.gatePhiBps)
      )
    ) {
      throw new Error('INVALID_GATE_TRANSITION_SEQUENCE');
    }
    fundTransitions.push(transition);
    transitionsByFund.set(transition.fundId, fundTransitions);
  }

  for (const fund of state.funds) {
    const fundSnapshots = state.oracleRiskSnapshots.filter(({ fundId }) => fundId === fund.fundId);
    if (fund.lastControlSubmissionId !== null) {
      const lastProcessed = submissionById.get(fund.lastControlSubmissionId);
      if (!lastProcessed || lastProcessed.fundId !== fund.fundId) {
        throw new Error('INVALID_LAST_CONTROL_SUBMISSION');
      }
      if (lastProcessed.tick !== fund.lastControlEvaluationTick) {
        throw new Error('LAST_CONTROL_EVALUATION_TICK_MISMATCH');
      }
      const processedIndex = fundSnapshots.findIndex(({ submissionId }) => (
        submissionId === fund.lastControlSubmissionId
      ));
      if (processedIndex < fundSnapshots.length - 2) {
        throw new Error('MULTIPLE_UNPROCESSED_CONTROL_SUBMISSIONS');
      }
    } else if (fundSnapshots.length > 1) {
      throw new Error('MULTIPLE_UNPROCESSED_CONTROL_SUBMISSIONS');
    }
    const lastTransition = transitionsByFund.get(fund.fundId)?.at(-1);
    if (!lastTransition) {
      if (fund.gated) throw new Error('ACTIVE_GATE_WITHOUT_TRANSITION');
      continue;
    }
    if ((lastTransition.kind === 'GateTriggered') !== fund.gated) {
      throw new Error('GATE_STATE_TRANSITION_MISMATCH');
    }
    if (fund.gated && (
      fund.gatedAt !== lastTransition.transitionedAt
      || fund.gateTriggerSubmissionId !== lastTransition.sourceSubmissionId
      || fund.gatePhiBps !== lastTransition.gatePhiBps
    )) {
      throw new Error('ACTIVE_GATE_PROVENANCE_MISMATCH');
    }
  }
}
