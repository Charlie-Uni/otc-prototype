import { z } from 'zod';
import type { PilotCalibrationConfig } from './types';

const positiveSafeInteger = z.number().int().positive().safe();
const bps = z.number().int().min(0).max(10_000);

const schema = z.object({
  schemaVersion: z.literal(1),
  screeningReplicates: positiveSafeInteger,
  validationReplicates: positiveSafeInteger,
  windowDays: positiveSafeInteger,
  interceptLogOdds: z.array(z.number().finite().min(-20).max(20)).min(1),
  redemptionRequestFractionBps: z.array(z.number().int().min(1).max(10_000)).min(1),
  demandTransmissionBps: z.array(bps).min(1),
  baselineValuationShockBps: bps,
  technicalBounds: z.object({
    maximumNoShockAcceptedRequestRateBps: bps,
    maximumPeakRequestPressureBps: bps,
    minimumMeanRegimeLatentDemandRangeBps: bps,
  }).strict(),
  detectionThresholdCalibration: z.object({
    candidatesBps: z.array(bps).min(1),
    minimumShockDetectionRateBps: bps,
  }).strict(),
  precisionPlanning: z.object({
    zScore: z.number().finite().positive().max(5),
    targetHalfWidth: z.object({
      acceptedRequestRateBps: positiveSafeInteger,
      lossMagnitudeBps: positiveSafeInteger,
      regulatorDetectionLagSec: positiveSafeInteger,
    }).strict(),
  }).strict(),
}).strict().superRefine((value, context) => {
  for (const [values, message] of [
    [value.interceptLogOdds, 'DUPLICATE_CALIBRATION_INTERCEPT'],
    [value.redemptionRequestFractionBps, 'DUPLICATE_CALIBRATION_REQUEST_FRACTION'],
    [value.demandTransmissionBps, 'DUPLICATE_CALIBRATION_DEMAND_TRANSMISSION'],
    [
      value.detectionThresholdCalibration.candidatesBps,
      'DUPLICATE_CALIBRATION_DETECTION_THRESHOLD',
    ],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message });
    }
  }
  if (value.detectionThresholdCalibration.candidatesBps.some(
    (candidate, index, candidates) => index > 0 && candidate <= candidates[index - 1]!,
  )) {
    context.addIssue({ code: 'custom', message: 'DETECTION_THRESHOLDS_NOT_ASCENDING' });
  }
});

export function parsePilotCalibrationConfig(value: unknown): PilotCalibrationConfig {
  return schema.parse(value);
}
