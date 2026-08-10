import assert from 'node:assert/strict';
import test from 'node:test';
import type { RedemptionRequestState } from '../state/types';
import {
  controlledOutflow,
  gateSettlementDrawBps,
  qualifiesForGateRelease,
  redemptionBlockedByGate,
} from './gate';

const request: RedemptionRequestState = {
  requestId: 'redemption:r7:fund-001:investor-001:4',
  replicateId: 7,
  fundId: 'fund-001',
  investorId: 'investor-001',
  tick: 4,
  requestedAt: 1_000,
  requestedShares: 1_000,
  status: 'pending',
  pendingReason: 'queued',
  settledAt: null,
  settlementAmount: null,
  settlementNavPerShareBps: null,
  fireSaleDiscountLoss: null,
};

test('implements the continuous control attenuation endpoints', () => {
  assert.equal(controlledOutflow(8_000, 0), 8_000);
  assert.equal(controlledOutflow(8_000, 2_500), 6_000);
  assert.equal(controlledOutflow(8_000, 10_000), 0);
});

test('uses strict below-kappa release qualification', () => {
  assert.equal(qualifiesForGateRelease(6_999, 7_000), true);
  assert.equal(qualifiesForGateRelease(7_000, 7_000), false);
  assert.equal(qualifiesForGateRelease(7_001, 7_000), false);
});

test('uses one deterministic nested whole-request admission draw across phi values', () => {
  const draw = gateSettlementDrawBps(request, 20260814);
  assert.equal(gateSettlementDrawBps(request, 20260814), draw);
  const blocked = [0, 2_500, 5_000, 7_500, 10_000].map((phi) => (
    redemptionBlockedByGate(request, phi, 20260814)
  ));
  assert.equal(blocked[0], false);
  assert.equal(blocked.at(-1), true);
  blocked.forEach((value, index) => {
    if (index > 0 && blocked[index - 1]) assert.equal(value, true);
  });
});

test('rejects malformed control inputs', () => {
  assert.throws(() => controlledOutflow(-1, 0), /INVALID_UNCONTROLLED_OUTFLOW/);
  assert.throws(() => controlledOutflow(1, 10_001), /INVALID_CONTROL_PHI_BPS/);
  assert.throws(() => gateSettlementDrawBps(request, 0), /INVALID_CONTROL_SEED/);
  assert.throws(() => qualifiesForGateRelease(-1, 7_000), /INVALID_CONTROL_RISK_SCORE_BPS/);
});
