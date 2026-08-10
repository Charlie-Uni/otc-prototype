import type { SimulationConfig } from '../core/config';
import type { NetworkModel } from '../network/types';
import type {
  FundRuntimeState,
  GateTransitionKind,
  GateTransitionState,
  OracleRiskSnapshot,
  SimulationState,
} from '../state/types';
import { validateSimulationState } from '../state/validation';
import { qualifiesForGateRelease } from './gate';
import type { GateControlResult } from './types';

function transitionFor(
  kind: GateTransitionKind,
  snapshot: OracleRiskSnapshot,
  gatePhiBps: number,
): GateTransitionState {
  return {
    transitionId: `control:${snapshot.submissionId}:${kind}`,
    kind,
    fundId: snapshot.fundId,
    tick: snapshot.tick,
    sourceOccurredAt: snapshot.occurredAt,
    transitionedAt: snapshot.submittedAt,
    sourceSubmissionId: snapshot.submissionId,
    riskScoreBps: snapshot.riskScoreBps,
    kappaBps: snapshot.kappaBps,
    gatePhiBps,
  };
}

function requireNextControlSubmission(
  state: SimulationState,
  fund: FundRuntimeState,
  snapshot: OracleRiskSnapshot,
): void {
  const fundSnapshots = state.oracleRiskSnapshots.filter(({ fundId }) => fundId === fund.fundId);
  const snapshotIndex = fundSnapshots.findIndex(({ submissionId }) => (
    submissionId === snapshot.submissionId
  ));
  if (snapshotIndex < 0) throw new Error('UNKNOWN_CONTROL_SUBMISSION');
  if (fund.lastControlSubmissionId === snapshot.submissionId) {
    throw new Error('CONTROL_SUBMISSION_ALREADY_PROCESSED');
  }
  const expectedPrevious = snapshotIndex === 0
    ? null
    : fundSnapshots[snapshotIndex - 1]!.submissionId;
  if (fund.lastControlSubmissionId !== expectedPrevious) {
    throw new Error('CONTROL_SUBMISSIONS_OUT_OF_ORDER');
  }
}

function resetReleaseProgress(fund: FundRuntimeState): void {
  fund.gateReleaseStreakTicks = 0;
  fund.gateReleaseEligibleAtTick = null;
}

function applyGateControlForSubmissionUnchecked(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  submissionId: string,
): GateControlResult {
  const source = state.oracleRiskSnapshots.find((snapshot) => (
    snapshot.submissionId === submissionId
  ));
  if (!source) throw new Error('UNKNOWN_CONTROL_SUBMISSION');
  const next: SimulationState = {
    ...state,
    funds: state.funds.map((fund) => ({ ...fund })),
    controlTransitions: [...state.controlTransitions],
  };
  const snapshot = next.oracleRiskSnapshots.find((candidate) => (
    candidate.submissionId === submissionId
  ))!;
  const fund = next.funds.find(({ fundId }) => fundId === snapshot.fundId)!;
  requireNextControlSubmission(state, fund, source);

  const previousEvaluationTick = fund.lastControlEvaluationTick;
  const consecutiveTick = previousEvaluationTick !== null
    && snapshot.tick === previousEvaluationTick + 1;
  let transition: GateTransitionState | null = null;

  if (!fund.gated && snapshot.interventionTriggered) {
    fund.gated = true;
    fund.gatePhiBps = config.control.baselinePhiBps;
    fund.gatedAt = snapshot.submittedAt;
    fund.gateTriggerSubmissionId = snapshot.submissionId;
    resetReleaseProgress(fund);
    transition = transitionFor('GateTriggered', snapshot, fund.gatePhiBps);
  } else if (fund.gated) {
    if (!qualifiesForGateRelease(snapshot.riskScoreBps, snapshot.kappaBps)) {
      resetReleaseProgress(fund);
    } else {
      if (!consecutiveTick) resetReleaseProgress(fund);
      fund.gateReleaseStreakTicks += 1;
      if (
        fund.gateReleaseStreakTicks >= config.control.releaseConsecutiveTicks
        && fund.gateReleaseEligibleAtTick === null
      ) {
        fund.gateReleaseEligibleAtTick = snapshot.tick + config.control.releaseDelayTicks;
      }
      if (
        fund.gateReleaseEligibleAtTick !== null
        && snapshot.tick >= fund.gateReleaseEligibleAtTick
      ) {
        transition = transitionFor('GateReleased', snapshot, fund.gatePhiBps);
        fund.gated = false;
        fund.gatePhiBps = 0;
        fund.gatedAt = null;
        fund.gateTriggerSubmissionId = null;
        resetReleaseProgress(fund);
      }
    }
  }

  fund.lastControlSubmissionId = snapshot.submissionId;
  fund.lastControlEvaluationTick = snapshot.tick;
  if (transition) next.controlTransitions.push(transition);
  return {
    status: transition?.kind === 'GateTriggered'
      ? 'triggered'
      : transition?.kind === 'GateReleased' ? 'released' : 'unchanged',
    state: next,
    transition,
  };
}

export function applyGateControlForSubmission(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  submissionId: string,
): GateControlResult {
  validateSimulationState(state, network);
  const result = applyGateControlForSubmissionUnchecked(
    state,
    network,
    config,
    submissionId,
  );
  validateSimulationState(result.state, network);
  return result;
}

export function applyGateControlsForSubmissions(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  submissionIds: readonly string[],
): { state: SimulationState; results: GateControlResult[] } {
  validateSimulationState(state, network);
  const uniqueIds = new Set(submissionIds);
  if (uniqueIds.size !== submissionIds.length) throw new Error('DUPLICATE_CONTROL_BATCH_SUBMISSION');
  const results: GateControlResult[] = [];
  let next = state;
  for (const submissionId of submissionIds) {
    const result = applyGateControlForSubmissionUnchecked(
      next,
      network,
      config,
      submissionId,
    );
    next = result.state;
    results.push(result);
  }
  validateSimulationState(next, network);
  return { state: next, results };
}
