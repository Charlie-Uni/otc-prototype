import { z } from 'zod';

const positiveInteger = z.number().int().positive().safe();
const nonNegativeInteger = z.number().int().nonnegative().safe();
const bps = z.number().int().min(0).max(10_000);
const positiveBps = z.number().int().min(1).max(10_000);
const fractionalLossBps = z.number().int().min(1).max(9_999);
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
  thresholds: z.object({
    detectionBps: bps,
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
