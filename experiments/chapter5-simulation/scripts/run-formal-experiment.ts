import { availableParallelism } from 'node:os';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSimulationConfig } from '../src/core/config';
import { formalShardResultExists } from '../src/formal/shard-storage';
import { parseFormalShardPlan } from '../src/formal/shard-plan';
import { runFormalShardQueue } from '../src/formal/orchestrator';
import type { FormalExperimentMatrix } from '../src/preregistration/matrix';
import { compileFormalMatrix } from '../src/runner/formal-compiler';
import { assertFormalExecutionAuthorized } from '../src/runner/formal-provenance';

const [planPath, outputDirectory, rawWorkers] = process.argv.slice(2);
if (!planPath || !outputDirectory) {
  throw new Error('USAGE: run-formal-experiment <plan.json> <output-directory> [workers]');
}
const defaultWorkers = Math.max(1, Math.min(4, availableParallelism() - 1));
const workerCount = rawWorkers === undefined ? defaultWorkers : Number(rawWorkers);

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;
const compiled = compileFormalMatrix(matrix, baseline);
const plan = parseFormalShardPlan(JSON.parse(readFileSync(planPath, 'utf8')) as unknown, compiled);
const authorization = assertFormalExecutionAuthorized();
const shardScript = fileURLToPath(new URL('./run-formal-shard.ts', import.meta.url));

function executeShard(shardId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import',
      'tsx',
      shardScript,
      planPath,
      shardId,
      outputDirectory,
    ], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`FORMAL_SHARD_PROCESS_FAILED:${shardId}:${code ?? signal}`));
    });
  });
}

const summary = await runFormalShardQueue(plan, workerCount, {
  isComplete: ({ shardId }) => formalShardResultExists(
    outputDirectory,
    shardId,
    plan,
    authorization,
  ),
  execute: ({ shardId }) => executeShard(shardId),
});
process.stdout.write(`${JSON.stringify(summary)}\n`);
