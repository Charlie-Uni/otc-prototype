import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRiskSnapshotTime } from './snapshot-context';

const context = {
  blockNumber: 42n,
  blockTimestamp: 1_000,
};

test('accepts a risk observation inside the configured snapshot age', () => {
  assert.doesNotThrow(() => validateRiskSnapshotTime(700, context, 300));
});

test('rejects risk observations after the fixed snapshot block', () => {
  assert.throws(
    () => validateRiskSnapshotTime(1_001, context, 300),
    /RISK_OCCURRED_AT_AFTER_SNAPSHOT/,
  );
});

test('rejects stale risk observations for the real-time submission endpoint', () => {
  assert.throws(
    () => validateRiskSnapshotTime(699, context, 300),
    /RISK_INPUT_TOO_OLD/,
  );
});
