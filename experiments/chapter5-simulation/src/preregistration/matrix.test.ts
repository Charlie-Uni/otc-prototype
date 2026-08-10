import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseFormalExperimentDesign } from './design';
import { generateFormalExperimentMatrix } from './matrix';

const design = parseFormalExperimentDesign(JSON.parse(readFileSync(
  new URL('../../config/formal-experiment-design.json', import.meta.url),
  'utf8',
)));

test('generates deterministic paired policy, ablation, and robustness cells', () => {
  const first = generateFormalExperimentMatrix(design);
  const second = generateFormalExperimentMatrix(design);
  assert.deepEqual(first, second);
  assert.equal(first.cellCount, 144);
  assert.equal(first.cellCount, first.cells.length);
  assert.equal(new Set(first.cells.map(({ cellId }) => cellId)).size, first.cellCount);

  const groupSizes = new Map<string, number>();
  for (const cell of first.cells) {
    groupSizes.set(cell.pairId, (groupSizes.get(cell.pairId) ?? 0) + 1);
  }
  assert.ok([...groupSizes.values()].every((size) => size === 2));
});

test('uses matched no-shock policy cells and only one declared ablation dimension', () => {
  const matrix = generateFormalExperimentMatrix(design);
  const policy = matrix.cells.filter(({ family }) => family === 'primary_policy');
  assert.equal(policy.length, 30);
  for (const regimeId of ['R0', 'R1', 'R2', 'R3', 'R4']) {
    for (const magnitude of [1_000, 2_000, 3_000]) {
      const pair = policy.filter((cell) => (
        cell.regimeId === regimeId && cell.shockMagnitudeBps === magnitude
      ));
      assert.deepEqual(pair.map(({ shockEnabled }) => shockEnabled), [true, false]);
    }
  }
  const ablations = matrix.cells.filter(({ family }) => family === 'ablation');
  assert.equal(ablations.length, 12);
  for (const ablation of design.ablations) {
    const [baseline, comparison] = ablations.filter(({ pairId }) => pairId === ablation.id);
    assert.ok(baseline);
    assert.ok(comparison);
    const baselineValues = new Map(baseline.treatmentChanges.map(({ path, value }) => [
      path,
      JSON.stringify(value),
    ]));
    const comparisonValues = new Map(comparison.treatmentChanges.map(({ path, value }) => [
      path,
      JSON.stringify(value),
    ]));
    const changedPaths = [...new Set([...baselineValues.keys(), ...comparisonValues.keys()])]
      .filter((path) => baselineValues.get(path) !== comparisonValues.get(path));
    assert.deepEqual(changedPaths, [ablation.changedPath]);
  }
});

test('latin-hypercube behavior cells stay inside every locked range', () => {
  const matrix = generateFormalExperimentMatrix(design);
  const cells = matrix.cells.filter(({ family }) => family === 'behavior_lhs');
  assert.equal(cells.length, design.behaviorLhs.sampleCount * 2);
  for (const cell of cells.filter(({ arm }) => arm === 'comparison')) {
    for (const change of cell.treatmentChanges) {
      const field = change.path.split('.').at(-1)!;
      const [lower, upper] = design.behaviorLhs.ranges[field]!;
      if (typeof change.value !== 'number') throw new Error('EXPECTED_NUMERIC_LHS_VALUE');
      assert.ok(change.value > lower && change.value < upper);
    }
  }
});
