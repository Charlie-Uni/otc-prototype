import { z } from 'zod';

const positiveInteger = z.number().int().positive().safe();
const nonNegativeInteger = z.number().int().nonnegative().safe();
const bps = z.number().int().min(0).max(10_000);
const positiveBps = z.number().int().min(1).max(10_000);
const fractionalLossBps = z.number().int().min(1).max(9_999);
const boundedCoefficient = z.number().finite().min(0).max(20);
const boundedIntercept = z.number().finite().min(-20).max(20);
const priceImpactGamma = z.number().finite().gt(0).max(4);
const riskTierValues = z.object({
  low: positiveInteger,
  medium: positiveInteger,
  high: positiveInteger,
}).strict();
const riskTierBps = z.object({
  low: bps,
  medium: bps,
  high: bps,
}).strict();
const riskWeights = z.tuple([bps, bps, bps, bps, bps, bps]);

export const simulationConfigSchema = z.object({
  schemaVersion: z.literal(1),
  time: z.object({
    tickSec: z.literal(86_400),
    horizonDays: positiveInteger,
    primaryWindowDays: positiveInteger,
    robustnessWindowDays: z.array(positiveInteger).min(1),
  }).strict(),
  network: z.object({
    fundCount: positiveInteger.min(10),
    investorCount: positiveInteger,
    assetClassCount: positiveInteger.min(3),
    managerCount: positiveInteger,
    serviceProviderCount: positiveInteger,
    valuationMethodCount: positiveInteger,
    networkSeed: positiveInteger,
    sharedInvestorCoreBps: bps,
  }).strict(),
  heterogeneity: z.object({
    holderCountPerFund: positiveInteger.min(2),
    initialAum: positiveInteger,
    initialTotalShares: positiveInteger,
    expectedRedemptionClaimsBps: positiveBps,
    liquidAssetShareBpsByLiquidityMismatchTier: riskTierBps,
    navUpdateIntervalDaysByStalePricingTier: riskTierValues,
    topHolderShareBpsByConcentrationTier: riskTierBps,
  }).strict(),
  monteCarlo: z.object({
    pilotReplicatesPerCell: positiveInteger,
    formalMinimumReplicatesPerCell: positiveInteger,
    keyRobustnessReplicatesPerCell: positiveInteger,
  }).strict(),
  shock: z.object({
    baselineType: z.literal('valuation'),
    seed: positiveInteger,
    cycleStartAt: nonNegativeInteger,
    navDropBps: z.array(fractionalLossBps).min(1),
    r0CycleSec: z.literal(604_800),
    shockAtMode: z.literal('uniform_within_r0_cycle'),
    targetFundMode: z.literal('balanced_single_fund'),
  }).strict(),
  risk: z.object({
    weightSchemeId: z.literal('equal_weight_baseline'),
    weightBps: riskWeights,
    maxStaleAgeDays: positiveInteger,
  }).strict(),
  oracle: z.object({
    seed: positiveInteger,
    baselineLatencySec: nonNegativeInteger,
    baselineExecutionFailureBps: bps,
    maxAttempts: positiveInteger.max(16, 'ORACLE_MAX_ATTEMPTS_EXCEEDED'),
    retryDelaySec: nonNegativeInteger,
  }).strict(),
  observation: z.object({
    seed: positiveInteger,
    startOffsetUpperExclusiveSec: positiveInteger,
    pollingIntervalsSec: z.array(positiveInteger).min(1),
    synchronicityBucketSec: positiveInteger,
  }).strict(),
  behavior: z.object({
    seed: positiveInteger,
    initialRiskPriorBps: bps,
    expectedOthersWeightsBps: z.tuple([bps, bps, bps]),
    coefficients: z.object({
      interceptLogOdds: boundedIntercept,
      perceivedRisk: boundedCoefficient,
      publicness: boundedCoefficient,
      signalSynchronicity: boundedCoefficient,
      expectedOthersRedeem: boundedCoefficient,
      firstMoverAdvantage: boundedCoefficient,
    }).strict(),
  }).strict(),
  liquidity: z.object({
    redemptionRequestFractionBps: positiveBps,
    baselineSettlementDelayDays: nonNegativeInteger,
    priceImpactLambdaBps: z.number().int().min(0).max(9_999),
    priceImpactGamma,
    marketDepthMultipleBps: z.number().int().min(10_000).safe(),
  }).strict(),
  control: z.object({
    seed: positiveInteger,
    baselinePhiBps: bps,
    phiScanBps: z.array(bps).min(1),
    releaseConsecutiveTicks: positiveInteger,
    releaseConsecutiveTicksScan: z.array(positiveInteger).min(1),
    releaseDelayTicks: nonNegativeInteger,
    releaseDelayTicksScan: z.array(nonNegativeInteger).min(1),
  }).strict(),
  propagation: z.object({
    proximityWeightsBps: z.tuple([bps, bps, bps, bps]),
    sharedAssetPassThroughBps: bps,
    investorOverlapTransmissionBps: bps,
    publicRiskTransmissionBps: bps,
    publicControlTransmissionBps: bps,
    channels: z.object({
      sharedIlliquidAssets: z.boolean(),
      investorOverlap: z.boolean(),
      signalAnalogy: z.boolean(),
    }).strict(),
  }).strict(),
  thresholds: z.object({
    detectionBps: bps,
    baselineKappaBps: bps,
    kappaScanBps: z.array(bps).min(1),
  }).strict(),
}).strict().superRefine((config, context) => {
  if (config.time.primaryWindowDays > config.time.horizonDays) {
    context.addIssue({ code: 'custom', message: 'PRIMARY_WINDOW_EXCEEDS_HORIZON' });
  }
  if (config.time.robustnessWindowDays.some((days) => days > config.time.horizonDays)) {
    context.addIssue({ code: 'custom', message: 'ROBUSTNESS_WINDOW_EXCEEDS_HORIZON' });
  }
  if (config.monteCarlo.formalMinimumReplicatesPerCell < 500) {
    context.addIssue({ code: 'custom', message: 'FORMAL_REPLICATES_BELOW_MENTOR_MINIMUM' });
  }
  if (config.monteCarlo.keyRobustnessReplicatesPerCell < 1_000) {
    context.addIssue({ code: 'custom', message: 'ROBUSTNESS_REPLICATES_BELOW_MENTOR_MINIMUM' });
  }
  if (new Set(config.thresholds.kappaScanBps).size !== config.thresholds.kappaScanBps.length) {
    context.addIssue({ code: 'custom', message: 'DUPLICATE_KAPPA_VALUES' });
  }
  if (config.risk.weightBps.reduce((sum, weight) => sum + weight, 0) !== 10_000) {
    context.addIssue({ code: 'custom', message: 'RISK_WEIGHTS_MUST_SUM_10000' });
  }
  if (!config.thresholds.kappaScanBps.includes(config.thresholds.baselineKappaBps)) {
    context.addIssue({ code: 'custom', message: 'BASELINE_KAPPA_NOT_IN_SCAN' });
  }
  if (
    new Set(config.observation.pollingIntervalsSec).size
    !== config.observation.pollingIntervalsSec.length
  ) {
    context.addIssue({ code: 'custom', message: 'DUPLICATE_OBSERVATION_INTERVALS' });
  }
  if (config.observation.pollingIntervalsSec.some(
    (value, index, values) => index > 0 && value <= values[index - 1]!,
  )) {
    context.addIssue({ code: 'custom', message: 'OBSERVATION_INTERVALS_NOT_ASCENDING' });
  }
  if (config.behavior.expectedOthersWeightsBps.reduce(
    (sum, weight) => sum + weight,
    0,
  ) !== 10_000) {
    context.addIssue({ code: 'custom', message: 'EXPECTATION_WEIGHTS_MUST_SUM_10000' });
  }
  const maximumSaleToDepthRatio = 10_000 / config.liquidity.marketDepthMultipleBps;
  const maximumImpactSlope = (config.liquidity.priceImpactLambdaBps / 10_000)
    * (1 + config.liquidity.priceImpactGamma)
    * (maximumSaleToDepthRatio ** config.liquidity.priceImpactGamma);
  if (maximumImpactSlope >= 1) {
    context.addIssue({ code: 'custom', message: 'NON_MONOTONE_PRICE_IMPACT_REGION' });
  }
  const controlScans: ReadonlyArray<{
    values: readonly number[];
    baseline: number;
    duplicateError: string;
    orderError: string;
    baselineError: string;
  }> = [
    {
      values: config.control.phiScanBps,
      baseline: config.control.baselinePhiBps,
      duplicateError: 'DUPLICATE_CONTROL_PHI_VALUES',
      orderError: 'CONTROL_PHI_VALUES_NOT_ASCENDING',
      baselineError: 'BASELINE_CONTROL_PHI_NOT_IN_SCAN',
    },
    {
      values: config.control.releaseConsecutiveTicksScan,
      baseline: config.control.releaseConsecutiveTicks,
      duplicateError: 'DUPLICATE_CONTROL_RELEASE_STREAK_VALUES',
      orderError: 'CONTROL_RELEASE_STREAK_VALUES_NOT_ASCENDING',
      baselineError: 'BASELINE_CONTROL_RELEASE_STREAK_NOT_IN_SCAN',
    },
    {
      values: config.control.releaseDelayTicksScan,
      baseline: config.control.releaseDelayTicks,
      duplicateError: 'DUPLICATE_CONTROL_RELEASE_DELAY_VALUES',
      orderError: 'CONTROL_RELEASE_DELAY_VALUES_NOT_ASCENDING',
      baselineError: 'BASELINE_CONTROL_RELEASE_DELAY_NOT_IN_SCAN',
    },
  ];
  for (const scan of controlScans) {
    if (new Set(scan.values).size !== scan.values.length) {
      context.addIssue({ code: 'custom', message: scan.duplicateError });
    }
    if (scan.values.some((value, index, values) => index > 0 && value <= values[index - 1]!)) {
      context.addIssue({ code: 'custom', message: scan.orderError });
    }
    if (!scan.values.includes(scan.baseline)) {
      context.addIssue({ code: 'custom', message: scan.baselineError });
    }
  }
  if (config.propagation.proximityWeightsBps.reduce(
    (sum, weight) => sum + weight,
    0,
  ) !== 10_000) {
    context.addIssue({ code: 'custom', message: 'PROXIMITY_WEIGHTS_MUST_SUM_10000' });
  }
  if (new Set(config.shock.navDropBps).size !== config.shock.navDropBps.length) {
    context.addIssue({ code: 'custom', message: 'DUPLICATE_SHOCK_MAGNITUDES' });
  }
  if (config.shock.navDropBps.some((value, index, values) => index > 0 && value <= values[index - 1]!)) {
    context.addIssue({ code: 'custom', message: 'SHOCK_MAGNITUDES_NOT_ASCENDING' });
  }
  if (config.shock.cycleStartAt % config.shock.r0CycleSec !== 0) {
    context.addIssue({ code: 'custom', message: 'SHOCK_CYCLE_START_NOT_R0_ALIGNED' });
  }

  const liquidShares = config.heterogeneity.liquidAssetShareBpsByLiquidityMismatchTier;
  if (!(liquidShares.low > liquidShares.medium && liquidShares.medium > liquidShares.high)) {
    context.addIssue({ code: 'custom', message: 'LIQUIDITY_MISMATCH_TIERS_NOT_ORDERED' });
  }

  const staleIntervals = config.heterogeneity.navUpdateIntervalDaysByStalePricingTier;
  if (!(staleIntervals.low < staleIntervals.medium && staleIntervals.medium < staleIntervals.high)) {
    context.addIssue({ code: 'custom', message: 'STALE_PRICING_TIERS_NOT_ORDERED' });
  }

  const topShares = config.heterogeneity.topHolderShareBpsByConcentrationTier;
  if (!(topShares.low < topShares.medium && topShares.medium < topShares.high)) {
    context.addIssue({ code: 'custom', message: 'CONCENTRATION_TIERS_NOT_ORDERED' });
  }

  for (const topShareBps of Object.values(topShares)) {
    const holderCount = config.heterogeneity.holderCountPerFund;
    if (topShareBps * holderCount < 10_000 || 10_000 - topShareBps < holderCount - 1) {
      context.addIssue({ code: 'custom', message: 'INVALID_TOP_HOLDER_SHARE' });
      break;
    }
  }

  const sharedHolderCount = Math.floor(
    (config.heterogeneity.holderCountPerFund * config.network.sharedInvestorCoreBps) / 10_000,
  );
  const requiredInvestorCount = sharedHolderCount
    + config.network.fundCount * (config.heterogeneity.holderCountPerFund - sharedHolderCount);
  if (requiredInvestorCount > config.network.investorCount) {
    context.addIssue({ code: 'custom', message: 'INSUFFICIENT_INVESTORS_FOR_OVERLAP_DESIGN' });
  }
});

export type SimulationConfig = z.infer<typeof simulationConfigSchema>;

export function parseSimulationConfig(input: unknown): SimulationConfig {
  return simulationConfigSchema.parse(input);
}
