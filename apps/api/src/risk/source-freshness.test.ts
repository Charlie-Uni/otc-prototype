import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSourceFreshness } from './source-freshness';

test('reports raw source age without inventing an unconfigured SLA', () => {
  assert.deepEqual(evaluateSourceFreshness(1_000, 700, undefined), {
    ageSec: 300,
    maxAgeSec: null,
    status: 'trusted_latest_unbounded',
  });
});

test('marks configured source ages as fresh or stale warnings without changing the score', () => {
  assert.equal(evaluateSourceFreshness(1_000, 700, 300).status, 'fresh');
  assert.equal(evaluateSourceFreshness(1_001, 700, 300).status, 'stale_warning');
});

test('rejects impossible source timestamps and invalid thresholds', () => {
  assert.throws(() => evaluateSourceFreshness(1_000, 1_001, 300), /INVALID_SOURCE_OCCURRED_AT/);
  assert.throws(() => evaluateSourceFreshness(1_000, 700, 0), /INVALID_SOURCE_MAX_AGE/);
});
