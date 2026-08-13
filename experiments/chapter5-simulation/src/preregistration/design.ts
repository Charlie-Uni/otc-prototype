import { z } from 'zod';

const regimeId = z.enum(['R0', 'R1', 'R2', 'R3', 'R4']);
const hypothesisId = z.enum(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
export const FORMAL_TREATMENT_PATHS = [
  'mechanisms.publicRiskDisclosureEnabled',
  'regime.delaySec',
  'regime.granularity',
  'regime.controlDisclosure',
  'config.propagation.channels.investorOverlap',
  'config.propagation.channels.sharedIlliquidAssets',
  'config.propagation.channels.signalAnalogy',
  'design.networkScale',
  'config.network.sharedInvestorCoreBps',
  'config.heterogeneity.liquidAssetShareBpsByLiquidityMismatchTier',
  'config.heterogeneity.navUpdateIntervalDaysByStalePricingTier',
  'config.liquidity.baselineSettlementDelayDays',
  'config.thresholds.baselineKappaBps',
  'config.control.baselinePhiBps',
  'config.control.releaseConsecutiveTicks',
  'config.control.releaseDelayTicks',
  'design.riskWeightScheme',
  'config.risk.maxStaleAgeDays',
  'config.liquidity.priceImpactGamma',
  'config.oracle.baselineLatencySec',
  'config.oracle.baselineExecutionFailureBps',
  'config.propagation.proximityWeightsBps',
  'design.shockType',
] as const;
const formalTreatmentPath = z.enum(FORMAL_TREATMENT_PATHS);
const treatmentValue = z.union([
  z.number().finite(),
  z.string().min(1),
  z.boolean(),
  z.array(z.number().finite()),
  z.record(z.number().finite()),
]);
const treatmentChange = z.object({
  path: formalTreatmentPath,
  value: treatmentValue,
}).strict();
const robustnessValue = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]+$/),
  value: treatmentValue,
}).strict();

export const formalExperimentDesignSchema = z.object({
  schemaVersion: z.literal(1),
  baselineConfigPath: z.literal('config/formal-baseline.json'),
  formalReplicates: z.number().int().min(500),
  keyRobustnessReplicates: z.number().int().min(1_000),
  controlExperimentKappaBps: z.number().int().min(0).max(10_000),
  primaryPolicy: z.object({
    regimeIds: z.array(regimeId).length(5),
    valuationShockBps: z.array(z.number().int().positive().max(9_999)).min(1),
    includeMatchedNoShock: z.literal(true),
  }).strict(),
  ablations: z.array(z.object({
    id: z.enum(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']),
    label: z.string().min(1),
    regimeId,
    changedPath: formalTreatmentPath,
    baselineValue: treatmentValue,
    comparisonValue: treatmentValue,
    fixedChanges: z.array(treatmentChange).default([]),
    hypothesisIds: z.array(hypothesisId).min(1),
  }).strict()).length(7),
  robustnessScans: z.array(z.object({
    id: z.string().regex(/^[A-Z0-9_]+$/),
    changedPath: formalTreatmentPath,
    baselineValueId: z.string().min(1),
    replicates: z.number().int().min(500),
    fixedChanges: z.array(treatmentChange).default([]),
    values: z.array(robustnessValue).min(2),
  }).strict()).min(1),
  behaviorLhs: z.object({
    sampleCount: z.number().int().min(8).max(128),
    seed: z.number().int().positive().safe(),
    replicates: z.number().int().min(500),
    ranges: z.record(z.tuple([z.number().finite(), z.number().finite()])),
  }).strict(),
}).strict().superRefine((design, context) => {
  const requireUnique = (values: readonly string[], message: string) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message });
    }
  };
  requireUnique(design.primaryPolicy.regimeIds, 'DUPLICATE_PRIMARY_REGIME');
  requireUnique(design.ablations.map(({ id }) => id), 'DUPLICATE_ABLATION_ID');
  requireUnique(design.robustnessScans.map(({ id }) => id), 'DUPLICATE_ROBUSTNESS_SCAN_ID');
  for (const ablation of design.ablations) {
    if (JSON.stringify(ablation.baselineValue) === JSON.stringify(ablation.comparisonValue)) {
      context.addIssue({ code: 'custom', message: `ABLATION_HAS_NO_CHANGE:${ablation.id}` });
    }
    if (ablation.fixedChanges.some(({ path }) => path === ablation.changedPath)) {
      context.addIssue({ code: 'custom', message: `ABLATION_FIXED_PATH_COLLISION:${ablation.id}` });
    }
  }
  for (const scan of design.robustnessScans) {
    const valueIds = scan.values.map(({ id }) => id);
    requireUnique(valueIds, `DUPLICATE_ROBUSTNESS_VALUE:${scan.id}`);
    if (!valueIds.includes(scan.baselineValueId)) {
      context.addIssue({ code: 'custom', message: `ROBUSTNESS_BASELINE_MISSING:${scan.id}` });
    }
    if (scan.fixedChanges.some(({ path }) => path === scan.changedPath)) {
      context.addIssue({ code: 'custom', message: `ROBUSTNESS_FIXED_PATH_COLLISION:${scan.id}` });
    }
    if (scan.replicates !== design.formalReplicates
      && scan.replicates !== design.keyRobustnessReplicates) {
      context.addIssue({ code: 'custom', message: `UNAPPROVED_ROBUSTNESS_REPLICATIONS:${scan.id}` });
    }
  }
  for (const [field, [lower, upper]] of Object.entries(design.behaviorLhs.ranges)) {
    if (!(lower < upper)) {
      context.addIssue({ code: 'custom', message: `INVALID_LHS_RANGE:${field}` });
    }
  }
});

export type FormalExperimentDesign = z.infer<typeof formalExperimentDesignSchema>;
export type TreatmentValue = z.infer<typeof treatmentValue>;

export function parseFormalExperimentDesign(input: unknown): FormalExperimentDesign {
  return formalExperimentDesignSchema.parse(input);
}
