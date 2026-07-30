import type { LifecycleEvent } from '../audit/lifecycle';
import {
  lifecycleBigInt,
  lifecycleString,
  lifecycleTimestamp,
  sameFundId,
} from './lifecycle-values';

export type SettlementDelayRecord = {
  fundId: `0x${string}`;
  requestId: string;
  investor: string;
  redeemedShares: string;
  requestedAt: number;
  delayed: boolean;
  delayedAt: number | null;
  delayFlagLagSec: number | null;
  settled: boolean;
  settledAt: number | null;
  settlementDelaySec: number | null;
  status: 'pending' | 'settled';
};

type MutableSettlementRecord = Omit<
  SettlementDelayRecord,
  'delayed' | 'delayFlagLagSec' | 'settled' | 'settlementDelaySec' | 'status'
>;

function requestKey(event: LifecycleEvent): string {
  return `${event.fundId.toLowerCase()}:${lifecycleBigInt(event.payload, 'requestId')}`;
}

function assertMatchingRequestedAt(record: MutableSettlementRecord, event: LifecycleEvent): void {
  if (lifecycleTimestamp(event.payload, 'requestedAt') !== record.requestedAt) {
    throw new Error('REDEMPTION_REQUEST_TIME_MISMATCH');
  }
}

export function deriveSettlementDelays(args: {
  events: readonly LifecycleEvent[];
  fundId: `0x${string}`;
}): SettlementDelayRecord[] {
  const matchingEvents = args.events.filter((event) => sameFundId(event.fundId, args.fundId));
  const records = new Map<string, MutableSettlementRecord>();

  for (const event of matchingEvents) {
    if (event.eventName !== 'RedemptionRequested') continue;
    const key = requestKey(event);
    if (records.has(key)) throw new Error('DUPLICATE_REDEMPTION_REQUEST');
    records.set(key, {
      fundId: event.fundId,
      requestId: lifecycleBigInt(event.payload, 'requestId').toString(),
      investor: lifecycleString(event.payload, 'investor'),
      redeemedShares: lifecycleBigInt(event.payload, 'redeemedShares').toString(),
      requestedAt: lifecycleTimestamp(event.payload, 'requestedAt'),
      delayedAt: null,
      settledAt: null,
    });
  }

  for (const event of matchingEvents) {
    if (event.eventName !== 'SettlementDelayed' && event.eventName !== 'RedemptionSettled') {
      continue;
    }
    const record = records.get(requestKey(event));
    if (!record) throw new Error('REDEMPTION_REQUEST_NOT_FOUND');
    assertMatchingRequestedAt(record, event);

    if (event.eventName === 'SettlementDelayed') {
      if (record.delayedAt !== null) throw new Error('DUPLICATE_SETTLEMENT_DELAY');
      const delayedAt = lifecycleTimestamp(event.payload, 'delayedAt');
      if (delayedAt < record.requestedAt) throw new Error('INVALID_SETTLEMENT_DELAY_TIME');
      record.delayedAt = delayedAt;
      continue;
    }

    if (record.settledAt !== null) throw new Error('DUPLICATE_REDEMPTION_SETTLEMENT');
    const settledAt = lifecycleTimestamp(event.payload, 'settledAt');
    if (settledAt < record.requestedAt) throw new Error('INVALID_REDEMPTION_SETTLEMENT_TIME');
    record.settledAt = settledAt;
  }

  return [...records.values()]
    .map((record): SettlementDelayRecord => {
      if (
        record.delayedAt !== null
        && record.settledAt !== null
        && record.delayedAt > record.settledAt
      ) {
        throw new Error('SETTLEMENT_DELAY_AFTER_SETTLEMENT');
      }
      return {
        ...record,
        delayed: record.delayedAt !== null,
        delayFlagLagSec: record.delayedAt === null
          ? null
          : record.delayedAt - record.requestedAt,
        settled: record.settledAt !== null,
        settlementDelaySec: record.settledAt === null
          ? null
          : record.settledAt - record.requestedAt,
        status: record.settledAt === null ? 'pending' : 'settled',
      };
    })
    .sort((left, right) => {
      const timeOrder = left.requestedAt - right.requestedAt;
      if (timeOrder !== 0) return timeOrder;
      const leftRequestId = BigInt(left.requestId);
      const rightRequestId = BigInt(right.requestId);
      if (leftRequestId === rightRequestId) return 0;
      return leftRequestId < rightRequestId ? -1 : 1;
    });
}
