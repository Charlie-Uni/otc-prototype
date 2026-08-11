import assert from 'node:assert/strict';
import test from 'node:test';
import { runFormalShardQueue } from '../formal/orchestrator';
import type { FormalShardPlan } from '../formal/shard-plan';

function plan(shardCount: number): FormalShardPlan {
  return {
    schemaVersion: 1,
    designDigestSha256: 'a'.repeat(64),
    maxReplicatesPerShard: 1,
    pairCount: shardCount,
    totalPairReplicates: shardCount,
    shardCount,
    shards: Array.from({ length: shardCount }, (_, index) => ({
      shardId: `S${index}`,
      pairId: `P${index}`,
      replicateStart: 0,
      replicateEndExclusive: 1,
      replicateCount: 1,
    })),
    semanticDigestSha256: 'b'.repeat(64),
  };
}

test('runs each incomplete shard once with bounded concurrency and resume skips', async () => {
  const active = { value: 0, maximum: 0 };
  const executed: string[] = [];
  const summary = await runFormalShardQueue(plan(6), 2, {
    isComplete: ({ shardId }) => shardId === 'S1' || shardId === 'S4',
    execute: async ({ shardId }) => {
      active.value += 1;
      active.maximum = Math.max(active.maximum, active.value);
      await new Promise((resolve) => setTimeout(resolve, 1));
      executed.push(shardId);
      active.value -= 1;
    },
  });
  assert.equal(active.maximum, 2);
  assert.deepEqual(executed.sort(), ['S0', 'S2', 'S3', 'S5']);
  assert.deepEqual(summary, {
    schemaVersion: 1,
    shardPlanDigestSha256: 'b'.repeat(64),
    workerCount: 2,
    totalShardCount: 6,
    skippedShardCount: 2,
    executedShardCount: 4,
    failedShardIds: [],
  });
});

test('stops assigning new shards after the first worker failure', async () => {
  const started: string[] = [];
  await assert.rejects(
    () => runFormalShardQueue(plan(8), 2, {
      isComplete: () => false,
      execute: async ({ shardId }) => {
        started.push(shardId);
        if (shardId === 'S0') throw new Error('SYNTHETIC_FAILURE');
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    }),
    /FORMAL_ORCHESTRATION_FAILED/,
  );
  assert.ok(started.length <= 2);
  assert.ok(started.includes('S0'));
});
