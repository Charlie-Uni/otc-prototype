export type SourceFreshnessStatus = 'fresh' | 'stale_warning' | 'trusted_latest_unbounded';

export type SourceFreshness = {
  ageSec: number;
  maxAgeSec: number | null;
  status: SourceFreshnessStatus;
};

export function evaluateSourceFreshness(
  observationAt: number,
  sourceOccurredAt: number,
  maxAgeSec: number | undefined,
): SourceFreshness {
  if (!Number.isInteger(observationAt) || observationAt <= 0) {
    throw new Error('INVALID_OBSERVATION_TIME');
  }
  if (!Number.isInteger(sourceOccurredAt) || sourceOccurredAt <= 0 || sourceOccurredAt > observationAt) {
    throw new Error('INVALID_SOURCE_OCCURRED_AT');
  }
  if (maxAgeSec === undefined) {
    return {
      ageSec: observationAt - sourceOccurredAt,
      maxAgeSec: null,
      status: 'trusted_latest_unbounded',
    };
  }
  if (!Number.isInteger(maxAgeSec) || maxAgeSec <= 0) {
    throw new Error('INVALID_SOURCE_MAX_AGE');
  }
  const ageSec = observationAt - sourceOccurredAt;
  return {
    ageSec,
    maxAgeSec,
    status: ageSec > maxAgeSec ? 'stale_warning' : 'fresh',
  };
}
