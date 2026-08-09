import type { DerivedRiskSubmission } from '../risk/metrics';
import type { SimulationState } from '../state/types';

export type OracleTreatment = {
  latencySec: number;
  executionFailureBps: number;
  maxAttempts: number;
  retryDelaySec: number;
};

export type OracleSubmissionRequest = {
  replicateId: number;
  tick: number;
  fundId: string;
  occurredAt: number;
  requestedSharesInWindow: number;
};

export type OracleAttempt = {
  attemptNumber: number;
  attemptedAt: number;
  failureDrawBps: number;
  failed: boolean;
};

export type OracleSubmissionResult = {
  status: 'submitted' | 'failed';
  state: SimulationState;
  candidate: DerivedRiskSubmission;
  attempts: OracleAttempt[];
};
