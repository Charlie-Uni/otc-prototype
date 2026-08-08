import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  REPO_ROOT,
  command,
  createRunContext,
  loadRunInputs,
  sha256,
  writeEvidence,
  writeFailure,
} from './run-common.mjs';
import { startReplayScenario } from './replay-chain.mjs';
import {
  applyReplayEvent,
  createReplayState,
  finalizeNavReferences,
  normalizedProjection,
  projectionEquals,
} from './replay-engine.mjs';
import { validateRunSummary } from './run-summary-validator.mjs';

const EXPECTED_ACCEPTED_OPERATIONS = 14;
const EXPECTED_NAV_REFERENCES = 2;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(jsonValue(value), null, 2)}\n`;
}

function projectionHash(projection) {
  return sha256(canonicalJson(projection));
}

function logsForCheckpoint(logs, checkpoint) {
  return logs.filter((log) => log.blockNumber === checkpoint.blockNumber);
}

async function runOnce(port) {
  const session = await startReplayScenario(port);
  try {
    invariant(
      session.checkpoints.length === EXPECTED_ACCEPTED_OPERATIONS,
      `expected ${EXPECTED_ACCEPTED_OPERATIONS} accepted operations, found ${session.checkpoints.length}`,
    );

    const state = createReplayState(session.genesis);
    const replayCheckpoints = [];
    const navReferences = [];
    let consumedLogs = 0;

    // Closed-input phase: only frozen genesis data and ordered eth_getLogs records are consumed.
    for (const checkpoint of session.checkpoints) {
      const logs = logsForCheckpoint(session.rawLogs, checkpoint);
      invariant(logs.length > 0, `${checkpoint.operationId}: accepted operation emitted no replayable event`);
      for (const log of logs) {
        invariant(
          log.transactionHash === checkpoint.transactionHash,
          `${checkpoint.operationId}: block contains an event from a different transaction`,
        );
        navReferences.push(...applyReplayEvent(state, log));
        consumedLogs += 1;
      }
      const projection = normalizedProjection(state);
      replayCheckpoints.push({
        operationId: checkpoint.operationId,
        label: checkpoint.label,
        blockNumber: checkpoint.blockNumber.toString(),
        transactionHash: checkpoint.transactionHash,
        gasUsed: checkpoint.gasUsed,
        eventNames: logs.map((log) => `${log.contractName}.${log.eventName}`),
        replayProjection: projection,
        replayProjectionSha256: projectionHash(projection),
      });
    }

    invariant(consumedLogs === session.rawLogs.length, 'raw event stream contains logs outside the checkpoint set');
    invariant(navReferences.length === EXPECTED_NAV_REFERENCES, `expected ${EXPECTED_NAV_REFERENCES} NAV references, found ${navReferences.length}`);

    // Comparison phase: view reads become available only after replay has fully completed.
    session.markReplayComplete();
    const comparisons = [];
    for (const checkpoint of replayCheckpoints) {
      const chainProjection = await session.readProjection(BigInt(checkpoint.blockNumber));
      comparisons.push({
        ...checkpoint,
        chainProjection,
        chainProjectionSha256: projectionHash(chainProjection),
        projectionMatches: projectionEquals(checkpoint.replayProjection, chainProjection),
      });
    }

    const finalizedNavReferences = finalizeNavReferences(state, navReferences);
    const subscriptionReferences = finalizedNavReferences.filter((item) => item.eventName === 'SubscriptionAccepted');
    const redemptionReferences = finalizedNavReferences.filter((item) => item.eventName === 'RedemptionSettled');
    const matchingProjections = comparisons.filter((item) => item.projectionMatches).length;
    const validNavReferences = finalizedNavReferences.filter((item) => item.valid).length;
    const metrics = {
      acceptedOperations: session.checkpoints.length,
      replayedOperations: replayCheckpoints.length,
      acceptedEvents: session.rawLogs.length,
      replayedEvents: consumedLogs,
      arc: consumedLogs / session.rawLogs.length,
      navReferences: navReferences.length,
      validNavReferences,
      nri: validNavReferences / navReferences.length,
      subscriptionNri: subscriptionReferences.filter((item) => item.valid).length / subscriptionReferences.length,
      redemptionNri: redemptionReferences.filter((item) => item.valid).length / redemptionReferences.length,
      projectionCheckpoints: comparisons.length,
      matchingProjections,
      pcr: matchingProjections / comparisons.length,
    };

    invariant(metrics.arc === 1, `ARC failed: ${metrics.replayedEvents}/${metrics.acceptedEvents}`);
    invariant(metrics.nri === 1, `NRI failed: ${validNavReferences}/${navReferences.length}`);
    invariant(metrics.pcr === 1, `PCR failed: ${matchingProjections}/${comparisons.length}`);

    const semanticObservation = {
      metrics,
      navReferences: finalizedNavReferences.map(({ transactionHash: _transactionHash, ...reference }) => reference),
      checkpoints: comparisons.map((checkpoint) => ({
        operationId: checkpoint.operationId,
        eventNames: checkpoint.eventNames,
        replayProjection: checkpoint.replayProjection,
        chainProjection: checkpoint.chainProjection,
        projectionMatches: checkpoint.projectionMatches,
      })),
    };

    return {
      metrics,
      genesis: session.genesis,
      bootstrapLogs: session.bootstrapLogs,
      checkpoints: comparisons,
      navReferences: finalizedNavReferences,
      rawLogs: session.rawLogs,
      semanticObservation,
      semanticEvidenceSha256: sha256(canonicalJson(semanticObservation)),
    };
  } finally {
    await session.close();
  }
}

const context = await createRunContext('replay');

try {
  const inputs = await loadRunInputs();
  command('forge', ['build'], { cwd: resolve(REPO_ROOT, 'contracts') });

  const run1 = await runOnce(18_546);
  const run2 = await runOnce(18_547);
  invariant(
    run1.semanticEvidenceSha256 === run2.semanticEvidenceSha256,
    'repeated replay runs produced different semantic evidence',
  );

  const evidenceFiles = {
    'replay-run-1.json': canonicalJson(run1),
    'replay-run-2.json': canonicalJson(run2),
    'semantic-observations.json': canonicalJson(run1.semanticObservation),
  };
  const evidenceManifestSha256 = await writeEvidence({
    outputDirectory: context.outputDirectory,
    title: 'Paper 8.5 closed-input replay evidence SHA-256 manifest',
    metadata: {
      sourceCommit: inputs.sourceCommit,
      manifestSha256: inputs.manifestHash,
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
      chainId: run1.genesis.chainId,
      genesisTimestamp: run1.genesis.genesisTimestamp,
      repository: inputs.repository,
      toolchain: { foundry: inputs.forgeVersion },
      measurement: {
        protocol: 'closed-input-event-replay-v1',
        preregistrationLockSha256: inputs.preregistrationLockSha256,
        evaluationLockSha256: inputs.evaluationLockSha256,
      },
    },
    counts: {
      acceptedOperations: run1.metrics.acceptedOperations,
      replayedOperations: run1.metrics.replayedOperations,
      acceptedEvents: run1.metrics.acceptedEvents,
      replayedEvents: run1.metrics.replayedEvents,
      navReferences: run1.metrics.navReferences,
      validNavReferences: run1.metrics.validNavReferences,
      projectionCheckpoints: run1.metrics.projectionCheckpoints,
      matchingProjections: run1.metrics.matchingProjections,
    },
    metrics: {
      arc: run1.metrics.arc,
      nri: run1.metrics.nri,
      subscriptionNri: run1.metrics.subscriptionNri,
      redemptionNri: run1.metrics.redemptionNri,
      pcr: run1.metrics.pcr,
      repeatedSemanticEvidenceMatches: true,
      semanticEvidenceSha256: run1.semanticEvidenceSha256,
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
