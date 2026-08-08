import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyReplayEvent,
  createReplayState,
  finalizeNavReferences,
  normalizedProjection,
  projectionEquals,
} from './replay-engine.mjs';

const ALICE = '0x000000000000000000000000000000000000a101';
const BOB = '0x000000000000000000000000000000000000a102';
const FUND_ID = `0x${'12'.repeat(32)}`;

function state() {
  return createReplayState({
    fundId: FUND_ID,
    actors: [ALICE, BOB],
    roles: [],
  });
}

function event(eventName, args, blockNumber = 1n) {
  return {
    contractName: eventName === 'NAVUpdatedEvent' ? 'NAVRegistry' : 'FundToken',
    eventName,
    args,
    blockNumber,
    transactionHash: `0x${'34'.repeat(32)}`,
  };
}

test('reconstructs mint, transfer, and burn from canonical Transfer events', () => {
  const replay = state();
  const zero = '0x0000000000000000000000000000000000000000';
  applyReplayEvent(replay, event('Transfer', { from: zero, to: ALICE, value: 100n }));
  applyReplayEvent(replay, event('Transfer', { from: ALICE, to: BOB, value: 25n }));
  applyReplayEvent(replay, event('Transfer', { from: BOB, to: zero, value: 10n }));
  const projection = normalizedProjection(replay);
  assert.equal(projection.totalSupply, '90');
  assert.equal(projection.balances[ALICE], '75');
  assert.equal(projection.balances[BOB], '15');
});

test('checks NAV references against the latest preceding replayed NAV event', () => {
  const replay = state();
  applyReplayEvent(replay, event('NAVUpdatedEvent', {
    fundId: FUND_ID,
    nav: 100n,
    netAssetValue: 0n,
    totalSharesSnapshot: 0n,
    asOf: 10n,
    storedAt: 11n,
    navAdjustmentBps: 0n,
    payloadHash: `0x${'56'.repeat(32)}`,
    isInitial: true,
  }));
  applyReplayEvent(replay, event('InvestorWhitelisted', { investor: ALICE, eligible: true }));
  applyReplayEvent(replay, event('SubscriptionRequested', {
    investor: ALICE,
    requestId: 0n,
    subscriptionAmount: 100n,
    requestedAt: 12n,
    requestHash: `0x${'78'.repeat(32)}`,
  }));
  const references = applyReplayEvent(replay, event('SubscriptionAccepted', {
    investor: ALICE,
    requestId: 0n,
    subscriptionAmount: 100n,
    mintedShares: 1n,
    navUsed: 100n,
    navAsOf: 10n,
    acceptedAt: 13n,
    requestHash: `0x${'78'.repeat(32)}`,
  }));
  assert.equal(references.length, 1);
  assert.equal(references[0].valid, true);
  assert.equal(references[0].latestRecoverableNavIndex, 0);
});

test('marks a stale NAV reference invalid after a later NAV version is replayed', () => {
  const replay = state();
  for (const [index, nav] of [100n, 120n].entries()) {
    applyReplayEvent(replay, event('NAVUpdatedEvent', {
      fundId: FUND_ID,
      nav,
      netAssetValue: index === 0 ? 0n : 120n,
      totalSharesSnapshot: index === 0 ? 0n : 1n,
      asOf: BigInt(10 + index),
      storedAt: BigInt(11 + index),
      navAdjustmentBps: index === 0 ? 0n : 2_000n,
      payloadHash: `0x${String(56 + index).repeat(64).slice(0, 64)}`,
      isInitial: index === 0,
    }));
  }
  applyReplayEvent(replay, event('InvestorWhitelisted', { investor: ALICE, eligible: true }));
  applyReplayEvent(replay, event('SubscriptionRequested', {
    investor: ALICE,
    requestId: 0n,
    subscriptionAmount: 100n,
    requestedAt: 12n,
    requestHash: `0x${'78'.repeat(32)}`,
  }));
  const [reference] = applyReplayEvent(replay, event('SubscriptionAccepted', {
    investor: ALICE,
    requestId: 0n,
    subscriptionAmount: 100n,
    mintedShares: 1n,
    navUsed: 100n,
    navAsOf: 10n,
    acceptedAt: 13n,
    requestHash: `0x${'78'.repeat(32)}`,
  }));
  assert.equal(reference.valid, false);
  assert.equal(reference.latestRecoverableNav, '120');
});

test('retains a historical NAV reference after later versions are appended', () => {
  const replay = state();
  applyReplayEvent(replay, event('NAVUpdatedEvent', {
    fundId: FUND_ID,
    nav: 100n,
    netAssetValue: 0n,
    totalSharesSnapshot: 0n,
    asOf: 10n,
    storedAt: 11n,
    navAdjustmentBps: 0n,
    payloadHash: `0x${'56'.repeat(32)}`,
    isInitial: true,
  }));
  applyReplayEvent(replay, event('InvestorWhitelisted', { investor: ALICE, eligible: true }));
  applyReplayEvent(replay, event('SubscriptionRequested', {
    investor: ALICE,
    requestId: 0n,
    subscriptionAmount: 100n,
    requestedAt: 12n,
    requestHash: `0x${'78'.repeat(32)}`,
  }));
  const references = applyReplayEvent(replay, event('SubscriptionAccepted', {
    investor: ALICE,
    requestId: 0n,
    subscriptionAmount: 100n,
    mintedShares: 1n,
    navUsed: 100n,
    navAsOf: 10n,
    acceptedAt: 13n,
    requestHash: `0x${'78'.repeat(32)}`,
  }));
  applyReplayEvent(replay, event('NAVUpdatedEvent', {
    fundId: FUND_ID,
    nav: 120n,
    netAssetValue: 120n,
    totalSharesSnapshot: 1n,
    asOf: 20n,
    storedAt: 21n,
    navAdjustmentBps: 2_000n,
    payloadHash: `0x${'57'.repeat(32)}`,
    isInitial: false,
  }));
  const [finalized] = finalizeNavReferences(replay, references);
  assert.equal(finalized.validAtExecution, true);
  assert.equal(finalized.recoverableAtEnd, true);
  assert.equal(finalized.valid, true);
});

test('fails closed on an event outside the declared replay vocabulary', () => {
  assert.throws(
    () => applyReplayEvent(state(), event('UnregisteredEvent', {})),
    /UNSUPPORTED_REPLAY_EVENT/,
  );
});

test('preserves explicit false roles from the frozen genesis configuration', () => {
  const replay = createReplayState({
    fundId: FUND_ID,
    actors: [ALICE],
    roles: [{ contractName: 'FundToken', role: `0x${'90'.repeat(32)}`, account: ALICE, enabled: false }],
  });
  const projection = normalizedProjection(replay);
  assert.deepEqual(Object.values(projection.roles), [false]);
});

test('projection comparison detects a modified reconstructed balance', () => {
  const replay = state();
  const expected = normalizedProjection(replay);
  const modified = structuredClone(expected);
  modified.balances[ALICE] = '1';
  assert.equal(projectionEquals(expected, modified), false);
});
