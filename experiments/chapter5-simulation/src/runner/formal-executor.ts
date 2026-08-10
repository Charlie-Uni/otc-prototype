import type { SimulationConfig } from '../core/config';
import { shockMagnitudeBps } from '../shocks/scenario';
import { runSimulation } from './run';
import { semanticDigestSha256 } from './digest';
import {
  compileFormalRunInput,
  type CompiledFormalMatrix,
} from './formal-compiler';
import {
  assertFormalExecutionAuthorized,
  type FormalExecutionAuthorization,
} from './formal-provenance';
import type { SimulationRunInput, SimulationRunResult } from './types';

export type FormalRunExecutor = (input: SimulationRunInput) => SimulationRunResult;

export type FormalReplicateResult = {
  schemaVersion: 1;
  designDigestSha256: string;
  cellId: string;
  pairId: string;
  replicateId: number;
  shockType: SimulationRunResult['scenario']['shockType'];
  shockMagnitudeBps: number;
  shockEnabled: boolean;
  authorization: FormalExecutionAuthorization;
  result: SimulationRunResult;
};

export type FormalExecutionDependencies = {
  execute?: FormalRunExecutor;
  authorize?: () => FormalExecutionAuthorization;
};

function assertResultMatchesInput(
  result: SimulationRunResult,
  input: SimulationRunInput,
): void {
  const { semanticDigestSha256: recordedResultDigest, ...resultWithoutDigest } = result;
  const expectedTreatmentDigest = semanticDigestSha256({
    config: input.treatment.config,
    regime: input.treatment.regime,
    mechanisms: input.treatment.mechanisms,
  });
  if (
    result.treatmentId !== input.treatment.treatmentId
    || result.configDigestSha256 !== semanticDigestSha256(input.treatment.config)
    || result.treatmentDigestSha256 !== expectedTreatmentDigest
    || result.regime.id !== input.treatment.regime.id
    || result.horizonDays !== (input.horizonDays ?? input.treatment.config.time.horizonDays)
    || result.shockEnabled !== (input.shockEnabled ?? true)
    || semanticDigestSha256(result.scenario) !== semanticDigestSha256(input.scenario)
    || recordedResultDigest !== semanticDigestSha256(resultWithoutDigest)
  ) throw new Error('FORMAL_RUN_RESULT_PROVENANCE_MISMATCH');
}

export function executeFormalReplicate(
  matrix: CompiledFormalMatrix,
  baselineConfig: SimulationConfig,
  cellId: string,
  replicateId: number,
  dependencies: FormalExecutionDependencies = {},
): FormalReplicateResult {
  const authorization = (dependencies.authorize ?? assertFormalExecutionAuthorized)();
  const execute = dependencies.execute ?? runSimulation;
  const cell = matrix.cells.find((candidate) => candidate.cell.cellId === cellId);
  if (!cell) throw new Error(`UNKNOWN_FORMAL_CELL:${cellId}`);
  const input = compileFormalRunInput(cell, baselineConfig, replicateId);
  const result = execute(input);
  assertResultMatchesInput(result, input);
  return {
    schemaVersion: 1,
    designDigestSha256: matrix.designDigestSha256,
    cellId,
    pairId: cell.cell.pairId,
    replicateId,
    shockType: input.scenario.shockType,
    shockMagnitudeBps: shockMagnitudeBps(input.scenario),
    shockEnabled: input.shockEnabled ?? true,
    authorization,
    result,
  };
}
