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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${commandName} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function parseObservation(testName, result, scenarioById) {
  const match = /^testM0_([VI][0-9]{2})\(\)$/.exec(testName);
  if (!match) throw new Error(`unexpected M0 test name ${testName}`);
  const scenarioId = match[1];
  const scenario = scenarioById.get(scenarioId);
  if (!scenario) throw new Error(`test result has no preregistered scenario ${scenarioId}`);
  if (result.status !== 'Success') throw new Error(`${scenarioId} failed: ${result.reason ?? 'unknown reason'}`);

  const decoded = new Map(
    result.decoded_logs
      .filter((line) => line.startsWith('m0.'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
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
const runId = `m0-${startedAt.replace(/[-:.]/g, '')}`;
const outputDirectory = resolve(ROOT, 'results', runId);
await mkdir(resolve(ROOT, 'results'), { recursive: true });
await mkdir(outputDirectory, { recursive: false });

const rawRun1 = runForge();
const rawRun2 = runForge();
const observations1 = parseForgeRun(rawRun1, scenarioById);
const observations2 = parseForgeRun(rawRun2, scenarioById);

if (observations1.length !== manifest.counts.total) {
  throw new Error(`expected ${manifest.counts.total} observations, found ${observations1.length}`);
}
if (JSON.stringify(observations1) !== JSON.stringify(observations2)) {
  throw new Error('M0 repeated run semantic digests are not deterministic');
}

const evidenceFiles = {
  'forge-run-1.json': `${rawRun1}\n`,
  'forge-run-2.json': `${rawRun2}\n`,
  'observations-run-1.json': `${JSON.stringify(observations1, null, 2)}\n`,
  'observations-run-2.json': `${JSON.stringify(observations2, null, 2)}\n`,
};
for (const [name, contents] of Object.entries(evidenceFiles)) {
  await writeFile(join(outputDirectory, name), contents);
}

const evidenceManifestLines = Object.entries(evidenceFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, contents]) => `${sha256(contents)}  ${name}`);
const evidenceManifest = [
  '# Paper 8.5 M0 evidence SHA-256 manifest',
  `# preregistrationCommit=${preregistrationCommit}`,
  `# manifestSha256=${manifestHash}`,
  ...evidenceManifestLines,
  '',
].join('\n');
await writeFile(join(outputDirectory, 'evidence-sha256.txt'), evidenceManifest);
const evidenceManifestSha256 = sha256(evidenceManifest);

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
    valid: observations1.filter((item) => item.class === 'valid').length,
    invalid: observations1.filter((item) => item.class === 'invalid').length,
    m0Equivalent: observations1.length,
    failed: 0,
  },
  metrics: {
    semanticEquivalenceRate: 1,
    repeatedDigestMatches: observations1.length,
    repeatedDigestMismatches: 0,
  },
  evidenceManifestSha256,
};
await writeFile(join(outputDirectory, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ outputDirectory, summary }, null, 2)}\n`);
