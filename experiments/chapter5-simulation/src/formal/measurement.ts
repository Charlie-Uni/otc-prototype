import type { FormalAnalysisPlan } from '../preregistration/analysis-plan';
import type { FormalCell } from '../preregistration/matrix';
import { regulatorDetectionLagForThreshold, pairedValuationShockDetectionLagMetrics } from '../metrics/detection';
import { extractRunOutcomeMetrics } from '../metrics/outcomes';
import type {
  DetectionLagOutcome,
  RunOutcomeMetrics,
  ShockLinkedDetectionLagMetrics,
} from '../metrics/outcome-types';
import { semanticDigestSha256 } from '../runner/digest';
import type { CompiledFormalCell } from '../runner/formal-compiler';
import type { FormalReplicateResult } from '../runner/formal-executor';
import { assertFormalExecutionAuthorization } from '../runner/formal-provenance';
import type { ShockScenario } from '../shocks/scenario';

export type FormalMeasurementSpec = {
  windowDays: readonly number[];
  sensitivityThresholdBps: number;
};

export type FormalArmMeasurement = {
  schemaVersion: 1;
  cellId: string;
  pairId: string;
  family: FormalCell['family'];
  arm: FormalCell['arm'];
  replicateId: number;
  treatmentId: string;
  regimeId: string;
  shockEnabled: boolean;
  scenario: ShockScenario;
  configDigestSha256: string;
  treatmentDigestSha256: string;
  runDigestSha256: string;
  sensitivityThresholdBps: number;
  regulatorWarningThresholdLag: DetectionLagOutcome;
  outcomesByWindow: RunOutcomeMetrics[];
  semanticDigestSha256: string;
};

export type FormalPairObservation = {
  schemaVersion: 1;
  designDigestSha256: string;
  pairId: string;
  family: FormalCell['family'];
  replicateId: number;
  authorization: FormalReplicateResult['authorization'];
  arms: [FormalArmMeasurement, FormalArmMeasurement];
  primaryShockLinkedDetection: ShockLinkedDetectionLagMetrics | null;
  semanticDigestSha256: string;
};

function requireMeasurementSpec(spec: FormalMeasurementSpec): void {
  if (
    spec.windowDays.length === 0
    || spec.windowDays.some((days) => !Number.isSafeInteger(days) || days <= 0)
    || new Set(spec.windowDays).size !== spec.windowDays.length
    || !Number.isInteger(spec.sensitivityThresholdBps)
    || spec.sensitivityThresholdBps < 0
    || spec.sensitivityThresholdBps > 10_000
  ) throw new Error('INVALID_FORMAL_MEASUREMENT_SPEC');
}

export function measurementSpecFromAnalysisPlan(
  plan: FormalAnalysisPlan,
): FormalMeasurementSpec {
  const spec = {
    windowDays: [plan.primaryWindowDays, ...plan.robustnessWindowDays],
    sensitivityThresholdBps: plan.detection.sensitivityThresholdBps,
  };
  requireMeasurementSpec(spec);
  return spec;
}

function armOrder(arm: FormalCell['arm']): number {
  if (arm === 'shock' || arm === 'baseline') return 0;
  return 1;
}

export function createFormalArmMeasurement(
  execution: FormalReplicateResult,
  compiled: CompiledFormalCell,
  spec: FormalMeasurementSpec,
): FormalArmMeasurement {
  requireMeasurementSpec(spec);
  const { cell } = compiled;
  const expectedTreatmentDigest = semanticDigestSha256({
    config: compiled.treatment.config,
    regime: compiled.treatment.regime,
    mechanisms: compiled.treatment.mechanisms,
  });
  if (
    !/^[0-9a-f]{64}$/.test(execution.designDigestSha256)
    || execution.cellId !== cell.cellId
    || execution.pairId !== cell.pairId
    || execution.replicateId !== execution.result.scenario.replicateId
    || execution.replicateId < 0
    || execution.replicateId >= cell.replicates
    || execution.shockEnabled !== cell.shockEnabled
    || execution.result.treatmentId !== compiled.treatment.treatmentId
    || execution.result.regime.id !== compiled.treatment.regime.id
    || execution.result.configDigestSha256 !== semanticDigestSha256(compiled.treatment.config)
    || execution.result.treatmentDigestSha256 !== expectedTreatmentDigest
  ) throw new Error('FORMAL_MEASUREMENT_EXECUTION_SCOPE_MISMATCH');
  const outcomesByWindow = spec.windowDays.map((windowDays) => extractRunOutcomeMetrics(
    execution.result,
    compiled.treatment.config,
    windowDays,
  ));
  const withoutDigest = {
    schemaVersion: 1 as const,
    cellId: cell.cellId,
    pairId: cell.pairId,
    family: cell.family,
    arm: cell.arm,
    replicateId: execution.replicateId,
    treatmentId: execution.result.treatmentId,
    regimeId: execution.result.regime.id,
    shockEnabled: execution.result.shockEnabled,
    scenario: execution.result.scenario,
    configDigestSha256: execution.result.configDigestSha256,
    treatmentDigestSha256: execution.result.treatmentDigestSha256,
    runDigestSha256: execution.result.semanticDigestSha256,
    sensitivityThresholdBps: spec.sensitivityThresholdBps,
    regulatorWarningThresholdLag: regulatorDetectionLagForThreshold(
      execution.result,
      spec.sensitivityThresholdBps,
    ),
    outcomesByWindow,
  };
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}

export function createFormalPairObservation(
  leftExecution: FormalReplicateResult,
  rightExecution: FormalReplicateResult,
  leftCompiled: CompiledFormalCell,
  rightCompiled: CompiledFormalCell,
  spec: FormalMeasurementSpec,
): FormalPairObservation {
  const leftCell = leftCompiled.cell;
  const rightCell = rightCompiled.cell;
  if (
    leftCell.pairId !== rightCell.pairId
    || leftCell.family !== rightCell.family
    || leftExecution.designDigestSha256 !== rightExecution.designDigestSha256
    || leftExecution.replicateId !== rightExecution.replicateId
    || leftExecution.result.scenario.shockAt !== rightExecution.result.scenario.shockAt
    || leftExecution.result.scenario.targetFundId !== rightExecution.result.scenario.targetFundId
    || semanticDigestSha256(leftExecution.authorization)
      !== semanticDigestSha256(rightExecution.authorization)
  ) throw new Error('FORMAL_MEASUREMENT_PAIR_MISMATCH');
  const measured = [
    createFormalArmMeasurement(leftExecution, leftCompiled, spec),
    createFormalArmMeasurement(rightExecution, rightCompiled, spec),
  ].sort((left, right) => armOrder(left.arm) - armOrder(right.arm)) as [
    FormalArmMeasurement,
    FormalArmMeasurement,
  ];
  if (armOrder(measured[0].arm) === armOrder(measured[1].arm)) {
    throw new Error('FORMAL_MEASUREMENT_DUPLICATE_PAIR_ARM');
  }
  let primaryShockLinkedDetection: ShockLinkedDetectionLagMetrics | null = null;
  if (leftCell.family === 'primary_policy') {
    const shocked = leftExecution.result.shockEnabled ? leftExecution.result : rightExecution.result;
    const noShock = leftExecution.result.shockEnabled ? rightExecution.result : leftExecution.result;
    primaryShockLinkedDetection = pairedValuationShockDetectionLagMetrics(shocked, noShock);
  }
  const withoutDigest = {
    schemaVersion: 1 as const,
    designDigestSha256: leftExecution.designDigestSha256,
    pairId: leftCell.pairId,
    family: leftCell.family,
    replicateId: leftExecution.replicateId,
    authorization: leftExecution.authorization,
    arms: measured,
    primaryShockLinkedDetection,
  };
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}

export function assertFormalPairObservationDigest(observation: FormalPairObservation): void {
  assertFormalExecutionAuthorization(observation.authorization);
  const { semanticDigestSha256: recordedDigest, ...withoutDigest } = observation;
  if (semanticDigestSha256(withoutDigest) !== recordedDigest) {
    throw new Error('FORMAL_PAIR_OBSERVATION_DIGEST_MISMATCH');
  }
  for (const arm of observation.arms) {
    const { semanticDigestSha256: armDigest, ...armWithoutDigest } = arm;
    if (semanticDigestSha256(armWithoutDigest) !== armDigest) {
      throw new Error('FORMAL_ARM_MEASUREMENT_DIGEST_MISMATCH');
    }
  }
}
