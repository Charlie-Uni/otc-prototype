import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseSimulationConfig } from '../src/core/config';
import type { FormalExperimentMatrix } from '../src/preregistration/matrix';
import { compileFormalMatrix } from '../src/runner/formal-compiler';
import { createFormalShardPlan } from '../src/formal/shard-plan';

const [rawSize = '50', outputPath] = process.argv.slice(2);
const maxReplicatesPerShard = Number(rawSize);
if (!Number.isSafeInteger(maxReplicatesPerShard) || maxReplicatesPerShard <= 0) {
  throw new Error('INVALID_FORMAL_SHARD_SIZE');
}
const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;
const serialized = `${JSON.stringify(createFormalShardPlan(
  compileFormalMatrix(matrix, baseline),
  maxReplicatesPerShard,
), null, 2)}\n`;
if (outputPath) {
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.partial-${process.pid}`;
  writeFileSync(temporary, serialized, { flag: 'wx' });
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ path: target })}\n`);
} else {
  process.stdout.write(serialized);
}
