import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendReplicates, summarizeSample } from './statistics';

test('reports sample SD, SE, median, and a normal-approximation interval', () => {
  const summary = summarizeSample([1, 2, 3, 4], 1.96);
  assert.equal(summary.count, 4);
  assert.equal(summary.mean, 2.5);
  assert.equal(summary.median, 2.5);
  assert.ok(Math.abs(summary.standardDeviation - 1.2909944487358056) < 1e-12);
  assert.ok(Math.abs(summary.standardError - 0.6454972243679028) < 1e-12);
  assert.ok(summary.ci95Lower < summary.mean && summary.ci95Upper > summary.mean);
});

test('uses the larger of the precision-implied and thesis-minimum replication counts', () => {
  assert.deepEqual(recommendReplicates(
    'acceptedRequestRateBps',
    1_000,
    100,
    500,
    1.96,
  ), {
    metricId: 'acceptedRequestRateBps',
    observedStandardDeviation: 1_000,
    targetHalfWidth: 100,
    impliedReplicates: 385,
    thesisMinimumReplicates: 500,
    recommendedReplicates: 500,
  });
  assert.equal(recommendReplicates(
    'lossMagnitudeBps',
    2_000,
    50,
    500,
  ).recommendedReplicates, 6_147);
});

test('rejects empty, non-finite, and invalid precision inputs', () => {
  assert.throws(() => summarizeSample([]), /EMPTY_STATISTICAL_SAMPLE/);
  assert.throws(() => summarizeSample([Number.NaN]), /NON_FINITE_STATISTICAL_SAMPLE/);
  assert.throws(() => recommendReplicates(
    'lossMagnitudeBps',
    -1,
    100,
    500,
  ), /INVALID_OBSERVED_STANDARD_DEVIATION/);
});
