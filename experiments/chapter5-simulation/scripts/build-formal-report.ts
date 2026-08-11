import { readFileSync } from 'node:fs';
import { parseSimulationConfig } from '../src/core/config';
import {
  assertFormalAnalysisReportComplete,
  FormalAnalysisAccumulator,
} from '../src/formal/reporting';
import { createFormalReportEvidence, persistFormalReportEvidence } from '../src/formal/report-storage';
import { parseFormalShardPlan } from '../src/formal/shard-plan';
import { scanFormalShardSet } from '../src/formal/shard-set';
import { parseFormalAnalysisPlan } from '../src/preregistration/analysis-plan';
import type { FormalExperimentMatrix } from '../src/preregistration/matrix';
import { compileFormalMatrix } from '../src/runner/formal-compiler';

const [planPath, shardDirectory, outputPath] = process.argv.slice(2);
if (!planPath || !shardDirectory || !outputPath) {
  throw new Error('USAGE: build-formal-report <plan.json> <shard-directory> <report.json>');
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
const accumulator = new FormalAnalysisAccumulator(analysisPlan);
const shardSet = scanFormalShardSet(shardDirectory, plan, (observation) => {
  accumulator.addObservation(observation);
});
const report = accumulator.finish();
assertFormalAnalysisReportComplete(report);
const evidence = createFormalReportEvidence(shardSet, report);
process.stdout.write(`${JSON.stringify(persistFormalReportEvidence(outputPath, evidence))}\n`);
