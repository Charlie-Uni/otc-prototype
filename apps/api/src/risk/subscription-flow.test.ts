import assert from 'node:assert/strict';
import test from 'node:test';
import type { LifecycleEvent } from '../audit/lifecycle';
import { computeSubscriptionFlow } from './subscription-flow';

const FUND_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const OTHER_FUND_ID = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

function event(
  eventName: 'SubscriptionRequested' | 'SubscriptionAccepted',
  occurredAt: number,
  payload: Record<string, unknown>,
  fundId: `0x${string}` = FUND_ID,
): LifecycleEvent {
  return {
    eventId: `${eventName}:${occurredAt}:${String(payload.requestId)}`,
    chainId: 31_337,
    contractAddress: '0x1111111111111111111111111111111111111111',
    contractName: 'FundToken',
    eventName,
    category: 'subscription',
    fundId,
    transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    logIndex: Number(payload.requestId),
    blockNumber: occurredAt,
    occurredAt,
    submittedAt: occurredAt,
    commitmentHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    payload,
  };
}

test('aggregates requested and accepted subscription flows without choosing one canonical flow', () => {
  const snapshot = computeSubscriptionFlow({
    fundId: FUND_ID,
    occurredAt: 1_000,
    windowSec: 100,
    events: [
      event('SubscriptionRequested', 900, { requestId: '1', subscriptionAmount: '100' }),
      event('SubscriptionAccepted', 950, {
        requestId: '1',
        subscriptionAmount: '100',
        mintedShares: '80',
      }),
      event('SubscriptionRequested', 1_000, { requestId: '2', subscriptionAmount: '200' }),
      event('SubscriptionRequested', 899, { requestId: '3', subscriptionAmount: '999' }),
      event(
        'SubscriptionAccepted',
        975,
        { requestId: '4', subscriptionAmount: '500', mintedShares: '400' },
        OTHER_FUND_ID,
      ),
    ],
  });

  assert.deepEqual(snapshot, {
    fundId: FUND_ID,
    windowStartAt: 900,
    windowEndAt: 1_000,
    requestedSubscriptionAmount: '300',
    acceptedSubscriptionAmount: '100',
    mintedShares: '80',
    requestCount: 2,
    acceptedCount: 1,
  });
});

test('returns zero flows for an empty window and rejects invalid windows', () => {
  const snapshot = computeSubscriptionFlow({
    fundId: FUND_ID,
    occurredAt: 1_000,
    windowSec: 100,
    events: [],
  });
  assert.equal(snapshot.requestedSubscriptionAmount, '0');
  assert.equal(snapshot.acceptedSubscriptionAmount, '0');
  assert.equal(snapshot.mintedShares, '0');
  assert.equal(snapshot.requestCount, 0);
  assert.equal(snapshot.acceptedCount, 0);

  assert.throws(
    () => computeSubscriptionFlow({
      fundId: FUND_ID,
      occurredAt: 1_000,
      windowSec: 0,
      events: [],
    }),
    /INVALID_SUBSCRIPTION_FLOW_WINDOW/,
  );
});
