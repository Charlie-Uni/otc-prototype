export type RunningMoments = {
  count: number;
  mean: number;
  sumSquaredDeviations: number;
};

export type FormalPairedEstimate = {
  count: number;
  mean: number;
  standardDeviation: number;
  standardError: number;
  confidenceLower: number;
  confidenceUpper: number;
  twoSidedNormalPValue: number;
};

export type HypothesisTestPValue = {
  hypothesisId: string;
  testId: string;
  pValue: number;
};

export type HolmAdjustedPValue = HypothesisTestPValue & {
  adjustedPValue: number;
  familySize: number;
  rank: number;
};

export function createRunningMoments(): RunningMoments {
  return { count: 0, mean: 0, sumSquaredDeviations: 0 };
}

function assertRunningMoments(state: RunningMoments): void {
  if (
    !Number.isSafeInteger(state.count)
    || state.count < 0
    || !Number.isFinite(state.mean)
    || !Number.isFinite(state.sumSquaredDeviations)
    || state.sumSquaredDeviations < 0
    || (state.count === 0 && (state.mean !== 0 || state.sumSquaredDeviations !== 0))
  ) throw new Error('INVALID_RUNNING_MOMENTS');
}

export function addRunningSample(state: RunningMoments, value: number): void {
  assertRunningMoments(state);
  if (!Number.isFinite(value)) throw new Error('NON_FINITE_FORMAL_SAMPLE');
  if (state.count === Number.MAX_SAFE_INTEGER) throw new Error('FORMAL_SAMPLE_COUNT_OVERFLOW');
  state.count += 1;
  const delta = value - state.mean;
  state.mean += delta / state.count;
  state.sumSquaredDeviations += delta * (value - state.mean);
}

export function mergeRunningMoments(
  left: RunningMoments,
  right: RunningMoments,
): RunningMoments {
  assertRunningMoments(left);
  assertRunningMoments(right);
  if (left.count === 0) return { ...right };
  if (right.count === 0) return { ...left };
  const count = left.count + right.count;
  if (!Number.isSafeInteger(count)) throw new Error('FORMAL_SAMPLE_COUNT_OVERFLOW');
  const delta = right.mean - left.mean;
  return {
    count,
    mean: left.mean + delta * right.count / count,
    sumSquaredDeviations: left.sumSquaredDeviations
      + right.sumSquaredDeviations
      + delta * delta * left.count * right.count / count,
  };
}

function errorFunction(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

export function twoSidedNormalPValue(zScore: number): number {
  if (!Number.isFinite(zScore)) throw new Error('INVALID_FORMAL_Z_SCORE');
  const value = 1 - errorFunction(Math.abs(zScore) / Math.SQRT2);
  return Math.max(0, Math.min(1, value));
}

export function summarizeRunningMoments(
  state: RunningMoments,
  criticalValue = 1.959963984540054,
): FormalPairedEstimate {
  assertRunningMoments(state);
  if (state.count < 2) throw new Error('INSUFFICIENT_OR_INVALID_FORMAL_SAMPLE');
  if (!Number.isFinite(criticalValue) || criticalValue <= 0) {
    throw new Error('INVALID_FORMAL_CRITICAL_VALUE');
  }
  const standardDeviation = Math.sqrt(state.sumSquaredDeviations / (state.count - 1));
  const standardError = standardDeviation / Math.sqrt(state.count);
  const halfWidth = criticalValue * standardError;
  const zScore = standardError === 0
    ? state.mean === 0 ? 0 : Math.sign(state.mean) * Number.MAX_VALUE
    : state.mean / standardError;
  return {
    count: state.count,
    mean: state.mean,
    standardDeviation,
    standardError,
    confidenceLower: state.mean - halfWidth,
    confidenceUpper: state.mean + halfWidth,
    twoSidedNormalPValue: twoSidedNormalPValue(zScore),
  };
}

export function holmAdjustWithinHypothesis(
  tests: readonly HypothesisTestPValue[],
): HolmAdjustedPValue[] {
  const seen = new Set<string>();
  const byHypothesis = new Map<string, HypothesisTestPValue[]>();
  for (const entry of tests) {
    const key = `${entry.hypothesisId}:${entry.testId}`;
    if (
      !entry.hypothesisId.trim()
      || !entry.testId.trim()
      || seen.has(key)
      || !Number.isFinite(entry.pValue)
      || entry.pValue < 0
      || entry.pValue > 1
    ) throw new Error('INVALID_FORMAL_HYPOTHESIS_TEST');
    seen.add(key);
    const family = byHypothesis.get(entry.hypothesisId) ?? [];
    family.push({ ...entry });
    byHypothesis.set(entry.hypothesisId, family);
  }
  const adjusted: HolmAdjustedPValue[] = [];
  for (const [hypothesisId, family] of [...byHypothesis.entries()].sort()) {
    const ordered = [...family].sort((left, right) => (
      left.pValue - right.pValue || left.testId.localeCompare(right.testId)
    ));
    let runningMaximum = 0;
    ordered.forEach((entry, index) => {
      runningMaximum = Math.max(
        runningMaximum,
        Math.min(1, entry.pValue * (ordered.length - index)),
      );
      adjusted.push({
        hypothesisId,
        testId: entry.testId,
        pValue: entry.pValue,
        adjustedPValue: runningMaximum,
        familySize: ordered.length,
        rank: index + 1,
      });
    });
  }
  return adjusted.sort((left, right) => (
    left.hypothesisId.localeCompare(right.hypothesisId)
    || left.testId.localeCompare(right.testId)
  ));
}
