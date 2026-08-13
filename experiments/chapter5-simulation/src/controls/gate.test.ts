import assert from 'node:assert/strict';
import test from 'node:test';
import {
  controlledOutflow,
  qualifiesForGateRelease,
} from './gate';

test('implements the continuous control attenuation endpoints', () => {
  assert.equal(controlledOutflow(8_000, 0), 8_000);
  assert.equal(controlledOutflow(8_000, 2_500), 6_000);
  assert.equal(controlledOutflow(8_000, 10_000), 0);
});

test('uses the exact complement of the strict above-kappa trigger for release evidence', () => {
  assert.equal(qualifiesForGateRelease(6_999, 7_000), true);
  assert.equal(qualifiesForGateRelease(7_000, 7_000), true);
  assert.equal(qualifiesForGateRelease(7_001, 7_000), false);
});

test('rejects malformed control inputs', () => {
  assert.throws(() => controlledOutflow(-1, 0), /INVALID_UNCONTROLLED_OUTFLOW/);
  assert.throws(() => controlledOutflow(1, 10_001), /INVALID_CONTROL_PHI_BPS/);
  assert.throws(() => qualifiesForGateRelease(-1, 7_000), /INVALID_CONTROL_RISK_SCORE_BPS/);
});
