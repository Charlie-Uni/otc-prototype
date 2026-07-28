import assert from 'node:assert/strict';
import test from 'node:test';
import { exportLifecycleCsv } from './export';
import {
  LifecycleEvent,
  eventDisclosureTimeFor,
  lifecycleTimelineEntry,
  normalizeLifecycleEvent,
} from './lifecycle';
import { TRANSPARENCY_REGIMES } from '../risk/regimes';

const hash = `0x${'1'.repeat(64)}` as const;
const txHash = `0x${'2'.repeat(64)}` as const;
const address = `0x${'3'.repeat(40)}` as const;
const fundId = `0x${'4'.repeat(64)}` as const;

function lifecycleEvent(overrides: Partial<LifecycleEvent> = {}): LifecycleEvent {
  return {
    eventId: `31337:${txHash}:0`,
    chainId: 31_337,
    contractAddress: address,
    contractName: 'RiskRegistry',
    eventName: 'GateTriggered',
    category: 'control',
    fundId,
    transactionHash: txHash,
    logIndex: 0,
    blockNumber: 10,
    occurredAt: 1_000,
    submittedAt: 1_100,
    commitmentHash: hash,
    payload: { snapshotId: '1' },
    ...overrides,
  };
}

test('normalizes NAV business time, chain submission time, payload, and idempotency key', () => {
  const event = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'NAVRegistry',
    eventName: 'NAVUpdatedEvent',
    transactionHash: txHash,
    logIndex: 7,
    blockNumber: 12,
    blockTimestamp: 1_200,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {
      fundId,
      nav: 1_000_000_000_000_000_000n,
      netAssetValue: 10_000n,
      totalSharesSnapshot: 10_000n,
      asOf: 900n,
      storedAt: 1_100n,
      navAdjustmentBps: 100n,
      payloadHash: hash,
      isInitial: false,
      by: address,
    },
  });

  assert.equal(event.eventId, `31337:${txHash}:7`);
  assert.equal(event.category, 'valuation');
  assert.equal(event.occurredAt, 900);
  assert.equal(event.submittedAt, 1_100);
  assert.equal(event.fundId, fundId);
  assert.equal(event.payload.nav, '1000000000000000000');
  assert.equal(event.payload.netAssetValue, '10000');
  assert.equal(event.payload.totalSharesSnapshot, '10000');
});

test('normalizes subscription request and acceptance as separate lifecycle states', () => {
  const requested = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'FundToken',
    eventName: 'SubscriptionRequested',
    transactionHash: txHash,
    logIndex: 1,
    blockNumber: 10,
    blockTimestamp: 1_000,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {
      fundId,
      investor: address,
      requestId: 0n,
      subscriptionAmount: 500n,
      requestedAt: 900n,
      requestHash: hash,
    },
  });
  const accepted = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'FundToken',
    eventName: 'SubscriptionAccepted',
    transactionHash: txHash,
    logIndex: 2,
    blockNumber: 11,
    blockTimestamp: 1_100,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {
      fundId,
      investor: address,
      requestId: 0n,
      subscriptionAmount: 500n,
      mintedShares: 250n,
      navUsed: 2_000_000_000_000_000_000n,
      navAsOf: 850n,
      requestedAt: 900n,
      acceptedAt: 1_050n,
      requestHash: hash,
    },
  });

  assert.equal(requested.category, 'subscription');
  assert.equal(requested.occurredAt, 900);
  assert.equal(accepted.category, 'subscription');
  assert.equal(accepted.occurredAt, 1_050);
  assert.equal(accepted.payload.mintedShares, '250');
  assert.equal(accepted.payload.navUsed, '2000000000000000000');
});

test('retains redeemed shares, settlement NAV, and computed cash amount in redemption evidence', () => {
  const settled = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'FundToken',
    eventName: 'RedemptionSettled',
    transactionHash: txHash,
    logIndex: 3,
    blockNumber: 12,
    blockTimestamp: 1_200,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {
      fundId,
      investor: address,
      requestId: 1n,
      redeemedShares: 250n,
      redemptionAmount: 500n,
      settlementNav: 2_000_000_000_000_000_000n,
      settlementNavAsOf: 850n,
      requestedAt: 900n,
      settledAt: 1_150n,
    },
  });

  assert.equal(settled.category, 'redemption');
  assert.equal(settled.occurredAt, 1_150);
  assert.equal(settled.payload.redeemedShares, '250');
  assert.equal(settled.payload.redemptionAmount, '500');
  assert.equal(settled.payload.settlementNav, '2000000000000000000');
  assert.equal(settled.payload.settlementNavAsOf, '850');
});

test('normalizes valuation and liquidity Oracle updates before risk scoring', () => {
  const valuation = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'NAVRegistry',
    eventName: 'ValuationHaircutEvent',
    transactionHash: txHash,
    logIndex: 3,
    blockNumber: 12,
    blockTimestamp: 1_200,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {
      fundId,
      valuationHaircutBps: 1_200,
      occurredAt: 1_000n,
      submittedAt: 1_100n,
      payloadHash: hash,
      submittedBy: address,
    },
  });
  const liquidity = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'RiskRegistry',
    eventName: 'LiquidityBufferUpdated',
    transactionHash: txHash,
    logIndex: 4,
    blockNumber: 13,
    blockTimestamp: 1_300,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {
      fundId,
      liquidityBufferRatioBps: 6_500n,
      occurredAt: 1_050n,
      submittedAt: 1_150n,
      payloadHash: hash,
      submittedBy: address,
    },
  });

  assert.equal(valuation.category, 'valuation');
  assert.equal(valuation.occurredAt, 1_000);
  assert.equal(valuation.submittedAt, 1_100);
  assert.equal(liquidity.category, 'liquidity');
  assert.equal(liquidity.occurredAt, 1_050);
  assert.equal(liquidity.submittedAt, 1_150);
});

test('uses the explicit event fund id and chain timestamp for a share registry event', () => {
  const event = normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'FundToken',
    eventName: 'ShareBalanceUpdated',
    transactionHash: txHash,
    logIndex: 2,
    blockNumber: 11,
    blockTimestamp: 1_200,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: { investor: address, balance: 500n, totalSupply: 500n, reason: hash },
  });

  assert.equal(event.category, 'share_registry');
  assert.equal(event.occurredAt, 1_200);
  assert.equal(event.submittedAt, 1_200);
  assert.equal(event.fundId, fundId);
});

test('computes disclosure time by regime and audience without treating private controls as public', () => {
  const event = lifecycleEvent();

  assert.equal(eventDisclosureTimeFor(event, TRANSPARENCY_REGIMES.R1, 'public'), 1_100);
  assert.equal(eventDisclosureTimeFor(event, TRANSPARENCY_REGIMES.R2, 'public'), null);
  assert.equal(eventDisclosureTimeFor(event, TRANSPARENCY_REGIMES.R2, 'regulator'), 1_100);
  assert.equal(
    eventDisclosureTimeFor(event, TRANSPARENCY_REGIMES.R3, 'public'),
    1_100 + 24 * 60 * 60,
  );
});

test('uses the same R4 state-dependent policy for lifecycle control events', () => {
  const triggered = lifecycleEvent({
    eventName: 'GateTriggered',
    payload: { riskScoreBps: 8_000 },
  });
  const released = lifecycleEvent({
    eventName: 'GateReleased',
    payload: {},
  });
  const hiddenGreenControl = lifecycleEvent({
    eventName: 'SwingPricingApplied',
    payload: { riskScoreBps: 2_000 },
  });
  const visibleRedControl = lifecycleEvent({
    eventName: 'SwingPricingApplied',
    payload: { riskScoreBps: 8_000 },
  });
  const visibleRedSidePocket = lifecycleEvent({
    eventName: 'SidePocketCreated',
    payload: { riskScoreBps: 8_000 },
  });

  assert.equal(eventDisclosureTimeFor(triggered, TRANSPARENCY_REGIMES.R4, 'public'), 1_100);
  assert.equal(eventDisclosureTimeFor(released, TRANSPARENCY_REGIMES.R4, 'public'), 1_100);
  assert.equal(eventDisclosureTimeFor(hiddenGreenControl, TRANSPARENCY_REGIMES.R4, 'public'), null);
  assert.equal(eventDisclosureTimeFor(visibleRedControl, TRANSPARENCY_REGIMES.R4, 'public'), 1_100);
  assert.equal(eventDisclosureTimeFor(visibleRedSidePocket, TRANSPARENCY_REGIMES.R4, 'public'), 1_100);
  assert.equal(eventDisclosureTimeFor(hiddenGreenControl, TRANSPARENCY_REGIMES.R4, 'regulator'), 1_100);
});

test('exports four timestamp dimensions and raw candidate lags without assigning DetectionLag', () => {
  const entry = lifecycleTimelineEntry(lifecycleEvent(), TRANSPARENCY_REGIMES.R1, 'regulator', 1_300);

  assert.equal(entry.occurredAt, 1_000);
  assert.equal(entry.submittedAt, 1_100);
  assert.equal(entry.disclosedAt, 1_100);
  assert.equal(entry.observedAt, 1_300);
  assert.equal(entry.recordingLagSec, 100);
  assert.equal(entry.disclosureLagSec, 100);
  assert.equal(entry.observationLagSec, 300);

  const csv = exportLifecycleCsv([entry]);
  assert.match(csv, /occurredAt,submittedAt,disclosedAt,observedAt/);
  assert.match(csv, /recordingLagSec,disclosureLagSec,observationLagSec/);
  assert.match(csv, /GateTriggered/);
});

test('rejects unsupported event names instead of silently misclassifying them', () => {
  assert.throws(() => normalizeLifecycleEvent({
    chainId: 31_337,
    contractAddress: address,
    contractName: 'FundToken',
    eventName: 'UnknownEvent',
    transactionHash: txHash,
    logIndex: 0,
    blockNumber: 1,
    blockTimestamp: 1,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: {},
  }), /UNSUPPORTED_LIFECYCLE_EVENT/);
});
