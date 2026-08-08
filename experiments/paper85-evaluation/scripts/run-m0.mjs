import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CONTRACT_ROOT,
  command,
  createRunContext,
  decodedMap,
  loadRunInputs,
  sha256,
  writeEvidence,
  writeFailure,
} from './run-common.mjs';

function parseObservation(testName, result, scenarioById) {
  const match = /^testM0_([VI][0-9]{2})\(\)$/.exec(testName);
  if (!match) throw new Error(`unexpected M0 test name ${testName}`);
  const scenarioId = match[1];
  const scenario = scenarioById.get(scenarioId);
  if (!scenario) throw new Error(`test result has no preregistered scenario ${scenarioId}`);
  if (result.status !== 'Success') throw new Error(`${scenarioId} failed: ${result.reason ?? 'unknown reason'}`);

  const decoded = decodedMap(result, 'm0.');
  const stateDigest = decoded.get('m0.stateDigest');
  const eventDigest = decoded.get('m0.eventDigest');
  if (!stateDigest || !eventDigest) throw new Error(`${scenarioId} is missing semantic digest logs`);

  return {
    scenarioId,
    class: scenario.class,
    baselineOutcome: scenario.baselineExpected.outcome,
    status: result.status,
    stateDigest,
    eventDigest,
  };
}

function parseForgeRun(raw, scenarioById) {
  const parsed = JSON.parse(raw);
  const suites = Object.values(parsed);
  if (suites.length !== 1) throw new Error(`expected one M0 suite, found ${suites.length}`);
  return Object.entries(suites[0].test_results)
    .map(([testName, result]) => parseObservation(testName, result, scenarioById))
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
}

function runForge() {
  return command(
    'forge',
    ['test', '--match-contract', 'M0DifferentialTest', '-vv', '--json'],
    { cwd: CONTRACT_ROOT },
  );
}

const context = await createRunContext('m0');

try {
  const inputs = await loadRunInputs();
  const scenarioById = new Map(inputs.manifest.scenarios.map((scenario) => [scenario.id, scenario]));
  const rawRun1 = runForge();
  const rawRun2 = runForge();
  const observations1 = parseForgeRun(rawRun1, scenarioById);
  const observations2 = parseForgeRun(rawRun2, scenarioById);

  if (observations1.length !== inputs.manifest.counts.total) {
    throw new Error(`expected ${inputs.manifest.counts.total} observations, found ${observations1.length}`);
  }
  const repeatedMatches = observations1.filter(
    (observation, index) => JSON.stringify(observation) === JSON.stringify(observations2[index]),
  ).length;
  if (repeatedMatches !== observations1.length) {
    throw new Error('M0 repeated run semantic digests are not deterministic');
  }

  const normalizedObservations = `${JSON.stringify(observations1, null, 2)}\n`;
  const evidenceFiles = {
    'forge-run-1.json': `${rawRun1}\n`,
    'forge-run-2.json': `${rawRun2}\n`,
    'observations-run-1.json': normalizedObservations,
    'observations-run-2.json': `${JSON.stringify(observations2, null, 2)}\n`,
  };
  const evidenceManifestSha256 = await writeEvidence({
    outputDirectory: context.outputDirectory,
    title: 'Paper 8.5 M0 evidence SHA-256 manifest',
    metadata: {
      preregistrationCommit: inputs.preregistrationCommit,
      manifestSha256: inputs.manifestHash,
      headCommit: inputs.repository.headCommit,
    },
    files: evidenceFiles,
  });

  const total = observations1.length;
  const m0Equivalent = observations1.filter((item) => item.status === 'Success').length;
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
      toolchain: { foundry: inputs.forgeVersion },
      repository: inputs.repository,
    },
    counts: {
      total,
      valid: observations1.filter((item) => item.class === 'valid').length,
      invalid: observations1.filter((item) => item.class === 'invalid').length,
      m0Equivalent,
      failed: total - m0Equivalent,
    },
    metrics: {
      semanticEquivalenceRate: m0Equivalent / total,
      repeatedDigestMatches: repeatedMatches,
      repeatedDigestMismatches: total - repeatedMatches,
      semanticEvidenceSha256: sha256(normalizedObservations),
    },
    evidenceManifestSha256,
  };
  await writeFile(join(context.outputDirectory, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outputDirectory: context.outputDirectory, summary }, null, 2)}\n`);
} catch (error) {
  await writeFailure(context, error);
  throw error;
}
