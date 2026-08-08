import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXPERIMENT_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(EXPERIMENT_ROOT, '..', '..');
const LOCK_PATH = join(EXPERIMENT_ROOT, 'spec', 'prereg-lock.json');

const LOCKED_FILES = [
  '.gitattributes',
  '.github/workflows/paper85-preregistration.yml',
  'experiments/paper85-evaluation/README.md',
  'experiments/paper85-evaluation/contracts/.gitignore',
  'experiments/paper85-evaluation/contracts/foundry.toml',
  'experiments/paper85-evaluation/contracts/generated/ExperimentalFundToken.sol',
  'experiments/paper85-evaluation/contracts/generated/ExperimentalNAVRegistry.sol',
  'experiments/paper85-evaluation/contracts/test/PreregistrationInfrastructure.t.sol',
  'experiments/paper85-evaluation/patches/experimental-contracts.patch',
  'experiments/paper85-evaluation/scripts/generate-experimental-contracts.mjs',
  'experiments/paper85-evaluation/scripts/prereg-lock.mjs',
  'experiments/paper85-evaluation/scripts/validate-guard-map.mjs',
  'experiments/paper85-evaluation/scripts/validate-manifest.mjs',
  'experiments/paper85-evaluation/scripts/validate-manifest.test.mjs',
  'experiments/paper85-evaluation/spec/guard-flag-map.md',
  'experiments/paper85-evaluation/spec/m0-equivalence-protocol.md',
  'experiments/paper85-evaluation/spec/operation-predicate-coverage.md',
  'experiments/paper85-evaluation/spec/prewritten-claims.md',
  'experiments/paper85-evaluation/spec/replay-protocol.md',
  'experiments/paper85-evaluation/spec/requirements-traceability.md',
  'experiments/paper85-evaluation/spec/result-taxonomy.md',
  'experiments/paper85-evaluation/spec/run-summary.schema.json',
  'experiments/paper85-evaluation/spec/scenarios.schema.json',
  'experiments/paper85-evaluation/spec/scenarios.v1.json',
  'experiments/paper85-evaluation/spec/semantic-alignment.md',
  'experiments/paper85-evaluation/spec/source-lock.json',
].sort();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function buildLock() {
  const files = {};
  for (const path of LOCKED_FILES) {
    files[path] = sha256(await readFile(join(REPO_ROOT, path)));
  }
  const manifestPath = 'experiments/paper85-evaluation/spec/scenarios.v1.json';
  const manifestBytes = await readFile(join(REPO_ROOT, manifestPath));
  const sourceLock = JSON.parse(await readFile(join(EXPERIMENT_ROOT, 'spec', 'source-lock.json'), 'utf8'));
  return {
    schemaVersion: 1,
    kind: 'paper85-preregistration',
    preregistrationTag: 'paper85-prereg-v1',
    sourceArtifact: {
      tag: sourceLock.sourceTag,
      commit: sourceLock.sourceCommit,
      evidenceAnchor: sourceLock.evidenceAnchor,
    },
    manifest: {
      path: manifestPath,
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
    },
    files,
  };
}

async function check() {
  const expected = await buildLock();
  const committed = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
  if (JSON.stringify(committed) !== JSON.stringify(expected)) {
    throw new Error('prereg-lock.json is stale; preregistration inputs changed');
  }
  process.stdout.write(`${JSON.stringify({
    status: 'verified',
    fileCount: Object.keys(expected.files).length,
    manifest: expected.manifest,
  }, null, 2)}\n`);
}

async function write() {
  const lock = await buildLock();
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    status: 'written',
    fileCount: Object.keys(lock.files).length,
    manifest: lock.manifest,
  }, null, 2)}\n`);
}

const mode = process.argv[2] ?? '--check';
if (mode === '--write') await write();
else if (mode === '--check') await check();
else throw new Error(`unknown mode: ${mode}`);
