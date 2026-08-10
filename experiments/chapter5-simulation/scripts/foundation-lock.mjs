import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

const excludedDirectories = new Set(['node_modules', 'results']);
const excludedFiles = new Set(['spec/foundation-lock.json', '.DS_Store']);

function collectLocalFiles(directory = packageRoot, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)) return [];
      return collectLocalFiles(resolve(directory, entry.name), relativePath);
    }
    if (excludedFiles.has(relativePath) || excludedFiles.has(entry.name)) return [];
    return [relativePath];
  }).sort();
}

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
  const lockedLocalFiles = sortedHashes(
    collectLocalFiles(),
    (path) => readFileSync(resolve(packageRoot, path)),
  );
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
