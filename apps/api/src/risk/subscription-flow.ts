import type { LifecycleEvent } from '../audit/lifecycle';
import { lifecycleBigInt, sameFundId } from './lifecycle-values';
import { inWindow } from './window';

export type SubscriptionFlowSnapshot = {
  fundId: `0x${string}`;
  windowStartAt: number;
  windowEndAt: number;
  requestedSubscriptionAmount: string;
  acceptedSubscriptionAmount: string;
  mintedShares: string;
  requestCount: number;
  acceptedCount: number;
};

export function computeSubscriptionFlow(args: {
  events: readonly LifecycleEvent[];
  fundId: `0x${string}`;
  occurredAt: number;
  windowSec: number;
}): SubscriptionFlowSnapshot {
  if (!Number.isSafeInteger(args.occurredAt) || args.occurredAt <= 0) {
    throw new Error('INVALID_OCCURRED_AT');
  }
  if (!Number.isSafeInteger(args.windowSec) || args.windowSec <= 0) {
    throw new Error('INVALID_SUBSCRIPTION_FLOW_WINDOW');
  }

  const windowStartAt = Math.max(0, args.occurredAt - args.windowSec);
  const matchingEvents = args.events.filter((event) => (
    sameFundId(event.fundId, args.fundId)
    && inWindow(event.occurredAt, windowStartAt, args.occurredAt)
  ));
  const requests = matchingEvents.filter((event) => event.eventName === 'SubscriptionRequested');
  const acceptances = matchingEvents.filter((event) => event.eventName === 'SubscriptionAccepted');
  const requestedSubscriptionAmount = requests.reduce(
    (sum, event) => sum + lifecycleBigInt(event.payload, 'subscriptionAmount'),
    0n,
  );
  const acceptedSubscriptionAmount = acceptances.reduce(
    (sum, event) => sum + lifecycleBigInt(event.payload, 'subscriptionAmount'),
    0n,
  );
  const mintedShares = acceptances.reduce(
    (sum, event) => sum + lifecycleBigInt(event.payload, 'mintedShares'),
    0n,
  );

  return {
    fundId: args.fundId,
    windowStartAt,
    windowEndAt: args.occurredAt,
    requestedSubscriptionAmount: requestedSubscriptionAmount.toString(),
    acceptedSubscriptionAmount: acceptedSubscriptionAmount.toString(),
    mintedShares: mintedShares.toString(),
    requestCount: requests.length,
    acceptedCount: acceptances.length,
  };
}
