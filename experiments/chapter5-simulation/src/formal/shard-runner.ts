import type { SimulationConfig } from '../core/config';
import {
  assertFormalExecutionAuthorization,
  assertFormalExecutionAuthorized,
  type FormalExecutionAuthorization,
} from '../runner/formal-provenance';
import {
  executeFormalReplicate,
  type FormalExecutionDependencies,
  type FormalReplicateResult,
} from '../runner/formal-executor';
import type { CompiledFormalMatrix } from '../runner/formal-compiler';
import { semanticDigestSha256 } from '../runner/digest';
import {
  assertFormalPairObservationDigest,
  createFormalPairObservation,
  type FormalMeasurementSpec,
  type FormalPairObservation,
} from './measurement';
import { assertFormalShardPlan, type FormalShardPlan } from './shard-plan';

export type FormalShardResult = {
  schemaVersion: 1;
  designDigestSha256: string;
  shardPlanDigestSha256: string;
  shardId: string;
  pairId: string;
  replicateStart: number;
  replicateEndExclusive: number;
  replicateCount: number;
  authorization: FormalExecutionAuthorization;
  observations: FormalPairObservation[];
  semanticDigestSha256: string;
};

type ReplicateExecutor = (
  matrix: CompiledFormalMatrix,
  baselineConfig: SimulationConfig,
  cellId: string,
  replicateId: number,
  dependencies?: FormalExecutionDependencies,
) => FormalReplicateResult;

export type FormalShardDependencies = {
  authorize?: () => FormalExecutionAuthorization;
  executeReplicate?: ReplicateExecutor;
};

export function executeFormalShard(
  matrix: CompiledFormalMatrix,
  baselineConfig: SimulationConfig,
  plan: FormalShardPlan,
  shardId: string,
  measurementSpec: FormalMeasurementSpec,
  dependencies: FormalShardDependencies = {},
): FormalShardResult {
  assertFormalShardPlan(plan, matrix);
  const shard = plan.shards.find((entry) => entry.shardId === shardId);
  if (!shard) throw new Error(`UNKNOWN_FORMAL_SHARD:${shardId}`);
  const pair = matrix.cells
    .filter(({ cell }) => cell.pairId === shard.pairId)
    .sort((left, right) => left.cell.cellId.localeCompare(right.cell.cellId));
  if (pair.length !== 2) throw new Error(`INVALID_FORMAL_SHARD_PAIR:${shard.pairId}`);
  const authorization = (dependencies.authorize ?? assertFormalExecutionAuthorized)();
  assertFormalExecutionAuthorization(authorization);
  const execute = dependencies.executeReplicate ?? executeFormalReplicate;
  const observations: FormalPairObservation[] = [];
  for (
    let replicateId = shard.replicateStart;
    replicateId < shard.replicateEndExclusive;
    replicateId += 1
  ) {
    const left = execute(matrix, baselineConfig, pair[0]!.cell.cellId, replicateId, {
      authorize: () => authorization,
    });
    const right = execute(matrix, baselineConfig, pair[1]!.cell.cellId, replicateId, {
      authorize: () => authorization,
    });
    observations.push(createFormalPairObservation(
      left,
      right,
      pair[0]!,
      pair[1]!,
      measurementSpec,
    ));
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    designDigestSha256: matrix.designDigestSha256,
    shardPlanDigestSha256: plan.semanticDigestSha256,
    shardId: shard.shardId,
    pairId: shard.pairId,
    replicateStart: shard.replicateStart,
    replicateEndExclusive: shard.replicateEndExclusive,
    replicateCount: shard.replicateCount,
    authorization,
    observations,
  };
  const result = { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
  assertFormalShardResult(result, plan);
  return result;
}

export function assertFormalShardResult(
  result: FormalShardResult,
  plan: FormalShardPlan,
): void {
  assertFormalExecutionAuthorization(result.authorization);
  const { semanticDigestSha256: recordedDigest, ...withoutDigest } = result;
  if (semanticDigestSha256(withoutDigest) !== recordedDigest) {
    throw new Error('FORMAL_SHARD_RESULT_DIGEST_MISMATCH');
  }
  const shard = plan.shards.find((entry) => entry.shardId === result.shardId);
  if (
    !shard
    || result.designDigestSha256 !== plan.designDigestSha256
    || result.shardPlanDigestSha256 !== plan.semanticDigestSha256
    || result.pairId !== shard.pairId
    || result.replicateStart !== shard.replicateStart
    || result.replicateEndExclusive !== shard.replicateEndExclusive
    || result.replicateCount !== shard.replicateCount
    || result.observations.length !== shard.replicateCount
  ) throw new Error('FORMAL_SHARD_RESULT_SCOPE_MISMATCH');
  const replicateIds = result.observations.map(({ replicateId }) => replicateId);
  if (
    new Set(replicateIds).size !== replicateIds.length
    || replicateIds.some((replicateId, index) => replicateId !== shard.replicateStart + index)
    || result.observations.some((observation) => (
      observation.pairId !== shard.pairId
      || observation.designDigestSha256 !== plan.designDigestSha256
      || semanticDigestSha256(observation.authorization)
        !== semanticDigestSha256(result.authorization)
    ))
  ) throw new Error('FORMAL_SHARD_RESULT_OBSERVATION_MISMATCH');
  result.observations.forEach(assertFormalPairObservationDigest);
}

export function parseFormalShardResult(
  value: unknown,
  plan: FormalShardPlan,
): FormalShardResult {
  assertFormalShardResult(value as FormalShardResult, plan);
  return value as FormalShardResult;
}
