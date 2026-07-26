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
    eventName: 'NavPosted',
    transactionHash: txHash,
    logIndex: 7,
    blockNumber: 12,
    blockTimestamp: 1_200,
    commitmentHash: hash,
    defaultFundId: fundId,
    args: { nav: 1_000_000n, asOf: 900n, storedAt: 1_100n, by: address },
  });

  assert.equal(event.eventId, `31337:${txHash}:7`);
  assert.equal(event.category, 'valuation');
  assert.equal(event.occurredAt, 900);
  assert.equal(event.submittedAt, 1_100);
  assert.equal(event.fundId, fundId);
  assert.equal(event.payload.nav, '1000000');
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
