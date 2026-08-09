import { RED_SCORE_BPS, YELLOW_SCORE_BPS } from '../risk/calc';

export type PublicGranularity = 'aggregate' | 'detailed' | 'tiered';

export function firstScheduledObservationAt(
  disclosedAt: number,
  observationStartAt: number,
  pollingIntervalSec: number,
): number {
  if (disclosedAt <= observationStartAt) return observationStartAt;
  const intervals = Math.ceil((disclosedAt - observationStartAt) / pollingIntervalSec);
  return observationStartAt + intervals * pollingIntervalSec;
}

export function publicThresholdIsIdentifiable(
  granularity: PublicGranularity,
  thresholdBps: number,
): boolean {
  return granularity === 'detailed'
    || thresholdBps === YELLOW_SCORE_BPS
    || thresholdBps === RED_SCORE_BPS;
}
