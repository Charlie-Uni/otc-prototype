import { z } from 'zod';
import type { SimulationConfig } from '../core/config';
import { semanticDigestSha256 } from '../runner/digest';
import { observationsForCandidate } from './observations';
import type { CalibrationCandidate, CalibrationShard, PilotCalibrationConfig } from './types';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonNegativeSafeInteger = z.number().int().nonnegative().safe();
const positiveSafeInteger = z.number().int().positive().safe();

const candidateSchema = z.object({
  candidateId: z.string().min(1),
  interceptLogOdds: z.number().finite(),
  redemptionRequestFractionBps: z.number().int().min(1).max(10_000),
  demandTransmissionBps: z.number().int().min(0).max(10_000),
}).strict();

const observationSchema = z.object({
  candidateId: z.string().min(1),
  replicateId: nonNegativeSafeInteger,
  regimeId: z.enum(['NO_SHOCK', 'R0', 'R1', 'R2', 'R3', 'R4']),
  acceptedRequestRateBps: nonNegativeSafeInteger,
  latentRequestRateBps: nonNegativeSafeInteger,
  peakRequestPressureBps: z.number().int().min(0).max(10_000),
  lossMagnitudeBps: nonNegativeSafeInteger,
  regulatorDetectionLagSec: nonNegativeSafeInteger.nullable(),
  regulatorDetectionCensored: z.boolean(),
  regulatorDetectionLagSecByThresholdBps: z.record(
    z.string().regex(/^(0|[1-9]\d*)$/),
    nonNegativeSafeInteger.nullable(),
  ).refine((value) => Object.keys(value).length > 0, 'DETECTION_THRESHOLD_RESULTS_REQUIRED'),
  runDigestSha256: digest,
}).strict();

const shardSchema = z.object({
  schemaVersion: z.literal(1),
  baselineConfigDigestSha256: digest,
  calibrationConfigDigestSha256: digest,
  implementationDigestSha256: digest,
  candidate: candidateSchema,
  replicateStart: nonNegativeSafeInteger,
  replicateCount: positiveSafeInteger,
  windowDays: positiveSafeInteger,
  observations: z.array(observationSchema),
  semanticDigestSha256: digest,
}).strict();

export function createCalibrationShard(
  baseline: SimulationConfig,
  calibration: PilotCalibrationConfig,
  candidate: CalibrationCandidate,
  replicateStart: number,
  replicateCount: number,
  implementationDigestSha256: string,
): CalibrationShard {
  if (!/^[a-f0-9]{64}$/.test(implementationDigestSha256)) {
    throw new Error('INVALID_CALIBRATION_IMPLEMENTATION_DIGEST');
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    baselineConfigDigestSha256: semanticDigestSha256(baseline),
    calibrationConfigDigestSha256: semanticDigestSha256(calibration),
    implementationDigestSha256,
    candidate,
    replicateStart,
    replicateCount,
    windowDays: calibration.windowDays,
    observations: observationsForCandidate(
      baseline,
      candidate,
      replicateCount,
      calibration,
      replicateStart,
    ),
  };
  return {
    ...withoutDigest,
    semanticDigestSha256: semanticDigestSha256(withoutDigest),
  };
}

export function parseCalibrationShard(value: unknown): CalibrationShard {
  const shard = shardSchema.parse(value);
  const { semanticDigestSha256: recordedDigest, ...withoutDigest } = shard;
  if (semanticDigestSha256(withoutDigest) !== recordedDigest) {
    throw new Error('CALIBRATION_SHARD_DIGEST_MISMATCH');
  }
  const expectedObservationCount = shard.replicateCount * 6;
  if (shard.observations.length !== expectedObservationCount) {
    throw new Error('CALIBRATION_SHARD_OBSERVATION_COUNT_MISMATCH');
  }
  if (shard.observations.some(({ candidateId, replicateId }) => (
    candidateId !== shard.candidate.candidateId
    || replicateId < shard.replicateStart
    || replicateId >= shard.replicateStart + shard.replicateCount
  ))) throw new Error('CALIBRATION_SHARD_SCOPE_MISMATCH');
  return shard;
}
