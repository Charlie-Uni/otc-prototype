import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = resolve(root, 'spec/formal-prereg-lock.json');
const lockedFiles = [
  'config/control-threshold-calibration.json',
  'config/formal-analysis-plan.json',
  'config/formal-baseline.json',
  'config/formal-experiment-design.json',
  'package.json',
  'scripts/formal-matrix.ts',
  'scripts/preregistration-lock.mjs',
  'scripts/run-control-threshold-calibration.ts',
  'scripts/validate-preregistration.ts',
  'spec/control-threshold-calibration-evidence.json',
  'spec/formal-experiment-matrix.json',
  'spec/formal-preregistration.md',
  'src/calibration/control-threshold.test.ts',
  'src/calibration/control-threshold.ts',
  'src/metrics/detection.test.ts',
  'src/metrics/detection.ts',
  'src/metrics/outcome-types.ts',
  'src/preregistration/analysis-plan.test.ts',
  'src/preregistration/analysis-plan.ts',
  'src/preregistration/design.test.ts',
  'src/preregistration/design.ts',
  'src/preregistration/matrix.test.ts',
  'src/preregistration/matrix.ts',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function buildLock() {
  return {
    schemaVersion: 1,
    purpose: 'Chapter 5 formal analysis and experiment-design preregistration lock',
    requiredTag: 'chapter5-sim-prereg-v2',
    files: Object.fromEntries([...lockedFiles].sort().map((path) => [
      path,
      sha256(readFileSync(resolve(root, path))),
    ])),
  };
}

const mode = process.argv[2];
if (mode === '--write') {
  writeFileSync(lockPath, stableJson(buildLock()));
  process.stdout.write(`Wrote ${lockPath}\n`);
} else if (mode === '--check') {
  const expected = readFileSync(lockPath, 'utf8');
  const actual = stableJson(buildLock());
  if (expected !== actual) throw new Error('CHAPTER5_PREREGISTRATION_LOCK_MISMATCH');
  process.stdout.write(`Chapter 5 preregistration lock verified: ${sha256(actual)}\n`);
} else {
  throw new Error('USAGE: preregistration-lock.mjs --write|--check');
}
