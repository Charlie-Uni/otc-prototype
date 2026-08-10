import assert from 'node:assert/strict';
import test from 'node:test';
import { fundNetStabilityBenefit } from './stability';

test('computes a signed weighted supplementary stability index', () => {
  assert.deepEqual(fundNetStabilityBenefit([
    { componentId: 'detection', benefitBps: 2_000, weightBps: 5_000 },
    { componentId: 'loss', benefitBps: 1_000, weightBps: 3_000 },
    { componentId: 'control-cost', benefitBps: -500, weightBps: 2_000 },
  ]), {
    valueBps: 1_200,
    components: [
      { componentId: 'detection', benefitBps: 2_000, weightBps: 5_000 },
      { componentId: 'loss', benefitBps: 1_000, weightBps: 3_000 },
      { componentId: 'control-cost', benefitBps: -500, weightBps: 2_000 },
    ],
  });
});

test('requires unique components and weights summing to 10000', () => {
  assert.throws(() => fundNetStabilityBenefit([]), /EMPTY_STABILITY_COMPONENTS/);
  assert.throws(() => fundNetStabilityBenefit([
    { componentId: 'loss', benefitBps: 1_000, weightBps: 5_000 },
    { componentId: 'loss', benefitBps: 1_000, weightBps: 5_000 },
  ]), /DUPLICATE_STABILITY_COMPONENT_ID/);
  assert.throws(() => fundNetStabilityBenefit([
    { componentId: 'loss', benefitBps: 1_000, weightBps: 9_999 },
  ]), /STABILITY_WEIGHTS_MUST_SUM_10000/);
});
