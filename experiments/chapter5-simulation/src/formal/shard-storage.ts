import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { semanticDigestSha256 } from '../runner/digest';
import type { FormalExecutionAuthorization } from '../runner/formal-provenance';
import { publishImmutableText } from './immutable-file';
import type { FormalShardPlan } from './shard-plan';
import { assertFormalShardResult, type FormalShardResult } from './shard-runner';

let failureFileOrdinal = 0;

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

export type FormalPlanPersistence = {
  path: string;
  created: boolean;
  semanticDigestSha256: string;
};

export function persistFormalShardPlanFile(
  outputPath: string,
  plan: FormalShardPlan,
): FormalPlanPersistence {
  const path = resolve(outputPath);
  mkdirSync(dirname(path), { recursive: true });
  const created = publishImmutableText(
    path,
    `${JSON.stringify(plan, null, 2)}\n`,
    'IMMUTABLE_FORMAL_FILE_CONFLICT',
  );
  return { path, created, semanticDigestSha256: plan.semanticDigestSha256 };
}

export function formalShardResultExists(
  outputDirectory: string,
  shardId: string,
  plan: FormalShardPlan,
  expectedAuthorization: FormalExecutionAuthorization,
): boolean {
  const path = resolve(outputDirectory, formalShardResultFileName(shardId));
  if (!existsSync(path)) return false;
  const result = parseExisting(path, plan);
  if (
    result.shardId !== shardId
    || semanticDigestSha256(result.authorization) !== semanticDigestSha256(expectedAuthorization)
  ) throw new Error('EXISTING_FORMAL_SHARD_AUTHORIZATION_MISMATCH');
  return true;
}

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
  const created = publishImmutableText(
    finalPath,
    `${JSON.stringify(result)}\n`,
    'EXISTING_FORMAL_SHARD_CONFLICT',
  );
  return { path: finalPath, created, semanticDigestSha256: result.semanticDigestSha256 };
}

export function persistFormalShardFailure(
  outputDirectory: string,
  plan: FormalShardPlan,
  shardId: string,
  error: unknown,
): string {
  mkdirSync(outputDirectory, { recursive: true });
  failureFileOrdinal += 1;
  const path = resolve(
    outputDirectory,
    `${shardStem(shardId)}.failure-${Date.now()}-${process.pid}-${failureFileOrdinal}.json`,
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
