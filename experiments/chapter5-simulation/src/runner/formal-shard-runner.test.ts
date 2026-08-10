import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import type { FormalExperimentMatrix } from '../preregistration/matrix';
import {
  compileFormalMatrix,
  compileFormalRunInput,
} from './formal-compiler';
import type { FormalReplicateResult } from './formal-executor';
import { runSimulation } from './run';
import { semanticDigestSha256 } from './digest';
import { shockMagnitudeBps } from '../shocks/scenario';
import { createFormalShardPlan } from '../formal/shard-plan';
import { assertFormalShardResult, executeFormalShard } from '../formal/shard-runner';
import {
  persistFormalShardFailure,
  persistFormalShardResult,
} from '../formal/shard-storage';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;
const compiled = compileFormalMatrix(matrix, baseline);
const authorization = {
  preregistrationTag: 'chapter5-sim-prereg-v1' as const,
  preregistrationCommit: 'a'.repeat(40),
  executionCommit: 'b'.repeat(40),
  preregistrationLockSha256: 'c'.repeat(64),
};

function executeOneDay(
  compiledMatrix: typeof compiled,
  _baselineConfig: typeof baseline,
  cellId: string,
  replicateId: number,
): FormalReplicateResult {
  const cell = compiledMatrix.cells.find(({ cell: candidate }) => candidate.cellId === cellId)!;
  const input = compileFormalRunInput(cell, baseline, replicateId);
  const result = runSimulation({ ...input, horizonDays: 1 });
  return {
    schemaVersion: 1,
    designDigestSha256: compiledMatrix.designDigestSha256,
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

test('executes one complete pair shard with one shared authorization', () => {
  const plan = createFormalShardPlan(compiled, 1);
  const result = executeFormalShard(
    compiled,
    baseline,
    plan,
    'A1:r0000-0000',
    { windowDays: [1], sensitivityThresholdBps: 6_000 },
    { authorize: () => authorization, executeReplicate: executeOneDay },
  );
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.arms.length, 2);
  assert.deepEqual(result.observations[0]?.arms.map(({ arm }) => arm), ['baseline', 'comparison']);
  assert.equal(result.observations[0]?.primaryShockLinkedDetection, null);
  assert.doesNotThrow(() => assertFormalShardResult(result, plan));

  const directory = mkdtempSync(join(tmpdir(), 'chapter5-formal-shard-'));
  try {
    const first = persistFormalShardResult(directory, result, plan);
    const second = persistFormalShardResult(directory, result, plan);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.path, second.path);
    assert.equal(JSON.parse(readFileSync(first.path, 'utf8')).semanticDigestSha256, result.semanticDigestSha256);
    const conflict = structuredClone(result);
    conflict.authorization.executionCommit = 'd'.repeat(40);
    for (const observation of conflict.observations) {
      observation.authorization.executionCommit = 'd'.repeat(40);
      const { semanticDigestSha256: _observationDigest, ...observationWithoutDigest } = observation;
      observation.semanticDigestSha256 = semanticDigestSha256(observationWithoutDigest);
    }
    const { semanticDigestSha256: _resultDigest, ...resultWithoutDigest } = conflict;
    conflict.semanticDigestSha256 = semanticDigestSha256(resultWithoutDigest);
    assert.throws(
      () => persistFormalShardResult(directory, conflict, plan),
      /EXISTING_FORMAL_SHARD_CONFLICT/,
    );
    const failurePath = persistFormalShardFailure(
      directory,
      plan,
      result.shardId,
      new Error('SYNTHETIC_FORMAL_FAILURE'),
    );
    const failure = JSON.parse(readFileSync(failurePath, 'utf8')) as Record<string, unknown>;
    assert.equal(failure.status, 'failed');
    assert.equal(failure.errorMessage, 'SYNTHETIC_FORMAL_FAILURE');
    assert.equal(failure.shardPlanDigestSha256, plan.semanticDigestSha256);
    assert.equal(
      JSON.parse(readFileSync(first.path, 'utf8')).semanticDigestSha256,
      result.semanticDigestSha256,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fails fast when a replicate executor returns the wrong cell', () => {
  const plan = createFormalShardPlan(compiled, 1);
  assert.throws(() => executeFormalShard(
    compiled,
    baseline,
    plan,
    'A1:r0000-0000',
    { windowDays: [1], sensitivityThresholdBps: 6_000 },
    {
      authorize: () => authorization,
      executeReplicate: (matrixInput, config, cellId, replicateId) => ({
        ...executeOneDay(matrixInput, config, cellId, replicateId),
        cellId: 'tampered',
      }),
    },
  ), /FORMAL_MEASUREMENT_EXECUTION_SCOPE_MISMATCH/);
});
