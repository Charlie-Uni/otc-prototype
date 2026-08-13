import type {
  ControlDisclosureMode,
  GranularityMode,
  TransparencyRegime,
} from '../artifact/risk/regimes';
import {
  RISK_WEIGHT_SCHEMES,
  parseSimulationConfig,
  type SimulationConfig,
} from '../core/config';
import { generateNetworkModel } from '../network/generator';
import type { FormalCell, FormalExperimentMatrix } from '../preregistration/matrix';
import { FORMAL_TREATMENT_PATHS } from '../preregistration/design';
import {
  createShockScenario,
  shockMagnitudeBps,
  type ShockScenario,
  type ShockType,
} from '../shocks/scenario';
import {
  assertPairedTreatments,
  createSimulationTreatment,
  validateSimulationTreatment,
} from './treatment';
import type { SimulationRunInput, SimulationTreatment } from './types';

const BEHAVIOR_COEFFICIENT_PATHS = [
  'config.behavior.coefficients.interceptLogOdds',
  'config.behavior.coefficients.perceivedRisk',
  'config.behavior.coefficients.publicness',
  'config.behavior.coefficients.signalSynchronicity',
  'config.behavior.coefficients.expectedOthersRedeem',
  'config.behavior.coefficients.firstMoverAdvantage',
] as const;

const RUNTIME_TREATMENT_PATHS = new Set<string>([
  ...FORMAL_TREATMENT_PATHS,
  ...BEHAVIOR_COEFFICIENT_PATHS,
]);

export type CompiledFormalCell = {
  cell: FormalCell;
  treatment: SimulationTreatment;
  shockType: ShockType;
  shockMagnitudeBps: number;
  appliedTreatmentPaths: string[];
};

export type CompiledFormalMatrix = {
  schemaVersion: 1;
  designDigestSha256: string;
  cellCount: number;
  cells: CompiledFormalCell[];
};

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`FORMAL_TREATMENT_EXPECTED_NUMBER:${path}`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`FORMAL_TREATMENT_EXPECTED_BOOLEAN:${path}`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`FORMAL_TREATMENT_EXPECTED_STRING:${path}`);
  }
  return value;
}

function requireNumberArray(value: unknown, length: number, path: string): number[] {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => (
    typeof item !== 'number' || !Number.isFinite(item)
  ))) throw new Error(`FORMAL_TREATMENT_EXPECTED_NUMBER_ARRAY:${path}`);
  return [...value];
}

function requireNumberRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`FORMAL_TREATMENT_EXPECTED_NUMBER_RECORD:${path}`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== [...keys].sort().join(',')
    || keys.some((key) => typeof record[key] !== 'number' || !Number.isFinite(record[key]))
  ) throw new Error(`FORMAL_TREATMENT_EXPECTED_NUMBER_RECORD:${path}`);
  return Object.fromEntries(keys.map((key) => [key, record[key] as number]));
}

function setBehaviorCoefficient(
  config: SimulationConfig,
  path: string,
  value: unknown,
): void {
  const field = path.split('.').at(-1)! as keyof SimulationConfig['behavior']['coefficients'];
  config.behavior.coefficients[field] = requireNumber(value, path);
}

function applyTreatmentChange(
  config: SimulationConfig,
  regime: TransparencyRegime,
  treatment: SimulationTreatment,
  path: string,
  value: unknown,
): { appliedPaths: string[]; shockType?: ShockType } {
  if (!RUNTIME_TREATMENT_PATHS.has(path)) throw new Error(`UNSUPPORTED_FORMAL_TREATMENT_PATH:${path}`);
  if (path.startsWith('config.behavior.coefficients.')) {
    setBehaviorCoefficient(config, path, value);
    return { appliedPaths: [path] };
  }
  switch (path) {
    case 'mechanisms.publicRiskDisclosureEnabled':
      treatment.mechanisms.publicRiskDisclosureEnabled = requireBoolean(value, path);
      return { appliedPaths: [path] };
    case 'regime.delaySec':
      regime.delaySec = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'regime.granularity': {
      const granularity = requireString(value, path);
      if (!['aggregate', 'detailed', 'tiered'].includes(granularity)) {
        throw new Error(`INVALID_FORMAL_GRANULARITY:${granularity}`);
      }
      regime.granularity = granularity as GranularityMode;
      return { appliedPaths: [path] };
    }
    case 'regime.controlDisclosure': {
      const disclosure = requireString(value, path);
      if (!['public', 'private', 'delayed', 'tiered'].includes(disclosure)) {
        throw new Error(`INVALID_FORMAL_CONTROL_DISCLOSURE:${disclosure}`);
      }
      regime.controlDisclosure = disclosure as ControlDisclosureMode;
      return { appliedPaths: [path] };
    }
    case 'config.propagation.channels.investorOverlap':
      config.propagation.channels.investorOverlap = requireBoolean(value, path);
      return { appliedPaths: [path] };
    case 'config.propagation.channels.sharedIlliquidAssets':
      config.propagation.channels.sharedIlliquidAssets = requireBoolean(value, path);
      return { appliedPaths: [path] };
    case 'config.propagation.channels.signalAnalogy':
      config.propagation.channels.signalAnalogy = requireBoolean(value, path);
      return { appliedPaths: [path] };
    case 'design.networkScale': {
      const scale = requireNumberRecord(
        value,
        ['fundCount', 'investorCount', 'assetClassCount'],
        path,
      );
      config.network.fundCount = scale.fundCount!;
      config.network.investorCount = scale.investorCount!;
      config.network.assetClassCount = scale.assetClassCount!;
      return { appliedPaths: [
        'config.network.fundCount',
        'config.network.investorCount',
        'config.network.assetClassCount',
      ] };
    }
    case 'config.network.sharedInvestorCoreBps':
      config.network.sharedInvestorCoreBps = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.heterogeneity.liquidAssetShareBpsByLiquidityMismatchTier': {
      const tiers = requireNumberRecord(value, ['low', 'medium', 'high'], path);
      config.heterogeneity.liquidAssetShareBpsByLiquidityMismatchTier = {
        low: tiers.low!, medium: tiers.medium!, high: tiers.high!,
      };
      return { appliedPaths: [path] };
    }
    case 'config.heterogeneity.navUpdateIntervalDaysByStalePricingTier': {
      const tiers = requireNumberRecord(value, ['low', 'medium', 'high'], path);
      config.heterogeneity.navUpdateIntervalDaysByStalePricingTier = {
        low: tiers.low!, medium: tiers.medium!, high: tiers.high!,
      };
      return { appliedPaths: [path] };
    }
    case 'config.liquidity.baselineSettlementDelayDays':
      config.liquidity.baselineSettlementDelayDays = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.thresholds.baselineKappaBps': {
      const kappa = requireNumber(value, path);
      config.thresholds.baselineKappaBps = kappa;
      if (!config.thresholds.kappaScanBps.includes(kappa)) {
        config.thresholds.kappaScanBps = [...config.thresholds.kappaScanBps, kappa]
          .sort((left, right) => left - right);
      }
      return { appliedPaths: [path] };
    }
    case 'config.control.baselinePhiBps':
      config.control.baselinePhiBps = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.control.releaseConsecutiveTicks':
      config.control.releaseConsecutiveTicks = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.control.releaseDelayTicks':
      config.control.releaseDelayTicks = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'design.riskWeightScheme': {
      const schemeId = requireString(value, path);
      if (!(schemeId in RISK_WEIGHT_SCHEMES)) {
        throw new Error(`UNKNOWN_FORMAL_RISK_WEIGHT_SCHEME:${schemeId}`);
      }
      const typedId = schemeId as keyof typeof RISK_WEIGHT_SCHEMES;
      config.risk.weightSchemeId = typedId;
      config.risk.weightBps = [...RISK_WEIGHT_SCHEMES[typedId]];
      return { appliedPaths: ['config.risk.weightSchemeId', 'config.risk.weightBps'] };
    }
    case 'config.risk.maxStaleAgeDays':
      config.risk.maxStaleAgeDays = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.liquidity.priceImpactGamma':
      config.liquidity.priceImpactGamma = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.oracle.baselineLatencySec':
      config.oracle.baselineLatencySec = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.oracle.baselineExecutionFailureBps':
      config.oracle.baselineExecutionFailureBps = requireNumber(value, path);
      return { appliedPaths: [path] };
    case 'config.propagation.proximityWeightsBps': {
      const weights = requireNumberArray(value, 4, path);
      config.propagation.proximityWeightsBps = [weights[0]!, weights[1]!, weights[2]!, weights[3]!];
      return { appliedPaths: [path] };
    }
    case 'design.shockType': {
      const shockType = requireString(value, path);
      if (!['valuation', 'liquidity', 'redemption'].includes(shockType)) {
        throw new Error(`INVALID_FORMAL_SHOCK_TYPE:${shockType}`);
      }
      return { appliedPaths: [], shockType: shockType as ShockType };
    }
  }
  throw new Error(`UNSUPPORTED_FORMAL_TREATMENT_PATH:${path}`);
}

export function compileFormalCell(
  cell: FormalCell,
  baselineConfig: SimulationConfig,
): CompiledFormalCell {
  if (!cell.cellId.trim() || !cell.pairId.trim()) throw new Error('INVALID_FORMAL_CELL_ID');
  if (!Number.isSafeInteger(cell.replicates) || cell.replicates < 500) {
    throw new Error(`INVALID_FORMAL_REPLICATE_COUNT:${cell.cellId}`);
  }
  const treatment = createSimulationTreatment(cell.cellId, baselineConfig, cell.regimeId);
  const config = structuredClone(treatment.config);
  const regime = structuredClone(treatment.regime);
  treatment.config = config;
  treatment.regime = regime;
  const seenPaths = new Set<string>();
  const appliedTreatmentPaths: string[] = [];
  let declaredShockType: ShockType | undefined;
  for (const change of cell.treatmentChanges) {
    if (seenPaths.has(change.path)) throw new Error(`DUPLICATE_FORMAL_TREATMENT_PATH:${change.path}`);
    seenPaths.add(change.path);
    const applied = applyTreatmentChange(config, regime, treatment, change.path, change.value);
    appliedTreatmentPaths.push(...applied.appliedPaths);
    if (applied.shockType !== undefined) declaredShockType = applied.shockType;
  }
  treatment.config = parseSimulationConfig(config);
  validateSimulationTreatment(treatment);
  if (declaredShockType !== undefined && declaredShockType !== cell.shockType) {
    throw new Error(`FORMAL_SHOCK_TYPE_MISMATCH:${cell.cellId}`);
  }
  return {
    cell: structuredClone(cell),
    treatment,
    shockType: cell.shockType,
    shockMagnitudeBps: cell.shockMagnitudeBps,
    appliedTreatmentPaths: [...new Set(appliedTreatmentPaths)].sort(),
  };
}

export function compileFormalRunInput(
  compiled: CompiledFormalCell,
  baselineConfig: SimulationConfig,
  replicateId: number,
): SimulationRunInput {
  if (!Number.isSafeInteger(replicateId) || replicateId < 0 || replicateId >= compiled.cell.replicates) {
    throw new Error(`FORMAL_REPLICATE_OUT_OF_RANGE:${compiled.cell.cellId}`);
  }
  const network = generateNetworkModel(compiled.treatment.config);
  const scenario = createShockScenario(
    compiled.treatment.config,
    network,
    replicateId,
    compiled.shockType,
    compiled.shockMagnitudeBps,
    baselineConfig.network.fundCount,
  );
  return {
    treatment: compiled.treatment,
    scenario,
    horizonDays: compiled.treatment.config.time.horizonDays,
    shockEnabled: compiled.cell.shockEnabled,
  };
}

function differingDeclaredPaths(left: FormalCell, right: FormalCell): string[] {
  const leftValues = new Map(left.treatmentChanges.map(({ path, value }) => [
    path, JSON.stringify(value),
  ]));
  const rightValues = new Map(right.treatmentChanges.map(({ path, value }) => [
    path, JSON.stringify(value),
  ]));
  return [...new Set([...leftValues.keys(), ...rightValues.keys()])]
    .filter((path) => leftValues.get(path) !== rightValues.get(path));
}

function assertScenarioCoordinatesPaired(left: ShockScenario, right: ShockScenario): void {
  if (
    left.replicateId !== right.replicateId
    || left.targetFundId !== right.targetFundId
    || left.shockAt !== right.shockAt
    || left.cycleOffsetSec !== right.cycleOffsetSec
    || shockMagnitudeBps(left) !== shockMagnitudeBps(right)
  ) throw new Error('FORMAL_PAIRED_SHOCK_COORDINATE_MISMATCH');
}

function validateCompiledPair(
  left: CompiledFormalCell,
  right: CompiledFormalCell,
  baselineConfig: SimulationConfig,
): void {
  if (
    left.cell.pairId !== right.cell.pairId
    || left.cell.family !== right.cell.family
    || left.cell.replicates !== right.cell.replicates
    || left.cell.regimeId !== right.cell.regimeId
    || left.cell.shockMagnitudeBps !== right.cell.shockMagnitudeBps
  ) throw new Error(`FORMAL_PAIR_METADATA_MISMATCH:${left.cell.pairId}`);
  const declaredDifferences = differingDeclaredPaths(left.cell, right.cell);
  const arms = new Set([left.cell.arm, right.cell.arm]);
  const expectedArms = left.cell.family === 'primary_policy'
    ? new Set(['shock', 'no_shock'])
    : new Set(['baseline', 'comparison']);
  if (
    arms.size !== expectedArms.size
    || [...arms].some((arm) => !expectedArms.has(arm))
  ) throw new Error(`INVALID_FORMAL_PAIR_ARMS:${left.cell.pairId}`);
  if (left.cell.family === 'primary_policy') {
    if (declaredDifferences.length !== 0 || left.cell.shockEnabled === right.cell.shockEnabled) {
      throw new Error(`INVALID_PRIMARY_POLICY_PAIR:${left.cell.pairId}`);
    }
  } else {
    if (!left.cell.shockEnabled || !right.cell.shockEnabled) {
      throw new Error(`FORMAL_TREATMENT_PAIR_REQUIRES_SHOCK:${left.cell.pairId}`);
    }
    if (
      (left.cell.family === 'ablation' || left.cell.family === 'robustness')
      && declaredDifferences.length !== 1
    ) throw new Error(`FORMAL_PAIR_NOT_ONE_DIMENSIONAL:${left.cell.pairId}`);
    if (left.cell.family === 'behavior_lhs' && declaredDifferences.length === 0) {
      throw new Error(`FORMAL_LHS_PAIR_HAS_NO_CHANGE:${left.cell.pairId}`);
    }
  }
  const allowedPaths = [...new Set([
    ...left.appliedTreatmentPaths,
    ...right.appliedTreatmentPaths,
  ])].filter((path) => {
    if (declaredDifferences.includes(path)) return true;
    if (declaredDifferences.includes('design.networkScale')) return path.startsWith('config.network.');
    if (declaredDifferences.includes('design.riskWeightScheme')) return path.startsWith('config.risk.');
    return declaredDifferences.some((declared) => path === declared || path.startsWith(`${declared}.`));
  });
  assertPairedTreatments(left.treatment, right.treatment, allowedPaths);
  const leftInput = compileFormalRunInput(left, baselineConfig, 0);
  const rightInput = compileFormalRunInput(right, baselineConfig, 0);
  assertScenarioCoordinatesPaired(leftInput.scenario, rightInput.scenario);
  if (declaredDifferences.includes('design.shockType')) {
    if (leftInput.scenario.shockType === rightInput.scenario.shockType) {
      throw new Error('FORMAL_SHOCK_TYPE_CONTRAST_MISSING');
    }
  } else if (leftInput.scenario.shockType !== rightInput.scenario.shockType) {
    throw new Error('UNDECLARED_FORMAL_SHOCK_TYPE_DIFFERENCE');
  }
}

export function compileFormalMatrix(
  matrix: FormalExperimentMatrix,
  baselineConfig: SimulationConfig,
): CompiledFormalMatrix {
  if (
    matrix.schemaVersion !== 1
    || matrix.cellCount !== 146
    || matrix.cellCount !== matrix.cells.length
    || !/^[0-9a-f]{64}$/.test(matrix.designDigestSha256)
  ) {
    throw new Error('INVALID_FORMAL_MATRIX_SHAPE');
  }
  const cellIds = matrix.cells.map(({ cellId }) => cellId);
  if (new Set(cellIds).size !== cellIds.length) throw new Error('DUPLICATE_FORMAL_CELL_ID');
  const cells = matrix.cells.map((cell) => compileFormalCell(cell, baselineConfig));
  const pairs = new Map<string, CompiledFormalCell[]>();
  for (const cell of cells) {
    const pair = pairs.get(cell.cell.pairId) ?? [];
    pair.push(cell);
    pairs.set(cell.cell.pairId, pair);
  }
  for (const [pairId, pair] of pairs) {
    if (pair.length !== 2) throw new Error(`INVALID_FORMAL_PAIR_SIZE:${pairId}`);
    validateCompiledPair(pair[0]!, pair[1]!, baselineConfig);
  }
  return {
    schemaVersion: 1,
    designDigestSha256: matrix.designDigestSha256,
    cellCount: cells.length,
    cells,
  };
}
