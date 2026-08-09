import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const lockPath = resolve(packageRoot, 'spec/foundation-lock.json');
const artifactTag = 'chapter3-artifact-v1.4.0';

const sourceFiles = [
  'apps/api/src/risk/calc.ts',
  'apps/api/src/risk/regimes.ts',
  'apps/api/src/simulation/detection.ts',
  'apps/api/src/simulation/sensitivity.ts',
];

const repositoryFiles = [
  '.github/workflows/chapter5-simulation.yml',
  'docs/evidence/chapter3-summary.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];

const localFiles = [
  'README.md',
  'config/pilot-baseline.json',
  'package.json',
  'scripts/foundation-lock.mjs',
  'spec/analysis-plan-draft.md',
  'spec/formula-code-map.md',
  'spec/model-semantics.md',
  'spec/network-design.md',
  'spec/oracle-risk-design.md',
  'spec/requirements-traceability.md',
  'spec/shock-design.md',
  'src/artifact/golden.test.ts',
  'src/artifact/risk/calc.ts',
  'src/artifact/risk/regimes.ts',
  'src/artifact/simulation/observation.ts',
  'src/artifact/simulation/sensitivity.ts',
  'src/core/allocation.test.ts',
  'src/core/allocation.ts',
  'src/core/config.test.ts',
  'src/core/config.ts',
  'src/core/pipeline.test.ts',
  'src/core/pipeline.ts',
  'src/core/rng.test.ts',
  'src/core/rng.ts',
  'src/index.ts',
  'src/network/generator.test.ts',
  'src/network/generator.ts',
  'src/network/types.ts',
  'src/network/validation.ts',
  'src/oracle/submission.test.ts',
  'src/oracle/submission.ts',
  'src/oracle/types.ts',
  'src/risk/metrics.test.ts',
  'src/risk/metrics.ts',
  'src/shocks/scenario.test.ts',
  'src/shocks/scenario.ts',
  'src/shocks/valuation.test.ts',
  'src/shocks/valuation.ts',
  'src/state/initialization.test.ts',
  'src/state/initialization.ts',
  'src/state/types.ts',
  'src/state/validation.ts',
  'tsconfig.json',
];

const exactVendorPairs = [
  ['apps/api/src/risk/calc.ts', 'src/artifact/risk/calc.ts'],
  ['apps/api/src/risk/regimes.ts', 'src/artifact/risk/regimes.ts'],
  ['apps/api/src/simulation/sensitivity.ts', 'src/artifact/simulation/sensitivity.ts'],
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortedHashes(paths, read) {
  return Object.fromEntries([...paths].sort().map((path) => [path, sha256(read(path))]));
}

function git(args) {
  return execFileSync('git', args, { cwd: repositoryRoot });
}

function buildLock() {
  const artifactCommit = git(['rev-parse', `${artifactTag}^{commit}`]).toString('utf8').trim();
  const lockedSourceFiles = sortedHashes(sourceFiles, (path) => git(['show', `${artifactTag}:${path}`]));
  const lockedLocalFiles = sortedHashes(localFiles, (path) => readFileSync(resolve(packageRoot, path)));
  exactVendorPairs.forEach(([sourcePath, localPath]) => {
    if (lockedSourceFiles[sourcePath] !== lockedLocalFiles[localPath]) {
      throw new Error(`CHAPTER3_VENDOR_MISMATCH:${sourcePath}:${localPath}`);
    }
  });
  return {
    schemaVersion: 1,
    purpose: 'Chapter 5 foundation source and semantics lock; not a formal experiment preregistration',
    artifact: { tag: artifactTag, commit: artifactCommit },
    sourceFiles: lockedSourceFiles,
    sourceAdapters: {
      'apps/api/src/simulation/detection.ts': {
        localPath: 'src/artifact/simulation/observation.ts',
        extractedFunctions: ['firstScheduledObservationAt', 'publicThresholdIsIdentifiable'],
        validation: 'src/artifact/golden.test.ts',
      },
    },
    repositoryFiles: sortedHashes(repositoryFiles, (path) => readFileSync(resolve(repositoryRoot, path))),
    localFiles: lockedLocalFiles,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeLock() {
  writeFileSync(lockPath, stableJson(buildLock()));
  process.stdout.write(`Wrote ${lockPath}\n`);
}

function checkLock() {
  const expected = JSON.parse(readFileSync(lockPath, 'utf8'));
  const actual = buildLock();
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error('CHAPTER5_FOUNDATION_LOCK_MISMATCH');
  }
  process.stdout.write(`Chapter 5 foundation lock verified: ${sha256(stableJson(actual))}\n`);
}

const mode = process.argv[2];
if (mode === '--write') {
  writeLock();
} else if (mode === '--check') {
  checkLock();
} else {
  throw new Error('USAGE: foundation-lock.mjs --write|--check');
}
