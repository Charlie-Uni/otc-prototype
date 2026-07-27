import {
  MAX_BPS,
  RiskMetrics,
  normalizeStalePricingRiskBps,
} from '../risk/calc';

export type WeightScheme = {
  id: string;
  weightBps: readonly [number, number, number, number, number, number];
};

export type SensitivityInput = {
  metricsWithoutStale: Omit<RiskMetrics, 'stalePricingRiskBps'>;
  staleAgeSecRaw: number;
  maxStaleAgeDays: readonly number[];
  weightSchemes: readonly WeightScheme[];
  detectionThresholdBps: number;
  kappaBpsValues: readonly number[];
};

export type SensitivityRow = {
  weightSchemeId: string;
  weightBps: WeightScheme['weightBps'];
  maxStaleAgeDays: number;
  staleAgeSecRaw: number;
  stalePricingRiskBps: number;
  riskScoreBps: number;
  kappaBps: number;
  detected: boolean;
  interventionTriggered: boolean;
};

export const CHAPTER3_WEIGHT_SCHEMES: readonly WeightScheme[] = [
  {
    id: 'equal_weight_baseline',
    weightBps: [1_667, 1_667, 1_667, 1_667, 1_666, 1_666],
  },
  {
    id: 'legacy_weighted_robustness',
    weightBps: [2_000, 2_000, 2_000, 2_000, 1_000, 1_000],
  },
];

export const CHAPTER3_MAX_STALE_AGE_DAYS = [7, 14, 30, 45] as const;
export const CHAPTER3_KAPPA_BPS_VALUES = [5_000, 6_000, 7_000, 8_000] as const;

function validateBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

export function computeWeightedRiskScoreBps(metrics: RiskMetrics, weightBps: WeightScheme['weightBps']): number {
  const totalWeight = weightBps.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight !== MAX_BPS) throw new Error('WEIGHTS_MUST_SUM_10000');
  const values = [
    metrics.valuationHaircutBps,
    metrics.redemptionPressureBps,
    metrics.redemptionQueueRatioBps,
    metrics.liquidityShortfallBps,
    metrics.stalePricingRiskBps,
    metrics.investorConcentrationBps,
  ];
  values.forEach((value, index) => validateBps(value, `METRIC_${index}`));
  return Math.floor(values.reduce((sum, value, index) => sum + value * weightBps[index], 0) / MAX_BPS);
}

export function runRiskSensitivity(input: SensitivityInput): SensitivityRow[] {
  if (!Number.isInteger(input.staleAgeSecRaw) || input.staleAgeSecRaw < 0) {
    throw new Error('INVALID_STALE_AGE');
  }
  validateBps(input.detectionThresholdBps, 'DETECTION_THRESHOLD');
  if (input.maxStaleAgeDays.length === 0) throw new Error('MAX_STALE_AGE_DAYS_REQUIRED');
  if (input.weightSchemes.length === 0) throw new Error('WEIGHT_SCHEMES_REQUIRED');
  if (input.kappaBpsValues.length === 0) throw new Error('KAPPA_VALUES_REQUIRED');
  if (input.kappaBpsValues.length > 16) throw new Error('TOO_MANY_KAPPA_VALUES');
  if (new Set(input.kappaBpsValues).size !== input.kappaBpsValues.length) {
    throw new Error('DUPLICATE_KAPPA_VALUES');
  }
  input.kappaBpsValues.forEach((kappaBps) => validateBps(kappaBps, 'KAPPA'));

  return input.weightSchemes.flatMap((scheme) =>
    input.maxStaleAgeDays.flatMap((maxStaleAgeDays) => {
      if (!Number.isInteger(maxStaleAgeDays) || maxStaleAgeDays <= 0) {
        throw new Error('INVALID_MAX_STALE_AGE_DAYS');
      }
      const stalePricingRiskBps = normalizeStalePricingRiskBps(
        input.staleAgeSecRaw,
        maxStaleAgeDays * 24 * 60 * 60,
      );
      const riskScoreBps = computeWeightedRiskScoreBps(
        { ...input.metricsWithoutStale, stalePricingRiskBps },
        scheme.weightBps,
      );
      return input.kappaBpsValues.map((kappaBps) => ({
        weightSchemeId: scheme.id,
        weightBps: scheme.weightBps,
        maxStaleAgeDays,
        staleAgeSecRaw: input.staleAgeSecRaw,
        stalePricingRiskBps,
        riskScoreBps,
        kappaBps,
        detected: riskScoreBps >= input.detectionThresholdBps,
        interventionTriggered: riskScoreBps > kappaBps,
      }));
    }),
  );
}
