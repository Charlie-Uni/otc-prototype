import { readFileSync } from 'node:fs';
import { parseSimulationConfig } from '../src/core/config';
import {
  measurementSpecFromAnalysisPlan,
} from '../src/formal/measurement';
import { parseFormalShardPlan } from '../src/formal/shard-plan';
import { executeFormalShard } from '../src/formal/shard-runner';
import {
  persistFormalShardFailure,
  persistFormalShardResult,
} from '../src/formal/shard-storage';
import { parseFormalAnalysisPlan } from '../src/preregistration/analysis-plan';
import type { FormalExperimentMatrix } from '../src/preregistration/matrix';
import { compileFormalMatrix } from '../src/runner/formal-compiler';

const [planPath, shardId, outputDirectory] = process.argv.slice(2);
if (!planPath || !shardId || !outputDirectory) {
  throw new Error('USAGE: run-formal-shard <plan.json> <shard-id> <output-directory>');
}

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;
const analysisPlan = parseFormalAnalysisPlan(JSON.parse(readFileSync(
  new URL('../config/formal-analysis-plan.json', import.meta.url),
  'utf8',
)) as unknown);
const compiled = compileFormalMatrix(matrix, baseline);
const plan = parseFormalShardPlan(JSON.parse(readFileSync(planPath, 'utf8')) as unknown, compiled);

try {
  const result = executeFormalShard(
    compiled,
    baseline,
    plan,
    shardId,
    measurementSpecFromAnalysisPlan(analysisPlan),
  );
  process.stdout.write(`${JSON.stringify(persistFormalShardResult(
    outputDirectory,
    result,
    plan,
  ))}\n`);
} catch (error) {
  const failurePath = persistFormalShardFailure(outputDirectory, plan, shardId, error);
  process.stderr.write(`${JSON.stringify({ status: 'failed', shardId, failurePath })}\n`);
  process.exitCode = 1;
}
