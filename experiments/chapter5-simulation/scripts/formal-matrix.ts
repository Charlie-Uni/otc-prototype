import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFormalExperimentDesign } from '../src/preregistration/design';
import { generateFormalExperimentMatrix } from '../src/preregistration/matrix';

const packageRoot = resolve(import.meta.dirname, '..');
const designPath = resolve(packageRoot, 'config/formal-experiment-design.json');
const matrixPath = resolve(packageRoot, 'spec/formal-experiment-matrix.json');

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function expectedMatrix(): string {
  const design = parseFormalExperimentDesign(JSON.parse(readFileSync(designPath, 'utf8')));
  return stableJson(generateFormalExperimentMatrix(design));
}

const mode = process.argv[2];
if (mode === '--write') {
  writeFileSync(matrixPath, expectedMatrix());
  process.stdout.write(`Wrote ${matrixPath}\n`);
} else if (mode === '--check') {
  if (readFileSync(matrixPath, 'utf8') !== expectedMatrix()) {
    throw new Error('FORMAL_EXPERIMENT_MATRIX_STALE');
  }
  process.stdout.write('Formal experiment matrix verified\n');
} else {
  throw new Error('USAGE: formal-matrix.ts --write|--check');
}
