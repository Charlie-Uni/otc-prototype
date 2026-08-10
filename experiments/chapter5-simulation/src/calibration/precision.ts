import { TRANSPARENCY_REGIME_IDS } from '../artifact/risk/regimes';
import type { SimulationConfig } from '../core/config';
import { regulatorDetectionLagAtThreshold } from './detection-threshold';
import { recommendReplicates, summarizeSample } from './statistics';
import type {
  CalibrationObservation,
  PrecisionRecommendation,
  PilotCalibrationConfig,
  PilotCalibrationReport,
} from './types';

type ComparedRegimeId = Exclude<CalibrationObservation['regimeId'], 'NO_SHOCK' | 'R0'>;

const COMPARED_REGIME_IDS = ['R1', 'R2', 'R3', 'R4'] as const satisfies readonly ComparedRegimeId[];

export function summariesByRegime(
  observations: readonly CalibrationObservation[],
  zScore: number,
  detectionThresholdBps: number | null,
): PilotCalibrationReport['validation']['summaries'] {
  return Object.fromEntries([
    'NO_SHOCK',
    ...TRANSPARENCY_REGIME_IDS,
  ].map((regimeId) => {
    const rows = observations.filter((value) => value.regimeId === regimeId);
    const detectionValues = detectionThresholdBps === null
      ? []
      : rows.flatMap((observation) => {
        const value = regulatorDetectionLagAtThreshold(observation, detectionThresholdBps);
        return value === null ? [] : [value];
      });
    return [regimeId, {
      acceptedRequestRateBps: summarizeSample(
        rows.map(({ acceptedRequestRateBps }) => acceptedRequestRateBps),
        zScore,
      ),
      lossMagnitudeBps: summarizeSample(
        rows.map(({ lossMagnitudeBps }) => lossMagnitudeBps),
        zScore,
      ),
      regulatorDetectionLagSec: detectionValues.length === 0
        ? null
        : summarizeSample(detectionValues, zScore),
    }];
  }));
}

function pairedValues(
  observations: readonly CalibrationObservation[],
  regimeId: ComparedRegimeId,
  read: (value: CalibrationObservation) => number | null,
): number[] {
  const bySlot = new Map(observations.map((value) => [
    `${value.replicateId}:${value.regimeId}`,
    value,
  ]));
  return [...new Set(observations.map(({ replicateId }) => replicateId))].flatMap((replicateId) => {
    const r0 = bySlot.get(`${replicateId}:R0`);
    const treatment = bySlot.get(`${replicateId}:${regimeId}`);
    if (!r0 || !treatment) throw new Error('INCOMPLETE_CALIBRATION_PAIR');
    const r0Value = read(r0);
    const treatmentValue = read(treatment);
    return r0Value === null || treatmentValue === null ? [] : [treatmentValue - r0Value];
  });
}

function pairedSamplesByRegime(
  observations: readonly CalibrationObservation[],
  read: (value: CalibrationObservation) => number | null,
): Record<ComparedRegimeId, number[]> {
  return Object.fromEntries(COMPARED_REGIME_IDS.map((regimeId) => [
    regimeId,
    pairedValues(observations, regimeId, read),
  ])) as Record<ComparedRegimeId, number[]>;
}

function precisionForMetric(
  metricId: PrecisionRecommendation['metricId'],
  observations: readonly CalibrationObservation[],
  read: (value: CalibrationObservation) => number | null,
  targetHalfWidth: number,
  thesisMinimumReplicates: number,
  zScore: number,
): PrecisionRecommendation {
  const samples = pairedSamplesByRegime(observations, read);
  const pilotPairsByRegime = Object.fromEntries([
    ['R0', observations.filter((observation) => (
      observation.regimeId === 'R0' && read(observation) !== null
    )).length],
    ...COMPARED_REGIME_IDS.map((regimeId) => [regimeId, samples[regimeId].length]),
  ]) as PrecisionRecommendation['pilotPairsByRegime'];
  if (COMPARED_REGIME_IDS.some((regimeId) => samples[regimeId].length < 2)) {
    return {
      metricId,
      pilotPairsByRegime,
      targetHalfWidth,
      thesisMinimumReplicates,
      status: 'unavailable',
      observedStandardDeviation: null,
      impliedReplicates: null,
      recommendedReplicates: null,
    };
  }
  const observedStandardDeviation = Math.max(...COMPARED_REGIME_IDS.map((regimeId) => (
    summarizeSample(samples[regimeId], zScore).standardDeviation
  )));
  return {
    ...recommendReplicates(
      metricId,
      observedStandardDeviation,
      targetHalfWidth,
      thesisMinimumReplicates,
      zScore,
    ),
    pilotPairsByRegime,
    status: 'estimated',
  };
}

export function precisionRecommendations(
  observations: readonly CalibrationObservation[],
  baseline: SimulationConfig,
  calibration: PilotCalibrationConfig,
  detectionThresholdBps: number | null,
): PilotCalibrationReport['validation']['precisionRecommendations'] {
  const { zScore, targetHalfWidth } = calibration.precisionPlanning;
  const minimum = baseline.monteCarlo.formalMinimumReplicatesPerCell;
  return [
    precisionForMetric(
      'acceptedRequestRateBps',
      observations,
      ({ acceptedRequestRateBps }) => acceptedRequestRateBps,
      targetHalfWidth.acceptedRequestRateBps,
      minimum,
      zScore,
    ),
    precisionForMetric(
      'lossMagnitudeBps',
      observations,
      ({ lossMagnitudeBps }) => lossMagnitudeBps,
      targetHalfWidth.lossMagnitudeBps,
      minimum,
      zScore,
    ),
    precisionForMetric(
      'regulatorDetectionLagSec',
      observations,
      (observation) => detectionThresholdBps === null
        ? null
        : regulatorDetectionLagAtThreshold(observation, detectionThresholdBps),
      targetHalfWidth.regulatorDetectionLagSec,
      minimum,
      zScore,
    ),
  ];
}
