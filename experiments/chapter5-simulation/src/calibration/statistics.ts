import type { ReplicationEstimate, SampleSummary } from './types';

function requireSamples(values: readonly number[]): void {
  if (values.length === 0) throw new Error('EMPTY_STATISTICAL_SAMPLE');
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('NON_FINITE_STATISTICAL_SAMPLE');
  }
}

function quantile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const fraction = position - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

export function summarizeSample(values: readonly number[], zScore = 1.96): SampleSummary {
  requireSamples(values);
  if (!Number.isFinite(zScore) || zScore <= 0) throw new Error('INVALID_CI_Z_SCORE');
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length === 1
    ? 0
    : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const standardDeviation = Math.sqrt(variance);
  const standardError = standardDeviation / Math.sqrt(values.length);
  const halfWidth = zScore * standardError;
  return {
    count: values.length,
    mean,
    median: quantile(values, 0.5),
    standardDeviation,
    standardError,
    ci95Lower: mean - halfWidth,
    ci95Upper: mean + halfWidth,
  };
}

export function recommendReplicates(
  metricId: ReplicationEstimate['metricId'],
  observedStandardDeviation: number,
  targetHalfWidth: number,
  thesisMinimumReplicates: number,
  zScore = 1.96,
): ReplicationEstimate {
  if (!Number.isFinite(observedStandardDeviation) || observedStandardDeviation < 0) {
    throw new Error('INVALID_OBSERVED_STANDARD_DEVIATION');
  }
  if (!Number.isFinite(targetHalfWidth) || targetHalfWidth <= 0) {
    throw new Error('INVALID_TARGET_HALF_WIDTH');
  }
  if (!Number.isFinite(zScore) || zScore <= 0) throw new Error('INVALID_CI_Z_SCORE');
  if (!Number.isSafeInteger(thesisMinimumReplicates) || thesisMinimumReplicates <= 0) {
    throw new Error('INVALID_THESIS_MINIMUM_REPLICATES');
  }
  const impliedReplicates = Math.ceil(
    (zScore * observedStandardDeviation / targetHalfWidth) ** 2,
  );
  return {
    metricId,
    observedStandardDeviation,
    targetHalfWidth,
    impliedReplicates,
    thesisMinimumReplicates,
    recommendedReplicates: Math.max(thesisMinimumReplicates, impliedReplicates),
  };
}
