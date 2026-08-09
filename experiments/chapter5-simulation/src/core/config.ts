import { z } from 'zod';

const positiveInteger = z.number().int().positive();
const bps = z.number().int().min(0).max(10_000);

export const simulationConfigSchema = z.object({
  schemaVersion: z.literal(1),
  time: z.object({
    tickSec: z.literal(86_400),
    horizonDays: positiveInteger,
    primaryWindowDays: positiveInteger,
    robustnessWindowDays: z.array(positiveInteger).min(1),
  }).strict(),
  network: z.object({
    fundCount: positiveInteger,
    investorCount: positiveInteger,
    assetClassCount: positiveInteger,
  }).strict(),
  monteCarlo: z.object({
    pilotReplicatesPerCell: positiveInteger,
    formalMinimumReplicatesPerCell: positiveInteger,
    keyRobustnessReplicatesPerCell: positiveInteger,
  }).strict(),
  shock: z.object({
    baselineType: z.literal('valuation'),
    navDropBps: z.array(bps).min(1),
    r0CycleSec: z.literal(604_800),
    shockAtMode: z.literal('uniform_within_r0_cycle'),
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
});

export type SimulationConfig = z.infer<typeof simulationConfigSchema>;

export function parseSimulationConfig(input: unknown): SimulationConfig {
  return simulationConfigSchema.parse(input);
}
