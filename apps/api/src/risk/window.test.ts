import assert from 'node:assert/strict';
import test from 'node:test';
import type { LifecycleEvent } from '../audit/lifecycle';
import { computeRedemptionPressureSnapshotFromEvents } from './redemptions';
import { computeSubscriptionFlow } from './subscription-flow';
import { inWindow } from './window';

const FUND_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

test('uses a closed interval for all lifecycle flow windows', () => {
  assert.equal(inWindow(99, 100, 200), false);
  assert.equal(inWindow(100, 100, 200), true);
  assert.equal(inWindow(150, 100, 200), true);
  assert.equal(inWindow(200, 100, 200), true);
  assert.equal(inWindow(201, 100, 200), false);
});

test('subscription and redemption aggregators share the same closed window boundaries', () => {
  const subscriptionEvents = [99, 100, 200, 201].map((occurredAt, index): LifecycleEvent => ({
    eventId: `subscription:${index}`,
    chainId: 31_337,
    contractAddress: '0x1111111111111111111111111111111111111111',
    contractName: 'FundToken',
    eventName: 'SubscriptionRequested',
    category: 'subscription',
    fundId: FUND_ID,
    transactionHash: `0x${String(index).padStart(64, '0')}`,
    logIndex: index,
    blockNumber: index,
    occurredAt,
    submittedAt: occurredAt,
    commitmentHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    payload: { requestId: String(index), subscriptionAmount: '10' },
  }));
  const subscription = computeSubscriptionFlow({
    fundId: FUND_ID,
    occurredAt: 200,
    windowSec: 100,
    events: subscriptionEvents,
  });
  const redemption = computeRedemptionPressureSnapshotFromEvents({
    fundId: FUND_ID,
    occurredAt: 200,
    windowSec: 100,
    totalSupply: 100n,
    requests: [99, 100, 200, 201].map((requestedAt) => ({
      fundId: FUND_ID,
      redeemedShares: 10n,
      requestedAt,
    })),
    settlements: [],
  });

  assert.equal(subscription.requestedSubscriptionAmount, '20');
  assert.equal(redemption.requestedAmount, '20');
});
