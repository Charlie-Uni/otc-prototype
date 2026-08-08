import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { summarizeGasRuns } from './gas-analysis.mjs';
import { startReplayScenario } from './replay-chain.mjs';
import {
  REPO_ROOT,
  command,
  createRunContext,
  loadRunInputs,
  sha256,
  writeEvidence,
  writeFailure,
} from './run-common.mjs';
import { validateRunSummary } from './run-summary-validator.mjs';

const REPLICATES_PER_BATCH = 5;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function collectBatch(firstPort) {
  const runs = [];
  for (let replicate = 0; replicate < REPLICATES_PER_BATCH; replicate += 1) {
    const session = await startReplayScenario(firstPort + replicate);
    try {
      runs.push(session.checkpoints.map((checkpoint) => ({
        operationId: checkpoint.operationId,
        label: checkpoint.label,
        gasUsed: checkpoint.gasUsed,
      })));
    } finally {
      await session.close();
    }
  }
  return runs;
}

const context = await createRunContext('gas');

try {
  const inputs = await loadRunInputs();
  command('forge', ['build'], { cwd: resolve(REPO_ROOT, 'contracts') });

  const runs1 = await collectBatch(18_560);
  const runs2 = await collectBatch(18_570);
  const table1 = summarizeGasRuns(runs1);
  const table2 = summarizeGasRuns(runs2);
  invariant(JSON.stringify(table1) === JSON.stringify(table2), 'repeated gas batches produced different results');

  const tableContents = canonicalJson(table1);
  const evidenceFiles = {
    'gas-runs-1.json': canonicalJson(runs1),
    'gas-runs-2.json': canonicalJson(runs2),
    'gas-table.json': tableContents,
  };
  const evidenceManifestSha256 = await writeEvidence({
    outputDirectory: context.outputDirectory,
    title: 'Paper 8.5 production contract gas evidence SHA-256 manifest',
    metadata: {
      sourceCommit: inputs.sourceCommit,
      evaluationLockSha256: inputs.evaluationLockSha256,
      headCommit: inputs.repository.headCommit,
    },
    files: evidenceFiles,
  });

  const summary = {
    schemaVersion: 1,
    preregistration: {
      tag: 'paper85-prereg-v1',
      commitSha: inputs.preregistrationCommit,
      manifestSha256: inputs.manifestHash,
    },
    sourceArtifact: {
      tag: 'chapter3-artifact-v1.4.0',
      commitSha: inputs.sourceCommit,
      evidenceAnchor: inputs.manifest.sourceArtifact.evidenceAnchor,
    },
    run: {
      runId: context.runId,
      startedAt: context.startedAt,
      chainId: inputs.manifest.determinism.chainId,
      genesisTimestamp: inputs.manifest.determinism.genesisTimestamp,
      repository: inputs.repository,
      toolchain: { foundry: inputs.forgeVersion },
      replicatesPerBatch: REPLICATES_PER_BATCH,
      repeatedBatches: 2,
      measurement: {
        evaluationLockSha256: inputs.evaluationLockSha256,
        experimentalVariant: false,
        interpretation: 'descriptive local-EVM gas cost, not a production fee or causal overhead estimate',
      },
    },
    counts: {
      batches: 2,
      replicatesPerBatch: REPLICATES_PER_BATCH,
      operationsPerReplicate: runs1[0].length,
      measuredTransactions: 2 * REPLICATES_PER_BATCH * runs1[0].length,
    },
    metrics: {
      repeatedBatchMatches: true,
      gasTableSha256: sha256(tableContents),
      categories: table1.categories,
    },
    evidenceManifestSha256,
  };
  validateRunSummary(summary);
  await writeFile(join(context.outputDirectory, 'run-summary.json'), canonicalJson(summary));
  process.stdout.write(canonicalJson({ outputDirectory: context.outputDirectory, summary }));
} catch (error) {
  await writeFailure(context, error);
  throw error;
}
