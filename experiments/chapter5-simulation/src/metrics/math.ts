const BPS = 10_000;

export function requireSafeNonNegativeMetric(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

export function ratioBps(numerator: number, denominator: number, field: string): number {
  requireSafeNonNegativeMetric(numerator, `${field}_NUMERATOR`);
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`INVALID_${field}_DENOMINATOR`);
  }
  const result = (BigInt(numerator) * BigInt(BPS)) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field}_RESULT_OVERFLOW`);
  return Number(result);
}

export function signedRatioBps(numerator: number, denominator: number, field: string): number {
  if (!Number.isSafeInteger(numerator)) throw new Error(`INVALID_${field}_NUMERATOR`);
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`INVALID_${field}_DENOMINATOR`);
  }
  const result = (BigInt(numerator) * BigInt(BPS)) / BigInt(denominator);
  if (
    result > BigInt(Number.MAX_SAFE_INTEGER)
    || result < BigInt(Number.MIN_SAFE_INTEGER)
  ) throw new Error(`${field}_RESULT_OVERFLOW`);
  return Number(result);
}

export function arithmeticMean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_MEAN_VALUE');
  }
  return Number(
    values.reduce((sum, value) => sum + BigInt(value), 0n) / BigInt(values.length),
  );
}

export function nearestRankPercentile(
  values: readonly number[],
  percentile: number,
): number | null {
  if (values.length === 0) return null;
  if (!Number.isInteger(percentile) || percentile < 1 || percentile > 100) {
    throw new Error('INVALID_PERCENTILE');
  }
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_PERCENTILE_VALUE');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length / 100) - 1]!;
}

export function integerMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_MEDIAN_VALUE');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return Number((BigInt(sorted[middle - 1]!) + BigInt(sorted[middle]!)) / 2n);
}

export function outcomeWindowEndAt(
  shockAt: number,
  windowDays: number,
  horizonDays: number,
): number {
  requireSafeNonNegativeMetric(shockAt, 'METRIC_SHOCK_AT');
  if (!Number.isSafeInteger(windowDays) || windowDays <= 0 || windowDays > horizonDays) {
    throw new Error('INVALID_METRIC_WINDOW_DAYS');
  }
  return shockAt + windowDays * 86_400;
}
