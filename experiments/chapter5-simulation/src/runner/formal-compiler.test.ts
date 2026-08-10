import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import type { FormalExperimentMatrix } from '../preregistration/matrix';
import { shockMagnitudeBps } from '../shocks/scenario';
import {
  compileFormalCell,
  compileFormalMatrix,
  compileFormalRunInput,
} from './formal-compiler';
import { executeFormalReplicate } from './formal-executor';
import { assertFormalWorktreeClean } from './formal-provenance';
import { semanticDigestSha256 } from './digest';
import { runSimulation } from './run';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const matrix = JSON.parse(readFileSync(
  new URL('../../spec/formal-experiment-matrix.json', import.meta.url),
  'utf8',
)) as FormalExperimentMatrix;

test('compiles all 144 preregistered cells and every paired shock coordinate', () => {
  const compiled = compileFormalMatrix(matrix, baseline);
  assert.deepEqual(compileFormalMatrix(matrix, baseline), compiled);
  assert.equal(compiled.cellCount, 144);
  assert.equal(compiled.cells.length, 144);
  for (const cell of compiled.cells) {
    const input = compileFormalRunInput(cell, baseline, 0);
    assert.equal(input.scenario.shockType, cell.cell.shockType);
    assert.equal(shockMagnitudeBps(input.scenario), cell.cell.shockMagnitudeBps);
    assert.equal(input.shockEnabled, cell.cell.shockEnabled);
  }
});

test('compiles experiment-only mechanisms and atomic dependent values', () => {
  const compiled = compileFormalMatrix(matrix, baseline);
  const a1Off = compiled.cells.find(({ cell }) => cell.cellId === 'A1-COMPARISON')!;
  const a6Private = compiled.cells.find(({ cell }) => cell.cellId === 'A6-COMPARISON')!;
  const large = compiled.cells.find(({ cell }) => (
    cell.cellId === 'ROBUST-NETWORK_SCALE-large-COMPARISON'
  ))!;
  const legacy = compiled.cells.find(({ cell }) => (
    cell.cellId === 'ROBUST-RISK_WEIGHTS-legacy-COMPARISON'
  ))!;

  assert.equal(a1Off.treatment.mechanisms.publicRiskDisclosureEnabled, false);
  assert.equal(a6Private.treatment.regime.controlDisclosure, 'private');
  assert.equal(a6Private.treatment.config.thresholds.baselineKappaBps, 1_500);
  assert.ok(a6Private.treatment.config.thresholds.kappaScanBps.includes(1_500));
  assert.deepEqual(
    [large.treatment.config.network.fundCount,
      large.treatment.config.network.investorCount,
      large.treatment.config.network.assetClassCount],
    [20, 400, 8],
  );
  assert.equal(legacy.treatment.config.risk.weightSchemeId, 'legacy_weight_scheme');
  assert.deepEqual(legacy.treatment.config.risk.weightBps, [2_000, 2_000, 2_000, 2_000, 1_000, 1_000]);
});

test('keeps the target fund and shock second paired across network scale and shock type', () => {
  const compiled = compileFormalMatrix(matrix, baseline);
  const cells = [
    'ROBUST-NETWORK_SCALE-large-BASELINE',
    'ROBUST-NETWORK_SCALE-large-COMPARISON',
    'ROBUST-SHOCK_TYPE-liquidity-BASELINE',
    'ROBUST-SHOCK_TYPE-liquidity-COMPARISON',
  ].map((cellId) => compiled.cells.find(({ cell }) => cell.cellId === cellId)!);
  const inputs = cells.map((cell) => compileFormalRunInput(cell, baseline, 37));
  assert.equal(inputs[0]!.scenario.targetFundId, inputs[1]!.scenario.targetFundId);
  assert.equal(inputs[0]!.scenario.shockAt, inputs[1]!.scenario.shockAt);
  assert.equal(inputs[2]!.scenario.targetFundId, inputs[3]!.scenario.targetFundId);
  assert.equal(inputs[2]!.scenario.shockAt, inputs[3]!.scenario.shockAt);
  assert.notEqual(inputs[2]!.scenario.shockType, inputs[3]!.scenario.shockType);
});

test('fails before execution on an undeclared path, duplicate path, or bad replicate', () => {
  const invalidPath = structuredClone(matrix.cells[0]!);
  invalidPath.treatmentChanges = [{ path: 'config.undeclared', value: 1 }];
  assert.throws(() => compileFormalCell(invalidPath, baseline), /UNSUPPORTED_FORMAL_TREATMENT_PATH/);

  const duplicatePath = structuredClone(matrix.cells[0]!);
  duplicatePath.treatmentChanges = [
    { path: 'regime.delaySec', value: 0 },
    { path: 'regime.delaySec', value: 86_400 },
  ];
  assert.throws(() => compileFormalCell(duplicatePath, baseline), /DUPLICATE_FORMAL_TREATMENT_PATH/);

  const compiled = compileFormalMatrix(matrix, baseline);
  assert.throws(
    () => compileFormalRunInput(compiled.cells[0]!, baseline, compiled.cells[0]!.cell.replicates),
    /FORMAL_REPLICATE_OUT_OF_RANGE/,
  );
});

test('executor verifies result provenance and A1 removes only public risk disclosure', () => {
  const compiled = compileFormalMatrix(matrix, baseline);
  const a1Off = compiled.cells.find(({ cell }) => cell.cellId === 'A1-COMPARISON')!;
  const result = runSimulation({
    ...compileFormalRunInput(a1Off, baseline, 0),
    horizonDays: 2,
  });
  assert.equal(result.publicRiskDisclosures.length, 0);
  assert.ok(result.regulatorRiskDisclosures.length > 0);
  assert.equal(result.mechanisms.publicRiskDisclosureEnabled, false);
  assert.equal(result.riskObservations.length, 0);
  assert.ok(result.traces.every(({ newPublicRiskDisclosureIds }) => (
    newPublicRiskDisclosureIds.length === 0
  )));
  assert.equal(
    result.finalState.networkPropagations.filter(({ sourceKind }) => sourceKind === 'public_risk').length,
    0,
  );

  assert.throws(() => executeFormalReplicate(
    compiled,
    baseline,
    'A1-COMPARISON',
    0,
    {
      authorize: () => ({
        preregistrationTag: 'chapter5-sim-prereg-v1',
        preregistrationCommit: 'a'.repeat(40),
        executionCommit: 'b'.repeat(40),
        preregistrationLockSha256: 'c'.repeat(64),
      }),
      execute: (input) => {
        const result = runSimulation({ ...input, horizonDays: 1 });
        const tampered = {
          ...result,
          horizonDays: input.horizonDays ?? input.treatment.config.time.horizonDays,
          treatmentId: 'tampered',
        };
        const { semanticDigestSha256: _ignored, ...withoutDigest } = tampered;
        return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
      },
    },
  ), /FORMAL_RUN_RESULT_PROVENANCE_MISMATCH/);

  assert.throws(() => executeFormalReplicate(
    compiled,
    baseline,
    'ROBUST-NETWORK_SCALE-large-COMPARISON',
    0,
    {
      authorize: () => ({
        preregistrationTag: 'chapter5-sim-prereg-v1',
        preregistrationCommit: 'a'.repeat(40),
        executionCommit: 'b'.repeat(40),
        preregistrationLockSha256: 'c'.repeat(64),
      }),
      execute: (input) => {
        const result = runSimulation({ ...input, horizonDays: 1 });
        const tampered = {
          ...result,
          horizonDays: input.horizonDays ?? input.treatment.config.time.horizonDays,
          scenario: { ...result.scenario, targetSelectionFundCount: 9 },
        };
        const { semanticDigestSha256: _ignored, ...withoutDigest } = tampered;
        return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
      },
    },
  ), /FORMAL_RUN_RESULT_PROVENANCE_MISMATCH/);
});

test('formal execution rejects uncommitted Chapter 5 implementation bytes', () => {
  assert.doesNotThrow(() => assertFormalWorktreeClean(''));
  assert.throws(
    () => assertFormalWorktreeClean(' M experiments/chapter5-simulation/src/runner/run.ts\n'),
    /FORMAL_EXECUTION_WORKTREE_DIRTY/,
  );
});
