import type { CompiledFormalMatrix } from '../runner/formal-compiler';
import { semanticDigestSha256 } from '../runner/digest';
import { z } from 'zod';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const shardEntrySchema = z.object({
  shardId: z.string().min(1),
  pairId: z.string().min(1),
  replicateStart: z.number().int().nonnegative().safe(),
  replicateEndExclusive: z.number().int().positive().safe(),
  replicateCount: z.number().int().positive().safe(),
}).strict();
const shardPlanSchema = z.object({
  schemaVersion: z.literal(1),
  designDigestSha256: digest,
  maxReplicatesPerShard: z.number().int().positive().safe(),
  pairCount: z.number().int().positive().safe(),
  totalPairReplicates: z.number().int().positive().safe(),
  shardCount: z.number().int().positive().safe(),
  shards: z.array(shardEntrySchema).min(1),
  semanticDigestSha256: digest,
}).strict();

export type FormalShardPlanEntry = {
  shardId: string;
  pairId: string;
  replicateStart: number;
  replicateEndExclusive: number;
  replicateCount: number;
};

export type FormalShardPlan = {
  schemaVersion: 1;
  designDigestSha256: string;
  maxReplicatesPerShard: number;
  pairCount: number;
  totalPairReplicates: number;
  shardCount: number;
  shards: FormalShardPlanEntry[];
  semanticDigestSha256: string;
};

function pairReplicationCounts(matrix: CompiledFormalMatrix): Map<string, number> {
  const counts = new Map<string, number>();
  const cellCounts = new Map<string, number>();
  for (const { cell } of matrix.cells) {
    const prior = counts.get(cell.pairId);
    if (prior !== undefined && prior !== cell.replicates) {
      throw new Error(`FORMAL_SHARD_PAIR_REPLICATE_MISMATCH:${cell.pairId}`);
    }
    counts.set(cell.pairId, cell.replicates);
    cellCounts.set(cell.pairId, (cellCounts.get(cell.pairId) ?? 0) + 1);
  }
  for (const [pairId, count] of cellCounts) {
    if (count !== 2) throw new Error(`FORMAL_SHARD_PAIR_SIZE_MISMATCH:${pairId}`);
  }
  return counts;
}

export function createFormalShardPlan(
  matrix: CompiledFormalMatrix,
  maxReplicatesPerShard = 50,
): FormalShardPlan {
  if (!Number.isSafeInteger(maxReplicatesPerShard) || maxReplicatesPerShard <= 0) {
    throw new Error('INVALID_FORMAL_SHARD_SIZE');
  }
  const pairCounts = pairReplicationCounts(matrix);
  const shards = [...pairCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([pairId, replicates]) => {
      const entries: FormalShardPlanEntry[] = [];
      for (let start = 0; start < replicates; start += maxReplicatesPerShard) {
        const end = Math.min(replicates, start + maxReplicatesPerShard);
        entries.push({
          shardId: `${pairId}:r${String(start).padStart(4, '0')}-${String(end - 1).padStart(4, '0')}`,
          pairId,
          replicateStart: start,
          replicateEndExclusive: end,
          replicateCount: end - start,
        });
      }
      return entries;
    });
  const withoutDigest = {
    schemaVersion: 1 as const,
    designDigestSha256: matrix.designDigestSha256,
    maxReplicatesPerShard,
    pairCount: pairCounts.size,
    totalPairReplicates: [...pairCounts.values()].reduce((sum, count) => sum + count, 0),
    shardCount: shards.length,
    shards,
  };
  const plan = { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
  assertFormalShardPlan(plan, matrix);
  return plan;
}

export function assertFormalShardPlan(
  plan: FormalShardPlan,
  matrix: CompiledFormalMatrix,
): void {
  const { semanticDigestSha256: recordedDigest, ...withoutDigest } = plan;
  if (semanticDigestSha256(withoutDigest) !== recordedDigest) {
    throw new Error('FORMAL_SHARD_PLAN_DIGEST_MISMATCH');
  }
  if (
    plan.schemaVersion !== 1
    || plan.designDigestSha256 !== matrix.designDigestSha256
    || plan.shardCount !== plan.shards.length
  ) throw new Error('FORMAL_SHARD_PLAN_METADATA_MISMATCH');
  const pairCounts = pairReplicationCounts(matrix);
  if (plan.pairCount !== pairCounts.size) throw new Error('FORMAL_SHARD_PLAN_PAIR_COUNT_MISMATCH');
  const total = [...pairCounts.values()].reduce((sum, count) => sum + count, 0);
  if (plan.totalPairReplicates !== total) throw new Error('FORMAL_SHARD_PLAN_TOTAL_MISMATCH');
  const seenIds = new Set<string>();
  for (const [pairId, replicates] of pairCounts) {
    const shards = plan.shards
      .filter((entry) => entry.pairId === pairId)
      .sort((left, right) => left.replicateStart - right.replicateStart);
    let next = 0;
    for (const shard of shards) {
      if (
        seenIds.has(shard.shardId)
        || shard.replicateStart !== next
        || shard.replicateEndExclusive <= shard.replicateStart
        || shard.replicateCount !== shard.replicateEndExclusive - shard.replicateStart
        || shard.replicateCount > plan.maxReplicatesPerShard
      ) throw new Error(`INVALID_FORMAL_SHARD_RANGE:${shard.shardId}`);
      seenIds.add(shard.shardId);
      next = shard.replicateEndExclusive;
    }
    if (next !== replicates) throw new Error(`INCOMPLETE_FORMAL_SHARD_PAIR:${pairId}`);
  }
  if (seenIds.size !== plan.shards.length) throw new Error('FORMAL_SHARD_PLAN_UNKNOWN_PAIR');
}

export function parseFormalShardPlan(
  value: unknown,
  matrix: CompiledFormalMatrix,
): FormalShardPlan {
  const plan = shardPlanSchema.parse(value) as FormalShardPlan;
  assertFormalShardPlan(plan, matrix);
  return plan;
}
