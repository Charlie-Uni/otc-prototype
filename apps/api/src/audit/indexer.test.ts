import assert from 'node:assert/strict';
import test from 'node:test';
import type { LifecycleEvent } from './lifecycle';
import { persistLifecycleEventWithDeps } from './indexer';

const EVENT: LifecycleEvent = {
  eventId: '31337:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0',
  chainId: 31_337,
  contractAddress: '0x1111111111111111111111111111111111111111',
  contractName: 'FundToken',
  eventName: 'SubscriptionRequested',
  category: 'subscription',
  fundId: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  logIndex: 0,
  blockNumber: 1,
  occurredAt: 1_000,
  submittedAt: 1_001,
  commitmentHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  payload: { requestId: '1', subscriptionAmount: '100' },
};

test('PostgreSQL persistence does not mirror lifecycle events into memory', async () => {
  const memoryEvents = new Map<string, LifecycleEvent>();
  let queryCalls = 0;
  const inserted = await persistLifecycleEventWithDeps(EVENT, {
    databaseUrl: 'postgres://chapter3',
    query: async () => {
      queryCalls += 1;
      return { rowCount: 1 };
    },
    memoryEvents,
  });

  assert.equal(inserted, true);
  assert.equal(queryCalls, 1);
  assert.equal(memoryEvents.size, 0);
});

test('memory-only persistence remains idempotent for the short-lived demo mode', async () => {
  const memoryEvents = new Map<string, LifecycleEvent>();
  const query = async () => {
    throw new Error('DATABASE_QUERY_NOT_EXPECTED');
  };

  const first = await persistLifecycleEventWithDeps(EVENT, {
    query,
    memoryEvents,
  });
  const duplicate = await persistLifecycleEventWithDeps(EVENT, {
    query,
    memoryEvents,
  });

  assert.equal(first, true);
  assert.equal(duplicate, false);
  assert.equal(memoryEvents.size, 1);
  assert.deepEqual(memoryEvents.get(EVENT.eventId), EVENT);
});
