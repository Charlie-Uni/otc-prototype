import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateIntegerProportionally } from './allocation';

test('allocates integer totals exactly using deterministic largest remainders', () => {
  assert.deepEqual(allocateIntegerProportionally(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateIntegerProportionally(10, [6_000, 4_000]), [6, 4]);
  assert.deepEqual(allocateIntegerProportionally(0, [1, 2]), [0, 0]);
});

test('rejects unsafe totals and invalid weight sets', () => {
  assert.throws(() => allocateIntegerProportionally(-1, [1]), /INVALID_ALLOCATION_TOTAL/);
  assert.throws(() => allocateIntegerProportionally(1, []), /EMPTY_ALLOCATION_WEIGHTS/);
  assert.throws(() => allocateIntegerProportionally(1, [0, 0]), /ZERO_ALLOCATION_WEIGHT/);
  assert.throws(() => allocateIntegerProportionally(1, [1, -1]), /INVALID_ALLOCATION_WEIGHT/);
});
