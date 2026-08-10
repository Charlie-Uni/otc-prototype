import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateSpilloverRedemptionBps,
  pairedSpilloverRedemptionBps,
  spilloverRedemptionBps,
} from './spillover';

test('implements rho times public signal times network proximity in bps', () => {
  assert.equal(spilloverRedemptionBps(8_000, 6_000, 5_000), 2_400);
  assert.equal(spilloverRedemptionBps(0, 6_000, 5_000), 0);
  assert.equal(spilloverRedemptionBps(8_000, 0, 5_000), 0);
});

test('caps multiple incoming spillovers without changing component calculations', () => {
  assert.equal(aggregateSpilloverRedemptionBps([2_400, 3_000]), 5_400);
  assert.equal(aggregateSpilloverRedemptionBps([8_000, 4_000]), 10_000);
});

test('reports the mentor-confirmed paired network-minus-disabled-channel measure', () => {
  assert.equal(pairedSpilloverRedemptionBps(2_500, 1_000), 1_500);
  assert.equal(pairedSpilloverRedemptionBps(1_000, 2_500), -1_500);
});

test('rejects malformed spillover inputs', () => {
  assert.throws(() => spilloverRedemptionBps(-1, 0, 0), /INVALID_SPILLOVER_SOURCE_SIGNAL_BPS/);
  assert.throws(() => aggregateSpilloverRedemptionBps([10_001]), /INVALID_SPILLOVER_COMPONENT_BPS/);
});
