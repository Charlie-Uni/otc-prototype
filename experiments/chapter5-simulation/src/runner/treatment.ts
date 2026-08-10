import {
  TRANSPARENCY_REGIME_IDS,
  getTransparencyRegime,
  type TransparencyRegimeId,
} from '../artifact/risk/regimes';
import { parseSimulationConfig, type SimulationConfig } from '../core/config';
import { shockMagnitudeBps, type ShockScenario } from '../shocks/scenario';
import type {
  SimulationMechanisms,
  SimulationRunInput,
  SimulationTreatment,
} from './types';

const PROTECTED_PAIR_PATHS = [
  'config.network.networkSeed',
  'config.shock.seed',
  'config.oracle.seed',
  'config.observation.seed',
  'config.behavior.seed',
  'config.control.seed',
] as const;

function requireIdentifier(value: string, field: string): void {
  if (!value.trim()) throw new Error(`INVALID_${field}`);
}

function cloneRegime(regimeId: TransparencyRegimeId) {
  return structuredClone(getTransparencyRegime(regimeId));
}

export const DEFAULT_SIMULATION_MECHANISMS: SimulationMechanisms = {
  publicRiskDisclosureEnabled: true,
};

export function createSimulationTreatment(
  treatmentId: string,
  config: SimulationConfig,
  regimeId: TransparencyRegimeId,
  mechanisms: SimulationMechanisms = DEFAULT_SIMULATION_MECHANISMS,
): SimulationTreatment {
  requireIdentifier(treatmentId, 'TREATMENT_ID');
  const treatment = {
    treatmentId,
    config: parseSimulationConfig(structuredClone(config)),
    regime: cloneRegime(regimeId),
    mechanisms: structuredClone(mechanisms),
  };
  validateSimulationTreatment(treatment);
  return treatment;
}

export function validateSimulationTreatment(treatment: SimulationTreatment): void {
  requireIdentifier(treatment.treatmentId, 'TREATMENT_ID');
  parseSimulationConfig(treatment.config);
  const { regime } = treatment;
  if (!TRANSPARENCY_REGIME_IDS.includes(regime.id)) throw new Error('INVALID_REGIME_ID');
  requireIdentifier(regime.label, 'REGIME_LABEL');
  for (const [field, value] of [
    ['REGIME_FREQUENCY_SEC', regime.frequencySec],
    ['REGIME_DELAY_SEC', regime.delaySec],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
  }
  if (!['public', 'role_based', 'tiered'].includes(regime.visibility)) {
    throw new Error('INVALID_REGIME_VISIBILITY');
  }
  if (!['aggregate', 'detailed', 'tiered'].includes(regime.granularity)) {
    throw new Error('INVALID_REGIME_GRANULARITY');
  }
  if (!['public', 'private', 'delayed', 'tiered'].includes(regime.controlDisclosure)) {
    throw new Error('INVALID_REGIME_CONTROL_DISCLOSURE');
  }
  if (typeof treatment.mechanisms.publicRiskDisclosureEnabled !== 'boolean') {
    throw new Error('INVALID_PUBLIC_RISK_DISCLOSURE_MECHANISM');
  }
}

function leafDifferences(left: unknown, right: unknown, path: string): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const differences: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      differences.push(...leafDifferences(left[index], right[index], `${path}[${index}]`));
    }
    return differences;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
    return keys.flatMap((key) => leafDifferences(
      leftRecord[key],
      rightRecord[key],
      path ? `${path}.${key}` : key,
    ));
  }
  return [path];
}

function pathAllowed(path: string, allowedPaths: readonly string[]): boolean {
  return allowedPaths.some((allowed) => path === allowed
    || path.startsWith(`${allowed}.`)
    || path.startsWith(`${allowed}[`));
}

export function assertPairedTreatments(
  baseline: SimulationTreatment,
  comparison: SimulationTreatment,
  allowedDifferencePaths: readonly string[],
): void {
  validateSimulationTreatment(baseline);
  validateSimulationTreatment(comparison);
  for (const path of PROTECTED_PAIR_PATHS) {
    const relative = path.replace('config.', '').split('.');
    const read = (treatment: SimulationTreatment): unknown => relative.reduce<unknown>(
      (value, key) => (value as Record<string, unknown>)[key],
      treatment.config,
    );
    if (!Object.is(read(baseline), read(comparison))) {
      throw new Error(`PAIRED_RANDOMNESS_MISMATCH:${path}`);
    }
  }
  const differences = leafDifferences(
    { config: baseline.config, regime: baseline.regime, mechanisms: baseline.mechanisms },
    { config: comparison.config, regime: comparison.regime, mechanisms: comparison.mechanisms },
    '',
  );
  const unexpected = differences.filter((path) => !pathAllowed(path, allowedDifferencePaths));
  if (unexpected.length > 0) {
    throw new Error(`UNAPPROVED_TREATMENT_DIFFERENCE:${unexpected.join(',')}`);
  }
}

export function sameValuationShockScenario(
  left: ShockScenario,
  right: ShockScenario,
): boolean {
  return left.shockType === 'valuation'
    && right.shockType === 'valuation'
    && sameShockScenario(left, right);
}

export function sameShockScenario(left: ShockScenario, right: ShockScenario): boolean {
  return left.scenarioId === right.scenarioId
    && left.shockType === right.shockType
    && left.replicateId === right.replicateId
    && left.targetFundId === right.targetFundId
    && left.shockAt === right.shockAt
    && left.cycleOffsetSec === right.cycleOffsetSec
    && shockMagnitudeBps(left) === shockMagnitudeBps(right);
}

export function assertPairedRunInputs(
  baseline: SimulationRunInput,
  comparison: SimulationRunInput,
  allowedDifferencePaths: readonly string[],
): void {
  if (!sameShockScenario(baseline.scenario, comparison.scenario)) {
    throw new Error('PAIRED_SCENARIO_MISMATCH');
  }
  if ((baseline.horizonDays ?? null) !== (comparison.horizonDays ?? null)) {
    throw new Error('PAIRED_HORIZON_MISMATCH');
  }
  if ((baseline.shockEnabled ?? true) !== (comparison.shockEnabled ?? true)) {
    throw new Error('PAIRED_SHOCK_ENABLEMENT_MISMATCH');
  }
  assertPairedTreatments(
    baseline.treatment,
    comparison.treatment,
    allowedDifferencePaths,
  );
}
