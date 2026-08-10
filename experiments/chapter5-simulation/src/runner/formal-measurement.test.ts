import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { parseFormalAnalysisPlan } from '../preregistration/analysis-plan';
import type { FormalExperimentMatrix } from '../preregistration/matrix';
import { semanticDigestSha256 } from './digest';
import {
  compileFormalMatrix,
  compileFormalRunInput,
  type CompiledFormalCell,
} from './formal-compiler';
import type { FormalReplicateResult } from './formal-executor';
import { runSimulation } from './run';
import {
  assertFormalPairObservationDigest,
  createFormalPairObservation,
  measurementSpecFromAnalysisPlan,
} from '../formal/measurement';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;
const compiled = compileFormalMatrix(matrix, baseline);
const analysisPlan = parseFormalAnalysisPlan(JSON.parse(readFileSync(
  new URL('../../config/formal-analysis-plan.json', import.meta.url),
  'utf8',
)) as unknown);

function cell(cellId: string): CompiledFormalCell {
  const value = compiled.cells.find(({ cell: candidate }) => candidate.cellId === cellId);
  if (!value) throw new Error(`MISSING_TEST_CELL:${cellId}`);
  return value;
}

function executeForTest(compiledCell: CompiledFormalCell): FormalReplicateResult {
  const input = compileFormalRunInput(compiledCell, baseline, 0);
  const result = runSimulation({ ...input, horizonDays: 1 });
  return {
    schemaVersion: 1,
    designDigestSha256: compiled.designDigestSha256,
    cellId: compiledCell.cell.cellId,
    pairId: compiledCell.cell.pairId,
    replicateId: 0,
    shockType: input.scenario.shockType,
    shockMagnitudeBps: compiledCell.cell.shockMagnitudeBps,
    shockEnabled: input.shockEnabled ?? true,
    authorization: {
      preregistrationTag: 'chapter5-sim-prereg-v1',
      preregistrationCommit: 'a'.repeat(40),
      executionCommit: 'b'.repeat(40),
      preregistrationLockSha256: 'c'.repeat(64),
    },
    result,
  };
}

test('derives the locked 30/60/90-day measurement windows and warning threshold', () => {
  assert.deepEqual(measurementSpecFromAnalysisPlan(analysisPlan), {
    windowDays: [30, 60, 90],
    sensitivityThresholdBps: 6_000,
  });
});

test('compresses a primary pair into deterministic one-window evidence', () => {
  const shocked = cell('POLICY-R1-2000-SHOCK');
  const noShock = cell('POLICY-R1-2000-NO-SHOCK');
  const observation = createFormalPairObservation(
    executeForTest(shocked),
    executeForTest(noShock),
    shocked,
    noShock,
    { windowDays: [1], sensitivityThresholdBps: 6_000 },
  );
  assert.equal(observation.pairId, 'POLICY-R1-2000');
  assert.deepEqual(observation.arms.map(({ arm }) => arm), ['shock', 'no_shock']);
  assert.ok(observation.primaryShockLinkedDetection);
  assert.equal(observation.arms[0].outcomesByWindow[0]?.windowDays, 1);
  assert.equal(observation.arms[1].outcomesByWindow[0]?.windowDays, 1);
  assert.doesNotThrow(() => assertFormalPairObservationDigest(observation));
  assert.equal(
    createFormalPairObservation(
      executeForTest(shocked),
      executeForTest(noShock),
      shocked,
      noShock,
      { windowDays: [1], sensitivityThresholdBps: 6_000 },
    ).semanticDigestSha256,
    observation.semanticDigestSha256,
  );
});

test('rejects observation tampering even when the outer digest is recomputed', () => {
  const shocked = cell('POLICY-R1-2000-SHOCK');
  const noShock = cell('POLICY-R1-2000-NO-SHOCK');
  const observation = createFormalPairObservation(
    executeForTest(shocked),
    executeForTest(noShock),
    shocked,
    noShock,
    { windowDays: [1], sensitivityThresholdBps: 6_000 },
  );
  const tampered = structuredClone(observation);
  tampered.arms[0].runDigestSha256 = 'f'.repeat(64);
  const { semanticDigestSha256: _ignored, ...withoutDigest } = tampered;
  tampered.semanticDigestSha256 = semanticDigestSha256(withoutDigest);
  assert.throws(
    () => assertFormalPairObservationDigest(tampered),
    /FORMAL_ARM_MEASUREMENT_DIGEST_MISMATCH/,
  );
});
