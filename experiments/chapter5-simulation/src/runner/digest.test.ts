import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticDigestSha256 } from './digest';

test('produces a stable digest independent of object key insertion order', () => {
  const left = { z: 1, nested: { b: 2, a: [3, { y: 4, x: 5 }] } };
  const right = { nested: { a: [3, { x: 5, y: 4 }], b: 2 }, z: 1 };
  assert.equal(semanticDigestSha256(left), semanticDigestSha256(right));
  assert.match(semanticDigestSha256(left), /^[0-9a-f]{64}$/);
});

test('changes the digest when a semantic value changes', () => {
  assert.notEqual(semanticDigestSha256({ value: 1 }), semanticDigestSha256({ value: 2 }));
});
