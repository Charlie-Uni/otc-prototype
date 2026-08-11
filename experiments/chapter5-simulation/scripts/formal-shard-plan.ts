import { readFileSync } from 'node:fs';
import { parseSimulationConfig } from '../src/core/config';
import type { FormalExperimentMatrix } from '../src/preregistration/matrix';
import { compileFormalMatrix } from '../src/runner/formal-compiler';
import { createFormalShardPlan } from '../src/formal/shard-plan';
import { persistFormalShardPlanFile } from '../src/formal/shard-storage';

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
const plan = createFormalShardPlan(compileFormalMatrix(matrix, baseline), maxReplicatesPerShard);
const serialized = `${JSON.stringify(plan, null, 2)}\n`;
if (outputPath) {
  process.stdout.write(`${JSON.stringify(persistFormalShardPlanFile(outputPath, plan))}\n`);
} else {
  process.stdout.write(serialized);
}
