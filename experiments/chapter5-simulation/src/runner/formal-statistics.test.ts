import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addRunningSample,
  createRunningMoments,
  holmAdjustWithinHypothesis,
  mergeRunningMoments,
  summarizeRunningMoments,
  twoSidedNormalPValue,
} from '../formal/statistics';

function moments(values: readonly number[]) {
  const state = createRunningMoments();
  values.forEach((value) => addRunningSample(state, value));
  return state;
}

test('computes stable streaming paired moments and a 95% normal interval', () => {
  const summary = summarizeRunningMoments(moments([1, 2, 3, 4]));
  assert.equal(summary.count, 4);
  assert.equal(summary.mean, 2.5);
  assert.ok(Math.abs(summary.standardDeviation - 1.2909944487358056) < 1e-12);
  assert.ok(summary.confidenceLower < summary.mean);
  assert.ok(summary.confidenceUpper > summary.mean);
});

test('merges streaming partitions without changing the estimate', () => {
  assert.deepEqual(
    summarizeRunningMoments(mergeRunningMoments(moments([1, 2]), moments([3, 4]))),
    summarizeRunningMoments(moments([1, 2, 3, 4])),
  );
});

test('approximates the standard two-sided normal p-value', () => {
  assert.ok(Math.abs(twoSidedNormalPValue(0) - 1) < 1e-9);
  assert.ok(Math.abs(twoSidedNormalPValue(1.959963984540054) - 0.05) < 1e-6);
  assert.equal(twoSidedNormalPValue(Number.MAX_VALUE), 0);
});

test('applies monotone Holm adjustment within each hypothesis only', () => {
  assert.deepEqual(holmAdjustWithinHypothesis([
    { hypothesisId: 'H1', testId: 'A', pValue: 0.01 },
    { hypothesisId: 'H1', testId: 'B', pValue: 0.04 },
    { hypothesisId: 'H1', testId: 'C', pValue: 0.03 },
    { hypothesisId: 'H2', testId: 'D', pValue: 0.02 },
  ]), [
    { hypothesisId: 'H1', testId: 'A', pValue: 0.01, adjustedPValue: 0.03, familySize: 3, rank: 1 },
    { hypothesisId: 'H1', testId: 'B', pValue: 0.04, adjustedPValue: 0.06, familySize: 3, rank: 3 },
    { hypothesisId: 'H1', testId: 'C', pValue: 0.03, adjustedPValue: 0.06, familySize: 3, rank: 2 },
    { hypothesisId: 'H2', testId: 'D', pValue: 0.02, adjustedPValue: 0.02, familySize: 1, rank: 1 },
  ]);
  assert.throws(
    () => holmAdjustWithinHypothesis([
      { hypothesisId: 'H1', testId: 'A', pValue: 0.1 },
      { hypothesisId: 'H1', testId: 'A', pValue: 0.2 },
    ]),
    /INVALID_FORMAL_HYPOTHESIS_TEST/,
  );
});
