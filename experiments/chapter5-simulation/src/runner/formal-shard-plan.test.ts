import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import type { FormalExperimentMatrix } from '../preregistration/matrix';
import { assertFormalShardPlan, createFormalShardPlan } from '../formal/shard-plan';
import { compileFormalMatrix } from './formal-compiler';
import { semanticDigestSha256 } from './digest';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;
const compiled = compileFormalMatrix(matrix, baseline);

test('partitions all 43,000 paired replicates without gaps or overlaps', () => {
  const plan = createFormalShardPlan(compiled, 50);
  assert.equal(plan.pairCount, 72);
  assert.equal(plan.totalPairReplicates, 43_000);
  assert.equal(plan.shardCount, 860);
  assert.ok(plan.shards.every(({ replicateCount }) => replicateCount === 50));
  assert.deepEqual(createFormalShardPlan(compiled, 50), plan);
  assert.doesNotThrow(() => assertFormalShardPlan(plan, compiled));
});

test('rejects a rehashed shard plan with a range gap', () => {
  const plan = createFormalShardPlan(compiled, 50);
  const tampered = structuredClone(plan);
  const pairId = tampered.shards[0]!.pairId;
  const second = tampered.shards.find((entry) => (
    entry.pairId === pairId && entry.replicateStart === 50
  ))!;
  second.replicateStart = 51;
  second.replicateCount = second.replicateEndExclusive - second.replicateStart;
  const { semanticDigestSha256: _ignored, ...withoutDigest } = tampered;
  tampered.semanticDigestSha256 = semanticDigestSha256(withoutDigest);
  assert.throws(
    () => assertFormalShardPlan(tampered, compiled),
    /INVALID_FORMAL_SHARD_RANGE/,
  );
});
