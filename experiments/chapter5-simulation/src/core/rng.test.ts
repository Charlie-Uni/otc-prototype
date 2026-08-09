import assert from 'node:assert/strict';
import test from 'node:test';
import { RandomDrawKey, randomUint64, randomUnitInterval } from './rng';

const baseKey: RandomDrawKey = {
  masterSeed: 20260809n,
  replicateId: 7,
  entityId: 'investor-42',
  moduleId: 'redemption-decision',
  tick: 12,
  drawPurpose: 'decision-uniform',
};

test('produces deterministic counter-based draws without mutable global state', () => {
  assert.equal(randomUint64(baseKey, 0), randomUint64(baseKey, 0));
  assert.equal(randomUint64(baseKey, 0), 2_586_514_779_912_619_833n);
  assert.equal(randomUint64(baseKey, 3), randomUint64(baseKey, 3));
  assert.notEqual(randomUint64(baseKey, 0), randomUint64(baseKey, 1));
});

test('includes every paired-counterfactual identity dimension in the draw', () => {
  const baseline = randomUint64(baseKey);
  const variants: RandomDrawKey[] = [
    { ...baseKey, masterSeed: baseKey.masterSeed + 1n },
    { ...baseKey, replicateId: baseKey.replicateId + 1 },
    { ...baseKey, entityId: 'investor-43' },
    { ...baseKey, moduleId: 'observation-schedule' },
    { ...baseKey, tick: baseKey.tick + 1 },
    { ...baseKey, drawPurpose: 'observation-offset' },
  ];
  variants.forEach((variant) => assert.notEqual(randomUint64(variant), baseline));
  assert.notEqual(randomUint64(baseKey, 1), baseline);
});

test('mechanism branches cannot shift unrelated random draws', () => {
  const unaffectedBefore = randomUint64({ ...baseKey, moduleId: 'asset-return' }, 2);
  randomUint64({ ...baseKey, moduleId: 'gate-decision' }, 0);
  randomUint64({ ...baseKey, moduleId: 'gate-decision' }, 1);
  const unaffectedAfter = randomUint64({ ...baseKey, moduleId: 'asset-return' }, 2);
  assert.equal(unaffectedAfter, unaffectedBefore);
});

test('unit draws remain in the half-open interval [0, 1)', () => {
  for (let ordinal = 0; ordinal < 1_000; ordinal += 1) {
    const value = randomUnitInterval(baseKey, ordinal);
    assert.ok(value >= 0 && value < 1);
  }
});

test('rejects incomplete or invalid random identities', () => {
  assert.throws(() => randomUint64({ ...baseKey, tick: -1 }), /INVALID_TICK/);
  assert.throws(() => randomUint64({ ...baseKey, drawPurpose: '' }), /INVALID_DRAW_PURPOSE/);
  assert.throws(() => randomUint64(baseKey, -1), /INVALID_DRAW_ORDINAL/);
});
