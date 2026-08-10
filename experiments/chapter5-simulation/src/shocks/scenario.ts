import type { SimulationConfig } from '../core/config';
import { deterministicShuffle, randomIntegerBelow, type RandomDrawKey } from '../core/rng';
import type { NetworkModel } from '../network/types';

export type ValuationShockScenario = {
  scenarioId: string;
  shockType: 'valuation';
  replicateId: number;
  targetFundId: string;
  shockAt: number;
  cycleOffsetSec: number;
  targetSelectionFundCount?: number;
  navDropBps: number;
};

export type LiquidityShockScenario = {
  scenarioId: string;
  shockType: 'liquidity';
  replicateId: number;
  targetFundId: string;
  shockAt: number;
  cycleOffsetSec: number;
  targetSelectionFundCount?: number;
  liquidityImpairmentBps: number;
};

export type RedemptionShockScenario = {
  scenarioId: string;
  shockType: 'redemption';
  replicateId: number;
  targetFundId: string;
  shockAt: number;
  cycleOffsetSec: number;
  targetSelectionFundCount?: number;
  redemptionPressureBps: number;
};

export type ShockScenario =
  | ValuationShockScenario
  | LiquidityShockScenario
  | RedemptionShockScenario;

export type ShockType = ShockScenario['shockType'];

function requireReplicateId(replicateId: number): void {
  if (!Number.isSafeInteger(replicateId) || replicateId < 0) {
    throw new Error('INVALID_SHOCK_REPLICATE_ID');
  }
}

function scenarioKey(
  config: SimulationConfig,
  replicateId: number,
  entityId: string,
  drawPurpose: string,
): RandomDrawKey {
  return {
    masterSeed: BigInt(config.shock.seed),
    replicateId,
    entityId,
    moduleId: 'shock-scenario',
    tick: 0,
    drawPurpose,
  };
}

function targetFundId(
  config: SimulationConfig,
  network: NetworkModel,
  replicateId: number,
  targetSelectionFundCount: number,
): string {
  if (
    !Number.isSafeInteger(targetSelectionFundCount)
    || targetSelectionFundCount <= 0
    || targetSelectionFundCount > network.funds.length
  ) throw new Error('INVALID_SHOCK_TARGET_UNIVERSE_SIZE');
  const candidates = network.funds.slice(0, targetSelectionFundCount);
  const block = Math.floor(replicateId / candidates.length);
  const position = replicateId % candidates.length;
  const blockOrder = deterministicShuffle(
    candidates.map(({ id }) => id),
    scenarioKey(config, block, `target-block-${block}`, 'balanced-fund-order'),
  );
  return blockOrder[position]!;
}

function scenarioCoordinates(
  config: SimulationConfig,
  network: NetworkModel,
  replicateId: number,
  targetSelectionFundCount: number,
): { cycleOffsetSec: number; shockAt: number; targetFundId: string } {
  requireReplicateId(replicateId);
  const cycleOffsetSec = randomIntegerBelow(
    scenarioKey(config, replicateId, 'r0-cycle', 'shock-second-offset'),
    config.shock.r0CycleSec,
  );
  return {
    cycleOffsetSec,
    shockAt: config.shock.cycleStartAt + cycleOffsetSec,
    targetFundId: targetFundId(config, network, replicateId, targetSelectionFundCount),
  };
}

function requireShockMagnitude(magnitudeBps: number): void {
  if (!Number.isInteger(magnitudeBps) || magnitudeBps <= 0 || magnitudeBps >= 10_000) {
    throw new Error('INVALID_SHOCK_MAGNITUDE_BPS');
  }
}

export function shockMagnitudeBps(scenario: ShockScenario): number {
  if (scenario.shockType === 'valuation') return scenario.navDropBps;
  if (scenario.shockType === 'liquidity') return scenario.liquidityImpairmentBps;
  return scenario.redemptionPressureBps;
}

export function createShockScenario(
  config: SimulationConfig,
  network: NetworkModel,
  replicateId: number,
  shockType: ShockType,
  magnitudeBps: number,
  targetSelectionFundCount = network.funds.length,
): ShockScenario {
  requireShockMagnitude(magnitudeBps);
  const coordinates = scenarioCoordinates(
    config,
    network,
    replicateId,
    targetSelectionFundCount,
  );
  const common = {
    scenarioId: `${shockType}-r${String(replicateId).padStart(6, '0')}-m${magnitudeBps}`,
    shockType,
    replicateId,
    ...coordinates,
    ...(targetSelectionFundCount === network.funds.length
      ? {}
      : { targetSelectionFundCount }),
  };
  if (shockType === 'valuation') return { ...common, shockType, navDropBps: magnitudeBps };
  if (shockType === 'liquidity') {
    return { ...common, shockType, liquidityImpairmentBps: magnitudeBps };
  }
  return { ...common, shockType, redemptionPressureBps: magnitudeBps };
}

export function createValuationShockScenarios(
  config: SimulationConfig,
  network: NetworkModel,
  replicateId: number,
): ValuationShockScenario[] {
  return config.shock.navDropBps.map((navDropBps) => createShockScenario(
    config,
    network,
    replicateId,
    'valuation',
    navDropBps,
  ) as ValuationShockScenario);
}
