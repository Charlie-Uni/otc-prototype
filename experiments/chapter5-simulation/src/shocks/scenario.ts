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
  navDropBps: number;
};

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

function targetFundId(config: SimulationConfig, network: NetworkModel, replicateId: number): string {
  if (network.funds.length === 0) throw new Error('EMPTY_SHOCK_TARGET_UNIVERSE');
  const block = Math.floor(replicateId / network.funds.length);
  const position = replicateId % network.funds.length;
  const blockOrder = deterministicShuffle(
    network.funds.map(({ id }) => id),
    scenarioKey(config, block, `target-block-${block}`, 'balanced-fund-order'),
  );
  return blockOrder[position]!;
}

export function createValuationShockScenarios(
  config: SimulationConfig,
  network: NetworkModel,
  replicateId: number,
): ValuationShockScenario[] {
  requireReplicateId(replicateId);
  const cycleOffsetSec = randomIntegerBelow(
    scenarioKey(config, replicateId, 'r0-cycle', 'shock-second-offset'),
    config.shock.r0CycleSec,
  );
  const shockAt = config.shock.cycleStartAt + cycleOffsetSec;
  const fundId = targetFundId(config, network, replicateId);
  return config.shock.navDropBps.map((navDropBps) => ({
    scenarioId: `valuation-r${String(replicateId).padStart(6, '0')}-m${navDropBps}`,
    shockType: 'valuation',
    replicateId,
    targetFundId: fundId,
    shockAt,
    cycleOffsetSec,
    navDropBps,
  }));
}
