import assert from 'node:assert/strict';
import test from 'node:test';
import { computeRedemptionPressureSnapshotFromEvents } from './redemptions';

const FUND_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const OTHER_FUND_ID = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

test('computes redemption pressure from matching request events inside the window', () => {
  const snapshot = computeRedemptionPressureSnapshotFromEvents({
    fundId: FUND_ID,
    occurredAt: 1_000,
    windowSec: 100,
    totalSupply: 10_000n,
    requests: [
      { fundId: FUND_ID, amount: 1_000n, requestedAt: 950 },
      { fundId: FUND_ID, amount: 800n, requestedAt: 1_000 },
      { fundId: FUND_ID, amount: 900n, requestedAt: 899 },
      { fundId: OTHER_FUND_ID, amount: 5_000n, requestedAt: 950 },
    ],
    settlements: [
      { fundId: FUND_ID, amount: 300n, settledAt: 975 },
      { fundId: FUND_ID, amount: 200n, settledAt: 800 },
    ],
  });

  assert.equal(snapshot.windowStartAt, 900);
  assert.equal(snapshot.windowEndAt, 1_000);
  assert.equal(snapshot.requestedAmount, '1800');
  assert.equal(snapshot.settledAmount, '300');
  assert.equal(snapshot.totalSupply, '10000');
  assert.equal(snapshot.redemptionPressureBps, 1_800);
});

test('rejects invalid redemption pressure windows', () => {
  assert.throws(
    () => computeRedemptionPressureSnapshotFromEvents({
      fundId: FUND_ID,
      occurredAt: 1_000,
      windowSec: 0,
      totalSupply: 10_000n,
      requests: [],
      settlements: [],
    }),
    /INVALID_REDEMPTION_PRESSURE_WINDOW/,
  );
});
