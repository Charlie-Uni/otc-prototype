import type { FormalShardPlan, FormalShardPlanEntry } from './shard-plan';

export type FormalOrchestrationSummary = {
  schemaVersion: 1;
  shardPlanDigestSha256: string;
  workerCount: number;
  totalShardCount: number;
  skippedShardCount: number;
  executedShardCount: number;
  failedShardIds: string[];
};

export type FormalOrchestrationDependencies = {
  isComplete: (shard: FormalShardPlanEntry) => boolean | Promise<boolean>;
  execute: (shard: FormalShardPlanEntry) => void | Promise<void>;
};

export async function runFormalShardQueue(
  plan: FormalShardPlan,
  workerCount: number,
  dependencies: FormalOrchestrationDependencies,
): Promise<FormalOrchestrationSummary> {
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0 || workerCount > 64) {
    throw new Error('INVALID_FORMAL_WORKER_COUNT');
  }
  const pending: FormalShardPlanEntry[] = [];
  let skippedShardCount = 0;
  for (const shard of plan.shards) {
    if (await dependencies.isComplete(shard)) skippedShardCount += 1;
    else pending.push(shard);
  }

  let nextIndex = 0;
  let executedShardCount = 0;
  let stop = false;
  const failedShardIds: string[] = [];
  async function worker(): Promise<void> {
    while (!stop) {
      const index = nextIndex;
      nextIndex += 1;
      const shard = pending[index];
      if (!shard) return;
      try {
        await dependencies.execute(shard);
        executedShardCount += 1;
      } catch {
        failedShardIds.push(shard.shardId);
        stop = true;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(workerCount, Math.max(1, pending.length)) },
    () => worker(),
  ));
  const summary = {
    schemaVersion: 1 as const,
    shardPlanDigestSha256: plan.semanticDigestSha256,
    workerCount,
    totalShardCount: plan.shardCount,
    skippedShardCount,
    executedShardCount,
    failedShardIds: failedShardIds.sort(),
  };
  if (failedShardIds.length > 0) {
    throw new Error(`FORMAL_ORCHESTRATION_FAILED:${JSON.stringify(summary)}`);
  }
  if (skippedShardCount + executedShardCount !== plan.shardCount) {
    throw new Error('FORMAL_ORCHESTRATION_INCOMPLETE');
  }
  return summary;
}
