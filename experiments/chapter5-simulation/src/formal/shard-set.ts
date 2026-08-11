import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FormalExecutionAuthorization } from '../runner/formal-provenance';
import { semanticDigestSha256 } from '../runner/digest';
import type { FormalPairObservation } from './measurement';
import type { FormalShardPlan } from './shard-plan';
import { parseFormalShardResult } from './shard-runner';
import { formalShardResultFileName } from './shard-storage';

export type FormalShardEvidenceDigest = {
  shardId: string;
  semanticDigestSha256: string;
};

export type FormalFailureEvidence = {
  fileName: string;
  shardId: string;
  failedAt: string;
  errorName: string;
  errorMessage: string;
};

export type FormalShardSetSummary = {
  schemaVersion: 1;
  designDigestSha256: string;
  shardPlanDigestSha256: string;
  authorization: FormalExecutionAuthorization;
  expectedShardCount: number;
  loadedShardCount: number;
  expectedPairReplicates: number;
  loadedPairObservations: number;
  shardDigests: FormalShardEvidenceDigest[];
  resultSetDigestSha256: string;
  failureEvidence: FormalFailureEvidence[];
  semanticDigestSha256: string;
};

function loadJson(path: string, errorCode: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`${errorCode}:${path}`);
  }
}

function requireFailureEvidence(
  fileName: string,
  value: unknown,
  plan: FormalShardPlan,
): FormalFailureEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`INVALID_FORMAL_FAILURE_EVIDENCE:${fileName}`);
  }
  const record = value as Record<string, unknown>;
  const shardId = record.shardId;
  const failedAt = record.failedAt;
  const errorName = record.errorName;
  const errorMessage = record.errorMessage;
  if (
    record.schemaVersion !== 1
    || record.status !== 'failed'
    || typeof shardId !== 'string'
    || !plan.shards.some((entry) => entry.shardId === shardId)
    || record.designDigestSha256 !== plan.designDigestSha256
    || record.shardPlanDigestSha256 !== plan.semanticDigestSha256
    || typeof failedAt !== 'string'
    || !Number.isFinite(Date.parse(failedAt))
    || typeof errorName !== 'string'
    || typeof errorMessage !== 'string'
  ) throw new Error(`INVALID_FORMAL_FAILURE_EVIDENCE:${fileName}`);
  return { fileName, shardId, failedAt, errorName, errorMessage };
}

export function scanFormalShardSet(
  inputDirectory: string,
  plan: FormalShardPlan,
  onObservation?: (observation: FormalPairObservation) => void,
): FormalShardSetSummary {
  const directoryEntries = readdirSync(inputDirectory, { withFileTypes: true });
  const partialFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.includes('.partial-'))
    .map(({ name }) => name)
    .sort();
  if (partialFiles.length > 0) {
    throw new Error(`FORMAL_SHARD_SET_NOT_QUIESCENT:${partialFiles.join(',')}`);
  }
  const files = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map(({ name }) => name)
    .sort();
  const expectedFiles = new Set(plan.shards.map(({ shardId }) => (
    formalShardResultFileName(shardId)
  )));
  const resultFiles = files.filter((name) => !name.includes('.failure-'));
  const unknownFiles = resultFiles.filter((name) => !expectedFiles.has(name));
  if (unknownFiles.length > 0) {
    throw new Error(`UNKNOWN_FORMAL_SHARD_FILES:${unknownFiles.join(',')}`);
  }
  const actualFiles = new Set(resultFiles);
  const missingFiles = [...expectedFiles].filter((name) => !actualFiles.has(name));
  if (missingFiles.length > 0) {
    throw new Error(`MISSING_FORMAL_SHARD_FILES:${missingFiles.join(',')}`);
  }

  let authorization: FormalExecutionAuthorization | null = null;
  let authorizationDigest: string | null = null;
  let loadedPairObservations = 0;
  const shardDigests: FormalShardEvidenceDigest[] = [];
  for (const shard of plan.shards) {
    const fileName = formalShardResultFileName(shard.shardId);
    let result;
    try {
      result = parseFormalShardResult(
        loadJson(resolve(inputDirectory, fileName), 'INVALID_FORMAL_SHARD_JSON'),
        plan,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`INVALID_FORMAL_SHARD_FILE:${fileName}:${message}`);
    }
    if (result.shardId !== shard.shardId) {
      throw new Error(`FORMAL_SHARD_FILENAME_SCOPE_MISMATCH:${fileName}`);
    }
    const currentAuthorizationDigest = semanticDigestSha256(result.authorization);
    if (authorizationDigest !== null && currentAuthorizationDigest !== authorizationDigest) {
      throw new Error(`FORMAL_SHARD_AUTHORIZATION_MISMATCH:${fileName}`);
    }
    authorization ??= result.authorization;
    authorizationDigest ??= currentAuthorizationDigest;
    loadedPairObservations += result.observations.length;
    shardDigests.push({
      shardId: result.shardId,
      semanticDigestSha256: result.semanticDigestSha256,
    });
  }
  if (!authorization || loadedPairObservations !== plan.totalPairReplicates) {
    throw new Error('INCOMPLETE_FORMAL_SHARD_SET');
  }

  const failureEvidence = files
    .filter((name) => name.includes('.failure-'))
    .map((fileName) => requireFailureEvidence(
      fileName,
      loadJson(resolve(inputDirectory, fileName), 'INVALID_FORMAL_FAILURE_JSON'),
      plan,
    ));
  const resultSetBasis = {
    schemaVersion: 1 as const,
    designDigestSha256: plan.designDigestSha256,
    shardPlanDigestSha256: plan.semanticDigestSha256,
    authorization,
    expectedShardCount: plan.shardCount,
    loadedShardCount: shardDigests.length,
    expectedPairReplicates: plan.totalPairReplicates,
    loadedPairObservations,
    shardDigests,
  };
  const resultSetDigestSha256 = semanticDigestSha256(resultSetBasis);
  const withoutDigest = {
    ...resultSetBasis,
    resultSetDigestSha256,
    failureEvidence,
  };
  if (onObservation) {
    for (const [index, shard] of plan.shards.entries()) {
      const fileName = formalShardResultFileName(shard.shardId);
      const result = parseFormalShardResult(
        loadJson(resolve(inputDirectory, fileName), 'INVALID_FORMAL_SHARD_JSON'),
        plan,
      );
      if (
        result.shardId !== shard.shardId
        || result.semanticDigestSha256 !== shardDigests[index]?.semanticDigestSha256
      ) {
        throw new Error(`FORMAL_SHARD_CHANGED_DURING_SCAN:${fileName}`);
      }
      result.observations.forEach(onObservation);
    }
  }
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}
