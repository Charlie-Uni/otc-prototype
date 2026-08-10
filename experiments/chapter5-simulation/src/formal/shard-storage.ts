import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import type { FormalShardPlan } from './shard-plan';
import { assertFormalShardResult, type FormalShardResult } from './shard-runner';

let temporaryFileOrdinal = 0;

function shardStem(shardId: string): string {
  const readable = shardId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96);
  const suffix = createHash('sha256').update(shardId).digest('hex').slice(0, 12);
  return `${readable}-${suffix}`;
}

export function formalShardResultFileName(shardId: string): string {
  return `${shardStem(shardId)}.json`;
}

function parseExisting(path: string, plan: FormalShardPlan): FormalShardResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    assertFormalShardResult(parsed as FormalShardResult, plan);
  } catch {
    throw new Error('EXISTING_FORMAL_SHARD_INVALID');
  }
  return parsed as FormalShardResult;
}

export type FormalShardPersistence = {
  path: string;
  created: boolean;
  semanticDigestSha256: string;
};

export function persistFormalShardResult(
  outputDirectory: string,
  result: FormalShardResult,
  plan: FormalShardPlan,
): FormalShardPersistence {
  assertFormalShardResult(result, plan);
  mkdirSync(outputDirectory, { recursive: true });
  const finalPath = resolve(outputDirectory, formalShardResultFileName(result.shardId));
  if (existsSync(finalPath)) {
    const existing = parseExisting(finalPath, plan);
    if (existing.semanticDigestSha256 !== result.semanticDigestSha256) {
      throw new Error('EXISTING_FORMAL_SHARD_CONFLICT');
    }
    return { path: finalPath, created: false, semanticDigestSha256: result.semanticDigestSha256 };
  }
  temporaryFileOrdinal += 1;
  const temporaryPath = `${finalPath}.partial-${process.pid}-${temporaryFileOrdinal}`;
  writeFileSync(temporaryPath, `${JSON.stringify(result)}\n`, { flag: 'wx' });
  try {
    // A hard link publishes the completed temporary file without replacing an existing shard.
    linkSync(temporaryPath, finalPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = parseExisting(finalPath, plan);
    if (existing.semanticDigestSha256 !== result.semanticDigestSha256) {
      throw new Error('EXISTING_FORMAL_SHARD_CONFLICT');
    }
    return { path: finalPath, created: false, semanticDigestSha256: result.semanticDigestSha256 };
  }
  rmSync(temporaryPath, { force: true });
  return { path: finalPath, created: true, semanticDigestSha256: result.semanticDigestSha256 };
}

export function persistFormalShardFailure(
  outputDirectory: string,
  plan: FormalShardPlan,
  shardId: string,
  error: unknown,
): string {
  mkdirSync(outputDirectory, { recursive: true });
  temporaryFileOrdinal += 1;
  const path = resolve(
    outputDirectory,
    `${shardStem(shardId)}.failure-${Date.now()}-${process.pid}-${temporaryFileOrdinal}.json`,
  );
  const evidence = {
    schemaVersion: 1,
    status: 'failed',
    shardId,
    designDigestSha256: plan.designDigestSha256,
    shardPlanDigestSha256: plan.semanticDigestSha256,
    failedAt: new Date().toISOString(),
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  };
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return path;
}
