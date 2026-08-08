import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CONTRACT_ROOT,
  command,
  countBy,
  createRunContext,
  decodedMap,
  expectedClassification,
  loadRunInputs,
  sha256,
  writeEvidence,
  writeFailure,
} from './run-common.mjs';
import { validateRunSummary } from './run-summary-validator.mjs';

const VARIANTS = ['M1', 'M2', 'M3', 'M4', 'M5'];
const STATE_FIELDS = [
  'totalSupply',
  'subscriptionRequestCount',
  'redemptionRequestCount',
  'totalQueuedRedemption',
  'aliceBalance',
  'bobBalance',
  'aliceQueued',
  'bobQueued',
  'aliceWhitelisted',
  'bobWhitelisted',
  'operator2SubscriptionRole',
  'paused',
  'navHistoryLength',
  'latestNavAsOf',
  'latestNavIsInitial',
  'subscription0Amount',
  'subscription0Accepted',
  'subscription0MintedShares',
  'redemption0Settled',
];
const BOOLEAN_STATE_FIELDS = new Set([
  'aliceWhitelisted',
  'bobWhitelisted',
  'operator2SubscriptionRole',
  'paused',
  'latestNavIsInitial',
  'subscription0Accepted',
  'redemption0Settled',
]);

function parseStateObservation(decoded, arm, context) {
  return Object.fromEntries(STATE_FIELDS.map((field) => {
    const value = decoded.get(`ablation.${arm}.${field}`);
    if (value === undefined) throw new Error(`${context} is missing ${arm}.${field}`);
    if (BOOLEAN_STATE_FIELDS.has(field)) {
      if (value !== 'true' && value !== 'false') throw new Error(`${context} has invalid ${arm}.${field}`);
      return [field, value === 'true'];
    }
    if (!/^[0-9]+$/.test(value)) throw new Error(`${context} has invalid ${arm}.${field}`);
    return [field, value];
  }));
}

function parseObservation(testName, result, scenarioById) {
  const match = /^testAblation_(M[1-5])_([VI][0-9]{2})\(\)$/.exec(testName);
  if (!match) throw new Error(`unexpected ablation test name ${testName}`);
  const [, variant, scenarioId] = match;
  const scenario = scenarioById.get(scenarioId);
  if (!scenario) throw new Error(`test result has no preregistered scenario ${scenarioId}`);
  if (result.status !== 'Success') throw new Error(`${variant}/${scenarioId} failed: ${result.reason ?? 'unknown'}`);

  const decoded = decodedMap(result, 'ablation.');
  if (decoded.get('ablation.variant') !== variant) {
    throw new Error(`${variant}/${scenarioId} emitted the wrong variant`);
  }
  const classification = decoded.get('ablation.classification');
  const stateDigest = decoded.get('ablation.stateDigest');
  const eventDigest = decoded.get('ablation.eventDigest');
  if (!classification || !stateDigest || !eventDigest) {
    throw new Error(`${variant}/${scenarioId} is missing classified semantic logs`);
  }

  const targeted = scenario.class === 'invalid' && scenario.ablationHypothesis.variant === variant;
  const preregisteredClassification = expectedClassification(scenario, variant);
  if (classification !== preregisteredClassification) {
    throw new Error(`${variant}/${scenarioId}: ${classification} != ${preregisteredClassification}`);
  }
  const stateAssertionVerified = targeted
    ? decoded.get('ablation.stateAssertionVerified') === 'true'
    : null;
  if (targeted && !stateAssertionVerified) {
    throw new Error(`${variant}/${scenarioId} did not verify its preregistered state assertion`);
  }
  const baselineBeforeStateDigest = targeted ? decoded.get('ablation.baseline.beforeStateDigest') : null;
  const ablatedBeforeStateDigest = targeted ? decoded.get('ablation.ablated.beforeStateDigest') : null;
  if (targeted && (!baselineBeforeStateDigest || !ablatedBeforeStateDigest)) {
    throw new Error(`${variant}/${scenarioId} is missing its pre-action state digests`);
  }

  return {
    variant,
    scenarioId,
    class: scenario.class,
    targetPredicate: scenario.targetPredicate ?? null,
    targeted,
    classification,
    preregisteredClassification,
    classificationMatches: classification === preregisteredClassification,
    stateDivergence: decoded.get('ablation.stateDivergence') === 'true',
    eventDivergence: decoded.get('ablation.eventDivergence') === 'true',
    stateDigest,
    eventDigest,
    stateAssertionVerified,
    baselineBeforeStateDigest,
    ablatedBeforeStateDigest,
    baselineState: targeted ? parseStateObservation(decoded, 'baseline', `${variant}/${scenarioId}`) : null,
    ablatedState: targeted ? parseStateObservation(decoded, 'ablated', `${variant}/${scenarioId}`) : null,
  };
}

function parseForgeRun(raw, scenarioById) {
  const parsed = JSON.parse(raw);
  const observations = [];
  for (const suite of Object.values(parsed)) {
    for (const [testName, result] of Object.entries(suite.test_results)) {
      observations.push(parseObservation(testName, result, scenarioById));
    }
  }
  return observations.sort((a, b) =>
    a.variant.localeCompare(b.variant) || a.scenarioId.localeCompare(b.scenarioId)
  );
}

function runForge() {
  return command(
    'forge',
    ['test', '--match-contract', 'AblationM[1-5]Test', '-vv', '--json'],
    { cwd: CONTRACT_ROOT },
  );
}

const context = await createRunContext('ablation');

try {
  const inputs = await loadRunInputs();
  const scenarioById = new Map(inputs.manifest.scenarios.map((scenario) => [scenario.id, scenario]));
  const rawRun1 = runForge();
  const rawRun2 = runForge();
  const observations1 = parseForgeRun(rawRun1, scenarioById);
  const observations2 = parseForgeRun(rawRun2, scenarioById);
  const expectedTotal = inputs.manifest.counts.total * VARIANTS.length;
  if (observations1.length !== expectedTotal) {
    throw new Error(`expected ${expectedTotal} observations, found ${observations1.length}`);
  }
  const repeatedMatches = observations1.filter(
    (observation, index) => JSON.stringify(observation) === JSON.stringify(observations2[index]),
  ).length;
  if (repeatedMatches !== observations1.length) {
    throw new Error('ablation repeated-run classifications or semantic digests are not deterministic');
  }

  const normalizedObservations = `${JSON.stringify(observations1, null, 2)}\n`;
  const evidenceFiles = {
    'forge-run-1.json': `${rawRun1}\n`,
    'forge-run-2.json': `${rawRun2}\n`,
    'observations-run-1.json': normalizedObservations,
    'observations-run-2.json': `${JSON.stringify(observations2, null, 2)}\n`,
  };
  for (const variant of VARIANTS) {
    const rows = observations1
      .filter((observation) => observation.variant === variant)
      .map((observation) => JSON.stringify(observation));
    evidenceFiles[`${variant}.jsonl`] = `${rows.join('\n')}\n`;
  }
  const evidenceManifestSha256 = await writeEvidence({
    outputDirectory: context.outputDirectory,
    title: 'Paper 8.5 ablation evidence SHA-256 manifest',
    metadata: {
      preregistrationCommit: inputs.preregistrationCommit,
      manifestSha256: inputs.manifestHash,
      evaluationLockSha256: inputs.evaluationLockSha256,
      stateAssertionSpecSha256: inputs.stateAssertionSpecSha256,
      headCommit: inputs.repository.headCommit,
    },
    files: evidenceFiles,
  });

  const targeted = observations1.filter((observation) => observation.targeted);
  const classificationMatches = observations1.filter((item) => item.classificationMatches).length;
  const stateAssertionsVerified = targeted.filter((item) => item.stateAssertionVerified).length;
  const perVariant = countBy(observations1, 'variant');
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
      measurement: {
        preregistrationLockSha256: inputs.preregistrationLockSha256,
        evaluationLockSha256: inputs.evaluationLockSha256,
        stateAssertionSpecSha256: inputs.stateAssertionSpecSha256,
      },
    },
    counts: {
      total: observations1.length,
      perVariant,
      targeted: targeted.length,
      nonTargeted: observations1.length - targeted.length,
      classifications: countBy(observations1, 'classification'),
      targetedClassifications: countBy(targeted, 'classification'),
      stateAssertionsVerified,
      failed: expectedTotal - observations1.length,
    },
    metrics: {
      preregisteredClassificationMatchRate: classificationMatches / observations1.length,
      targetedAnomalyMatchRate: stateAssertionsVerified / targeted.length,
      repeatedDigestMatches: repeatedMatches,
      repeatedDigestMismatches: observations1.length - repeatedMatches,
      targetedStateDivergences: targeted.filter((item) => item.stateDivergence).length,
      targetedEventDivergences: targeted.filter((item) => item.eventDivergence).length,
      semanticEvidenceSha256: sha256(normalizedObservations),
    },
    evidenceManifestSha256,
  };
  validateRunSummary(summary);
  await writeFile(join(context.outputDirectory, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outputDirectory: context.outputDirectory, summary }, null, 2)}\n`);
} catch (error) {
  await writeFailure(context, error);
  throw error;
}
