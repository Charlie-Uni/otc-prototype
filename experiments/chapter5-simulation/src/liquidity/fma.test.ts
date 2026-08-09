import assert from 'node:assert/strict';
import test from 'node:test';
import { firstMoverAdvantageBps } from './fma';

test('implements the mentor-confirmed continuous FMA function', () => {
  assert.equal(firstMoverAdvantageBps(15_000), 0);
  assert.equal(firstMoverAdvantageBps(10_000), 0);
  assert.equal(firstMoverAdvantageBps(5_000), 5_000);
  assert.equal(firstMoverAdvantageBps(0), 10_000);
});

test('FMA is bounded and weakly decreases as the liquidity buffer rises', () => {
  const ratios = [0, 2_500, 5_000, 10_000, 15_000];
  const values = ratios.map(firstMoverAdvantageBps);
  assert.deepEqual(values, [10_000, 7_500, 5_000, 0, 0]);
  assert.ok(values.every((value) => value >= 0 && value <= 10_000));
});

test('rejects malformed liquidity ratios', () => {
  assert.throws(() => firstMoverAdvantageBps(-1), /INVALID_LIQUIDITY_BUFFER_RATIO_BPS/);
  assert.throws(() => firstMoverAdvantageBps(1.5), /INVALID_LIQUIDITY_BUFFER_RATIO_BPS/);
});
