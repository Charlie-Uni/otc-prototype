import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeGasRuns } from './gas-analysis.mjs';

function run(offset = 0) {
  return Array.from({ length: 14 }, (_, index) => ({
    operationId: `O${String(index + 1).padStart(2, '0')}`,
    gasUsed: String(100 + index + offset),
  }));
}

test('aggregates transaction and multi-transaction lifecycle gas without mixing units', () => {
  const summary = summarizeGasRuns([run(), run(10)]);
  assert.equal(summary.runCount, 2);
  assert.equal(summary.categories.subscription.samples, 2);
  assert.equal(summary.categories.subscription.transactionCountPerSample, 2);
  assert.equal(summary.categories.subscription.averageGas, 217);
  assert.equal(summary.categories.qualificationUpdate.samples, 4);
  assert.equal(summary.categories.qualificationUpdate.averageGas, 105.5);
  assert.equal(summary.optionalComponents.settlementDelay.averageGas, 113);
});

test('rejects a run with a missing operation checkpoint', () => {
  assert.throws(() => summarizeGasRuns([run().slice(0, -1)]), /expected 14 gas checkpoints/);
});
