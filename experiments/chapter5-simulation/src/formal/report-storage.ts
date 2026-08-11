import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { semanticDigestSha256 } from '../runner/digest';
import { publishImmutableText } from './immutable-file';
import type { FormalAnalysisReport } from './reporting';
import type { FormalShardSetSummary } from './shard-set';

export type FormalReportEvidence = {
  schemaVersion: 1;
  designDigestSha256: string;
  shardPlanDigestSha256: string;
  resultSetDigestSha256: string;
  resultSetSummaryDigestSha256: string;
  authorization: FormalShardSetSummary['authorization'];
  report: FormalAnalysisReport;
  semanticDigestSha256: string;
};

export function createFormalReportEvidence(
  shardSet: FormalShardSetSummary,
  report: FormalAnalysisReport,
): FormalReportEvidence {
  const withoutDigest = {
    schemaVersion: 1 as const,
    designDigestSha256: shardSet.designDigestSha256,
    shardPlanDigestSha256: shardSet.shardPlanDigestSha256,
    resultSetDigestSha256: shardSet.resultSetDigestSha256,
    resultSetSummaryDigestSha256: shardSet.semanticDigestSha256,
    authorization: shardSet.authorization,
    report,
  };
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}

export function persistFormalReportEvidence(
  outputPath: string,
  evidence: FormalReportEvidence,
): { path: string; created: boolean; semanticDigestSha256: string } {
  const path = resolve(outputPath);
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  const created = publishImmutableText(path, serialized, 'EXISTING_FORMAL_REPORT_CONFLICT');
  return { path, created, semanticDigestSha256: evidence.semanticDigestSha256 };
}
