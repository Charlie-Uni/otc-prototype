import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(ROOT, '..', '..');
const OUTPUT_PATH = resolve(ROOT, 'spec-v2/evaluation-lock.v2.1.json');

const LOCKED_FILES = [
  '.github/workflows/paper85-ablation.yml',
  '.github/workflows/paper85-m0.yml',
  '.github/workflows/paper85-replay-gas.yml',
  'apps/api/package.json',
  'experiments/paper85-evaluation/README.md',
  'experiments/paper85-evaluation/contracts/foundry.toml',
  'experiments/paper85-evaluation/contracts/generated/ExperimentalFundToken.sol',
  'experiments/paper85-evaluation/contracts/generated/ExperimentalNAVRegistry.sol',
  'experiments/paper85-evaluation/contracts/test/AblationDifferentialHarness.sol',
  'experiments/paper85-evaluation/contracts/test/AblationM1.t.sol',
  'experiments/paper85-evaluation/contracts/test/AblationM2.t.sol',
  'experiments/paper85-evaluation/contracts/test/AblationM3.t.sol',
  'experiments/paper85-evaluation/contracts/test/AblationM4.t.sol',
  'experiments/paper85-evaluation/contracts/test/AblationM5.t.sol',
  'experiments/paper85-evaluation/contracts/test/AblationStateAssertions.sol',
  'experiments/paper85-evaluation/contracts/test/M0Differential.t.sol',
  'experiments/paper85-evaluation/contracts/test/M0DifferentialHarness.sol',
  'experiments/paper85-evaluation/contracts/test/PreregistrationInfrastructure.t.sol',
  'experiments/paper85-evaluation/contracts/test/ScenarioFixtures.sol',
  'experiments/paper85-evaluation/patches/experimental-contracts.patch',
  'experiments/paper85-evaluation/scripts/compare-evidence.mjs',
  'experiments/paper85-evaluation/scripts/evaluation-lock.mjs',
  'experiments/paper85-evaluation/scripts/generate-experimental-contracts.mjs',
  'experiments/paper85-evaluation/scripts/generate-m0-tests.mjs',
  'experiments/paper85-evaluation/scripts/generate-state-assertions.mjs',
  'experiments/paper85-evaluation/scripts/generate-state-assertions.test.mjs',
  'experiments/paper85-evaluation/scripts/gas-analysis.mjs',
  'experiments/paper85-evaluation/scripts/gas-analysis.test.mjs',
  'experiments/paper85-evaluation/scripts/prereg-lock.mjs',
  'experiments/paper85-evaluation/scripts/replay-chain.mjs',
  'experiments/paper85-evaluation/scripts/replay-engine.mjs',
  'experiments/paper85-evaluation/scripts/replay-engine.test.mjs',
  'experiments/paper85-evaluation/scripts/run-ablation.mjs',
  'experiments/paper85-evaluation/scripts/run-common.mjs',
  'experiments/paper85-evaluation/scripts/run-gas.mjs',
  'experiments/paper85-evaluation/scripts/run-m0.mjs',
  'experiments/paper85-evaluation/scripts/run-replay.mjs',
  'experiments/paper85-evaluation/scripts/run-summary-validator.mjs',
  'experiments/paper85-evaluation/scripts/run-summary-validator.test.mjs',
  'experiments/paper85-evaluation/scripts/validate-manifest.mjs',
  'experiments/paper85-evaluation/spec/prereg-lock.json',
  'experiments/paper85-evaluation/spec/scenarios.v1.json',
  'experiments/paper85-evaluation/spec/source-lock.json',
  'experiments/paper85-evaluation/spec-v2/replay-gas-method.v2.1.md',
  'experiments/paper85-evaluation/spec-v2/state-assertions.v2.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
].sort();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function buildLock() {
  const preregLock = JSON.parse(await readFile(resolve(ROOT, 'spec/prereg-lock.json')));
  const files = {};
  for (const path of LOCKED_FILES) {
    files[path] = sha256(await readFile(resolve(REPO_ROOT, path)));
  }
  return {
    schemaVersion: 1,
    kind: 'paper85-evaluation-implementation-v2.1',
    preregistration: {
      tag: preregLock.preregistrationTag,
      manifestSha256: preregLock.manifest.sha256,
    },
    sourceArtifact: {
      tag: preregLock.sourceArtifact.tag,
      commit: preregLock.sourceArtifact.commit,
    },
    files,
  };
}

const expected = `${JSON.stringify(await buildLock(), null, 2)}\n`;
const mode = process.argv[2] ?? '--check';
if (mode === '--write') {
  await writeFile(OUTPUT_PATH, expected);
} else if (mode === '--check') {
  const actual = await readFile(OUTPUT_PATH, 'utf8');
  if (actual !== expected) throw new Error(`${relative(REPO_ROOT, OUTPUT_PATH)} is stale`);
} else {
  throw new Error(`unknown mode ${mode}`);
}

process.stdout.write(`${JSON.stringify({
  status: mode === '--write' ? 'generated' : 'verified',
  files: LOCKED_FILES.length,
  evaluationLockSha256: sha256(expected),
})}\n`);
