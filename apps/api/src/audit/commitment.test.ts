import assert from 'node:assert/strict';
import test from 'node:test';
import type { Hex } from 'viem';
import { lifecycleLogCommitmentHash } from './commitment';

test('event commitment detects topic or data tampering by hash mismatch', () => {
  const topics = [
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ] as const satisfies readonly Hex[];
  const data = '0x01020304' as const;
  const committed = lifecycleLogCommitmentHash(topics, data);

  const changedTopics = [
    topics[0],
    '0xcbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ] as const satisfies readonly Hex[];
  const changedData = '0x01020305' as const;

  assert.notEqual(lifecycleLogCommitmentHash(changedTopics, data), committed);
  assert.notEqual(lifecycleLogCommitmentHash(topics, changedData), committed);
  assert.equal(lifecycleLogCommitmentHash(topics, data), committed);
});
