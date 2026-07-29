import assert from 'node:assert/strict';
import test from 'node:test';
import type { LifecycleEvent } from '../audit/lifecycle';
import { deriveSettlementDelays } from './settlement-delay';

const FUND_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

function redemptionEvent(
  eventName: 'RedemptionRequested' | 'SettlementDelayed' | 'RedemptionSettled',
  requestId: string,
  occurredAt: number,
  payload: Record<string, unknown>,
): LifecycleEvent {
  return {
    eventId: `${eventName}:${requestId}`,
    chainId: 31_337,
    contractAddress: '0x1111111111111111111111111111111111111111',
    contractName: 'FundToken',
    eventName,
    category: 'redemption',
    fundId: FUND_ID,
    transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    logIndex: Number(requestId),
    blockNumber: occurredAt,
    occurredAt,
    submittedAt: occurredAt,
    commitmentHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    payload: {
      requestId,
      investor: '0x2222222222222222222222222222222222222222',
      redeemedShares: '10',
      ...payload,
    },
  };
}

test('derives final settlement delay and prior delay-flag lag by request id', () => {
  const records = deriveSettlementDelays({
    fundId: FUND_ID,
    events: [
      redemptionEvent('RedemptionRequested', '1', 100, { requestedAt: '100' }),
      redemptionEvent('SettlementDelayed', '1', 130, {
        requestedAt: '100',
        delayedAt: '130',
      }),
      redemptionEvent('RedemptionSettled', '1', 180, {
        requestedAt: '100',
        settledAt: '180',
      }),
    ],
  });

  assert.deepEqual(records, [{
    fundId: FUND_ID,
    requestId: '1',
    investor: '0x2222222222222222222222222222222222222222',
    redeemedShares: '10',
    requestedAt: 100,
    delayedAt: 130,
    settledAt: 180,
    delayed: true,
    delayFlagLagSec: 30,
    settled: true,
    settlementDelaySec: 80,
    status: 'settled',
  }]);
});

test('keeps unresolved redemptions pending without inventing a censored delay', () => {
  const [record] = deriveSettlementDelays({
    fundId: FUND_ID,
    events: [
      redemptionEvent('RedemptionRequested', '2', 200, { requestedAt: '200' }),
      redemptionEvent('SettlementDelayed', '2', 240, {
        requestedAt: '200',
        delayedAt: '240',
      }),
    ],
  });

  assert.equal(record.status, 'pending');
  assert.equal(record.delayed, true);
  assert.equal(record.delayFlagLagSec, 40);
  assert.equal(record.settled, false);
  assert.equal(record.settlementDelaySec, null);
});

test('rejects orphan settlements and invalid event time order', () => {
  assert.throws(
    () => deriveSettlementDelays({
      fundId: FUND_ID,
      events: [
        redemptionEvent('RedemptionSettled', '9', 180, {
          requestedAt: '100',
          settledAt: '180',
        }),
      ],
    }),
    /REDEMPTION_REQUEST_NOT_FOUND/,
  );

  assert.throws(
    () => deriveSettlementDelays({
      fundId: FUND_ID,
      events: [
        redemptionEvent('RedemptionRequested', '3', 200, { requestedAt: '200' }),
        redemptionEvent('RedemptionSettled', '3', 190, {
          requestedAt: '200',
          settledAt: '190',
        }),
      ],
    }),
    /INVALID_REDEMPTION_SETTLEMENT_TIME/,
  );
});
