import { z } from 'zod';

const bps = z.number().int().min(0).max(10_000);

export const controlThresholdCalibrationSchema = z.object({
  schemaVersion: z.literal(1),
  replicates: z.number().int().min(100),
  horizonDays: z.number().int().positive(),
  regimeId: z.literal('R1'),
  valuationShockBps: z.number().int().positive().max(9_999),
  candidateKappaBps: z.array(bps).min(2),
  targetShockedActivationRateBps: bps,
  selectionRule: z.literal(
    'minimum absolute distance from target shocked activation rate; ties select the higher kappa',
  ),
  noShockActivationUsedForSelection: z.literal(false),
}).strict().superRefine((config, context) => {
  if (new Set(config.candidateKappaBps).size !== config.candidateKappaBps.length) {
    context.addIssue({ code: 'custom', message: 'DUPLICATE_CONTROL_THRESHOLD_CANDIDATE' });
  }
  if (config.candidateKappaBps.some(
    (value, index, values) => index > 0 && value <= values[index - 1]!,
  )) {
    context.addIssue({ code: 'custom', message: 'CONTROL_THRESHOLD_CANDIDATES_NOT_ASCENDING' });
  }
});

export type ControlThresholdCalibrationConfig = z.infer<
  typeof controlThresholdCalibrationSchema
>;

export type ControlThresholdReachability = {
  kappaBps: number;
  shockedActivationCount: number;
  noShockActivationCount: number;
  shockedActivationRateBps: number;
  noShockActivationRateBps: number;
};

const controlThresholdReachabilitySchema = z.object({
  kappaBps: bps,
  shockedActivationCount: z.number().int().nonnegative(),
  noShockActivationCount: z.number().int().nonnegative(),
  shockedActivationRateBps: bps,
  noShockActivationRateBps: bps,
}).strict();

const controlThresholdEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  purpose: z.literal('non-gating control-path reachability calibration; not a formal finding'),
  formalFindingsAllowed: z.literal(false),
  baselineConfigDigestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  calibrationConfigDigestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  selectedKappaBps: bps,
  reachability: z.array(controlThresholdReachabilitySchema).min(2),
  semanticDigestSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export function parseControlThresholdCalibrationConfig(
  input: unknown,
): ControlThresholdCalibrationConfig {
  return controlThresholdCalibrationSchema.parse(input);
}

export function selectControlExperimentKappa(
  config: ControlThresholdCalibrationConfig,
  counts: ReadonlyMap<number, { shocked: number; noShock: number }>,
): { selectedKappaBps: number; reachability: ControlThresholdReachability[] } {
  const reachability = config.candidateKappaBps.map((kappaBps) => {
    const count = counts.get(kappaBps);
    if (!count) throw new Error(`MISSING_CONTROL_THRESHOLD_COUNT:${kappaBps}`);
    if ([count.shocked, count.noShock].some((value) => (
      !Number.isSafeInteger(value) || value < 0 || value > config.replicates
    ))) throw new Error(`INVALID_CONTROL_THRESHOLD_COUNT:${kappaBps}`);
    return {
      kappaBps,
      shockedActivationCount: count.shocked,
      noShockActivationCount: count.noShock,
      shockedActivationRateBps: Math.floor((count.shocked * 10_000) / config.replicates),
      noShockActivationRateBps: Math.floor((count.noShock * 10_000) / config.replicates),
    };
  });
  const selected = [...reachability].sort((left, right) => {
    const leftDistance = Math.abs(
      left.shockedActivationRateBps - config.targetShockedActivationRateBps,
    );
    const rightDistance = Math.abs(
      right.shockedActivationRateBps - config.targetShockedActivationRateBps,
    );
    return leftDistance - rightDistance || right.kappaBps - left.kappaBps;
  })[0]!;
  return { selectedKappaBps: selected.kappaBps, reachability };
}

export function parseControlThresholdEvidence(
  config: ControlThresholdCalibrationConfig,
  input: unknown,
) {
  const evidence = controlThresholdEvidenceSchema.parse(input);
  const counts = new Map(evidence.reachability.map((row) => [
    row.kappaBps,
    { shocked: row.shockedActivationCount, noShock: row.noShockActivationCount },
  ]));
  const recomputed = selectControlExperimentKappa(config, counts);
  if (evidence.selectedKappaBps !== recomputed.selectedKappaBps
    || JSON.stringify(evidence.reachability) !== JSON.stringify(recomputed.reachability)) {
    throw new Error('CONTROL_THRESHOLD_EVIDENCE_MISMATCH');
  }
  return evidence;
}
