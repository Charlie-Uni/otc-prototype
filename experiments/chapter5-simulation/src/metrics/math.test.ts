import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arithmeticMean,
  integerMedian,
  nearestRankPercentile,
  ratioBps,
  signedRatioBps,
} from './math';

test('uses integer-safe rates, means, conventional medians, and nearest-rank P95', () => {
  assert.equal(ratioBps(1, 3, 'TEST_RATE'), 3_333);
  assert.equal(signedRatioBps(-1, 3, 'TEST_SIGNED_RATE'), -3_333);
  assert.equal(arithmeticMean([1, 2, 6]), 3);
  assert.equal(integerMedian([10, 1, 4]), 4);
  assert.equal(integerMedian([10, 1, 4, 7]), 5);
  assert.equal(nearestRankPercentile([1, 2, 3, 4, 100], 95), 100);
  assert.equal(integerMedian([]), null);
});

test('rejects invalid metric arithmetic inputs', () => {
  assert.throws(() => ratioBps(1, 0, 'TEST_RATE'), /INVALID_TEST_RATE_DENOMINATOR/);
  assert.throws(() => nearestRankPercentile([1], 0), /INVALID_PERCENTILE/);
  assert.throws(() => integerMedian([-1]), /INVALID_MEDIAN_VALUE/);
});
