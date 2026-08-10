import { MAX_BPS } from '../artifact/risk/calc';
import type { SimulationConfig } from '../core/config';
import { randomIntegerBelow, type RandomDrawKey } from '../core/rng';
import type { NetworkModel } from '../network/types';
import { deriveRiskSubmission } from '../risk/metrics';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import type {
  OracleAttempt,
  OracleSubmissionRequest,
  OracleSubmissionResult,
  OracleTreatment,
} from './types';

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function validateTreatment(treatment: OracleTreatment): void {
  requireSafeNonNegative(treatment.latencySec, 'ORACLE_LATENCY');
  requireSafeNonNegative(treatment.retryDelaySec, 'ORACLE_RETRY_DELAY');
  if (!Number.isInteger(treatment.executionFailureBps)
    || treatment.executionFailureBps < 0
    || treatment.executionFailureBps > MAX_BPS) {
    throw new Error('INVALID_ORACLE_EXECUTION_FAILURE_BPS');
  }
  if (
    !Number.isSafeInteger(treatment.maxAttempts)
    || treatment.maxAttempts <= 0
    || treatment.maxAttempts > 16
  ) {
    throw new Error('INVALID_ORACLE_MAX_ATTEMPTS');
  }
}

function attemptKey(
  config: SimulationConfig,
  request: OracleSubmissionRequest,
  attemptNumber: number,
): RandomDrawKey {
  return {
    masterSeed: BigInt(config.oracle.seed),
    replicateId: request.replicateId,
    entityId: request.fundId,
    moduleId: 'oracle-execution',
    tick: request.tick,
    drawPurpose: `submission-attempt:${attemptNumber}`,
  };
}

export function baselineOracleTreatment(config: SimulationConfig): OracleTreatment {
  return {
    latencySec: config.oracle.baselineLatencySec,
    executionFailureBps: config.oracle.baselineExecutionFailureBps,
    maxAttempts: config.oracle.maxAttempts,
    retryDelaySec: config.oracle.retryDelaySec,
  };
}

export function submitOracleRisk(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  request: OracleSubmissionRequest,
  treatment: OracleTreatment = baselineOracleTreatment(config),
): OracleSubmissionResult {
  requireSafeNonNegative(request.replicateId, 'ORACLE_REPLICATE_ID');
  requireSafeNonNegative(request.tick, 'ORACLE_TICK');
  validateTreatment(treatment);
  let latestFundSnapshot: SimulationState['oracleRiskSnapshots'][number] | undefined;
  for (let index = state.oracleRiskSnapshots.length - 1; index >= 0; index -= 1) {
    const candidate = state.oracleRiskSnapshots[index]!;
    if (candidate.fundId === request.fundId) {
      latestFundSnapshot = candidate;
      break;
    }
  }
  if (latestFundSnapshot && request.occurredAt < latestFundSnapshot.occurredAt) {
    throw new Error('ORACLE_OCCURRED_BEFORE_LATEST_FUND_SUBMISSION');
  }
  // Fund submissions in one Oracle stage share an event time but can complete in
  // different orders. Per-fund valuation guards remain authoritative while the
  // global processing clock may already have advanced for another fund.
  const derivationState = request.occurredAt < state.nowSec
    ? { ...state, nowSec: request.occurredAt }
    : state;
  const candidate = deriveRiskSubmission(derivationState, network, config, request);
  const attempts: OracleAttempt[] = [];

  for (let attemptIndex = 0; attemptIndex < treatment.maxAttempts; attemptIndex += 1) {
    const attemptNumber = attemptIndex + 1;
    const attemptedAt = request.occurredAt
      + treatment.latencySec
      + attemptIndex * treatment.retryDelaySec;
    requireSafeNonNegative(attemptedAt, 'ORACLE_ATTEMPT_TIME');
    const failureDrawBps = randomIntegerBelow(
      attemptKey(config, request, attemptNumber),
      MAX_BPS,
    );
    const failed = failureDrawBps < treatment.executionFailureBps;
    attempts.push({ attemptNumber, attemptedAt, failureDrawBps, failed });
    if (failed) continue;

    const submissionId = `oracle-r${request.replicateId}-t${request.tick}-${request.fundId}`;
    const nextState: SimulationState = {
      ...state,
      nowSec: Math.max(state.nowSec, attemptedAt),
      funds: state.funds.map((fund) => {
        if (fund.fundId !== request.fundId) return fund;
        return {
          ...fund,
          reportedAum: candidate.nextReportedAum,
          reportedNavPerShareBps: candidate.nextReportedNavPerShareBps,
          lastValuationAsOf: candidate.navUpdated ? request.occurredAt : fund.lastValuationAsOf,
          lastValuationUpdateAt: candidate.navUpdated ? attemptedAt : fund.lastValuationUpdateAt,
          reportedRiskMetrics: candidate.metrics,
        };
      }),
      oracleRiskSnapshots: [
        ...state.oracleRiskSnapshots,
        {
          submissionId,
          replicateId: request.replicateId,
          tick: request.tick,
          fundId: request.fundId,
          occurredAt: request.occurredAt,
          submittedAt: attemptedAt,
          attemptCount: attempts.length,
          failedAttemptCount: attempts.filter((attempt) => attempt.failed).length,
          navUpdated: candidate.navUpdated,
          staleAgeSecRaw: candidate.staleAgeSecRaw,
          liquidityBufferRatioBps: candidate.liquidityBufferRatioBps,
          metrics: candidate.metrics,
          weightSchemeId: config.risk.weightSchemeId,
          weightBps: config.risk.weightBps,
          maxStaleAgeDays: config.risk.maxStaleAgeDays,
          riskScoreBps: candidate.riskScoreBps,
          detectionThresholdBps: config.thresholds.detectionBps,
          kappaBps: config.thresholds.baselineKappaBps,
          detected: candidate.detected,
          interventionTriggered: candidate.interventionTriggered,
        },
      ],
    };
    validateSimulationState(nextState, network);
    return { status: 'submitted', state: nextState, candidate, attempts };
  }

  return { status: 'failed', state, candidate, attempts };
}
