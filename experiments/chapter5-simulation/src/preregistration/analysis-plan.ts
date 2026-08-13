import { z } from 'zod';

const bps = z.number().int().min(0).max(10_000);
const hypothesisId = z.enum(['H1', 'H2', 'H3', 'H4a', 'H4b', 'H5', 'H6']);

const analysisPlanSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal('preregistration_specification'),
  formalExecutionRequiresTag: z.literal('chapter5-sim-prereg-v2'),
  pilotDataExcluded: z.literal(true),
  primaryWindowDays: z.literal(30),
  robustnessWindowDays: z.tuple([z.literal(60), z.literal(90)]),
  replications: z.object({
    formalPerCell: z.number().int().min(500),
    keyRobustnessPerCell: z.number().int().min(1_000),
    basis: z.string().min(1),
  }).strict(),
  controlExperiment: z.object({
    artifactPolicyBaselineKappaBps: z.literal(7_000),
    mechanismExperimentKappaBps: z.literal(1_500),
    selectionRule: z.string().min(1),
    scope: z.string().min(1),
  }).strict(),
  detection: z.object({
    primaryMetricId: z.literal('RegulatorDetectionLag'),
    anchor: z.literal('paired_valuation_haircut_increase'),
    anchorComparator: z.literal('gt'),
    anchorValueBps: z.literal(0),
    clock: z.string().min(1),
    sensitivityMetricId: z.literal('RegulatorWarningThresholdLag'),
    sensitivityThresholdBps: bps,
    reportSensitivityCensoring: z.literal(true),
  }).strict(),
  shockTypeRobustnessAnchors: z.tuple([
    z.object({
      shockType: z.literal('valuation'),
      metric: z.literal('valuationHaircutBps'),
      pairedComparator: z.literal('gt'),
    }).strict(),
    z.object({
      shockType: z.literal('liquidity'),
      metric: z.literal('liquidityShortfallBps'),
      pairedComparator: z.literal('gt'),
    }).strict(),
    z.object({
      shockType: z.literal('redemption'),
      metric: z.literal('redemptionPressureBps'),
      pairedComparator: z.literal('gt'),
    }).strict(),
  ]),
  missingness: z.object({
    detection: z.string().min(1),
    settlement: z.string().min(1),
    failedRun: z.string().min(1),
  }).strict(),
  inference: z.object({
    confidenceLevelBps: bps,
    pairedContrasts: z.literal(true),
    intervalMethod: z.string().min(1),
    multipleComparisonMethod: z.string().min(1),
    effectReporting: z.string().min(1),
  }).strict(),
  hypotheses: z.array(z.object({
    id: hypothesisId,
    expectedDirection: z.string().min(1),
    primaryMetricIds: z.array(z.string().min(1)).min(1),
    contrastIds: z.array(z.string().min(1)).min(1),
    usedAsModelGate: z.literal(false),
  }).strict()).length(7),
  exclusionRules: z.array(z.string().min(1)).min(1),
  supplementaryStabilityWeightSchemes: z.array(z.object({
    id: z.string().min(1),
    weightBps: z.tuple([bps, bps, bps, bps]),
  }).strict()).min(1),
  plannedOutputs: z.array(z.string().min(1)).min(1),
}).strict().superRefine((plan, context) => {
  const hypothesisIds = plan.hypotheses.map(({ id }) => id);
  if (new Set(hypothesisIds).size !== hypothesisIds.length) {
    context.addIssue({ code: 'custom', message: 'DUPLICATE_HYPOTHESIS_ID' });
  }
  if (hypothesisId.options.some((id) => !hypothesisIds.includes(id))) {
    context.addIssue({ code: 'custom', message: 'MISSING_HYPOTHESIS_ID' });
  }
  for (const scheme of plan.supplementaryStabilityWeightSchemes) {
    if (scheme.weightBps.reduce((sum, value) => sum + value, 0) !== 10_000) {
      context.addIssue({ code: 'custom', message: 'STABILITY_WEIGHTS_MUST_SUM_10000' });
    }
  }
});

const FORBIDDEN_OUTCOME_KEYS = new Set([
  'actual',
  'actuals',
  'estimate',
  'estimates',
  'observed',
  'observedValue',
  'pValue',
  'result',
  'results',
  'verdict',
  'verdicts',
]);

export function assertNoFormalOutcomeFields(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoFormalOutcomeFields(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_OUTCOME_KEYS.has(key)) throw new Error(`PREREG_OUTCOME_FIELD:${path}.${key}`);
    assertNoFormalOutcomeFields(entry, `${path}.${key}`);
  }
}

export type FormalAnalysisPlan = z.infer<typeof analysisPlanSchema>;

export function parseFormalAnalysisPlan(input: unknown): FormalAnalysisPlan {
  assertNoFormalOutcomeFields(input);
  return analysisPlanSchema.parse(input);
}
