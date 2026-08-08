import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(ROOT, '..', '..');
const CONTRACT_ROOT = resolve(ROOT, 'contracts');
const MANIFEST_PATH = resolve(ROOT, 'spec/scenarios.v1.json');
const EXPECTED_MANIFEST_HASH = '97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69';
const VARIANTS = ['M1', 'M2', 'M3', 'M4', 'M5'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${commandName} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function decodedMap(result) {
  return new Map(
    result.decoded_logs
      .filter((line) => line.startsWith('ablation.'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function parseObservation(testName, result, scenarioById) {
  const match = /^testAblation_(M[1-5])_([VI][0-9]{2})\(\)$/.exec(testName);
  if (!match) throw new Error(`unexpected ablation test name ${testName}`);
  const [, variant, scenarioId] = match;
  const scenario = scenarioById.get(scenarioId);
  if (!scenario) throw new Error(`test result has no preregistered scenario ${scenarioId}`);
  if (result.status !== 'Success') throw new Error(`${variant}/${scenarioId} failed: ${result.reason ?? 'unknown'}`);

  const decoded = decodedMap(result);
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
  const expectedClassification = targeted
    ? scenario.ablationHypothesis.classification
    : scenario.baselineExpected.outcome === 'accept' ? 'expected_accept' : 'expected_reject';
  if (classification !== expectedClassification) {
    throw new Error(`${variant}/${scenarioId}: ${classification} != ${expectedClassification}`);
  }

  return {
    variant,
    scenarioId,
    class: scenario.class,
    targetPredicate: scenario.targetPredicate ?? null,
    targeted,
    classification,
    stateDivergence: decoded.get('ablation.stateDivergence') === 'true',
    eventDivergence: decoded.get('ablation.eventDivergence') === 'true',
    stateDigest,
    eventDigest,
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

function countBy(items, key) {
  return Object.fromEntries(
    [...new Set(items.map((item) => item[key]))]
      .sort()
      .map((value) => [value, items.filter((item) => item[key] === value).length]),
  );
}

const manifestBytes = await readFile(MANIFEST_PATH);
const manifestHash = sha256(manifestBytes);
if (manifestHash !== EXPECTED_MANIFEST_HASH) {
  throw new Error(`manifest hash ${manifestHash} does not match preregistered ${EXPECTED_MANIFEST_HASH}`);
}
const manifest = JSON.parse(manifestBytes);
const scenarioById = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));

command('node', [resolve(SCRIPT_DIR, 'generate-m0-tests.mjs'), '--check']);
const preregistrationCommit = command('git', ['rev-parse', 'paper85-prereg-v1^{commit}']);
const sourceCommit = command('git', ['rev-parse', 'chapter3-artifact-v1.4.0^{commit}']);
const forgeVersion = command('forge', ['--version']);

const startedAt = new Date().toISOString();
const runId = `ablation-${startedAt.replace(/[-:.]/g, '')}`;
const outputDirectory = resolve(ROOT, 'results', runId);
await mkdir(resolve(ROOT, 'results'), { recursive: true });
await mkdir(outputDirectory, { recursive: false });

const rawRun1 = runForge();
const rawRun2 = runForge();
const observations1 = parseForgeRun(rawRun1, scenarioById);
const observations2 = parseForgeRun(rawRun2, scenarioById);
const expectedTotal = manifest.counts.total * VARIANTS.length;
if (observations1.length !== expectedTotal) {
  throw new Error(`expected ${expectedTotal} observations, found ${observations1.length}`);
}
if (JSON.stringify(observations1) !== JSON.stringify(observations2)) {
  throw new Error('ablation repeated-run classifications or semantic digests are not deterministic');
}

const evidenceFiles = {
  'forge-run-1.json': `${rawRun1}\n`,
  'forge-run-2.json': `${rawRun2}\n`,
  'observations-run-2.json': `${JSON.stringify(observations2, null, 2)}\n`,
};
for (const variant of VARIANTS) {
  const rows = observations1
    .filter((observation) => observation.variant === variant)
    .map((observation) => JSON.stringify(observation));
  evidenceFiles[`${variant}.jsonl`] = `${rows.join('\n')}\n`;
}
for (const [name, contents] of Object.entries(evidenceFiles)) {
  await writeFile(join(outputDirectory, name), contents);
}

const evidenceManifestLines = Object.entries(evidenceFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, contents]) => `${sha256(contents)}  ${name}`);
const evidenceManifest = [
  '# Paper 8.5 ablation evidence SHA-256 manifest',
  `# preregistrationCommit=${preregistrationCommit}`,
  `# manifestSha256=${manifestHash}`,
  ...evidenceManifestLines,
  '',
].join('\n');
await writeFile(join(outputDirectory, 'evidence-sha256.txt'), evidenceManifest);
const evidenceManifestSha256 = sha256(evidenceManifest);

const targeted = observations1.filter((observation) => observation.targeted);
const summary = {
  schemaVersion: 1,
  preregistration: {
    tag: 'paper85-prereg-v1',
    commitSha: preregistrationCommit,
    manifestSha256: manifestHash,
  },
  sourceArtifact: {
    tag: 'chapter3-artifact-v1.4.0',
    commitSha: sourceCommit,
    evidenceAnchor: manifest.sourceArtifact.evidenceAnchor,
  },
  run: {
    runId,
    startedAt,
    chainId: manifest.determinism.chainId,
    genesisTimestamp: manifest.determinism.genesisTimestamp,
    toolchain: { foundry: forgeVersion.split('\n')[0] },
  },
  counts: {
    total: observations1.length,
    perVariant: Object.fromEntries(VARIANTS.map((variant) => [variant, 42])),
    targeted: targeted.length,
    nonTargeted: observations1.length - targeted.length,
    classifications: countBy(observations1, 'classification'),
    targetedClassifications: countBy(targeted, 'classification'),
    failed: 0,
  },
  metrics: {
    preregisteredClassificationMatchRate: 1,
    targetedAnomalyMatchRate: 1,
    repeatedDigestMatches: observations1.length,
    repeatedDigestMismatches: 0,
    targetedStateDivergences: targeted.filter((item) => item.stateDivergence).length,
    targetedEventDivergences: targeted.filter((item) => item.eventDivergence).length,
  },
  evidenceManifestSha256,
};
await writeFile(join(outputDirectory, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ outputDirectory, summary }, null, 2)}\n`);
