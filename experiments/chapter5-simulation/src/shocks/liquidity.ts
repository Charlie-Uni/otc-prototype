import { computeLiquidityShortfallBps, MAX_BPS } from '../artifact/risk/calc';
import { allocateIntegerProportionally } from '../core/allocation';
import type { NetworkModel } from '../network/types';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import type { LiquidityShockScenario } from './scenario';

function requireShockAvailable(state: SimulationState, scenario: LiquidityShockScenario): void {
  if (scenario.shockAt !== state.nowSec) throw new Error('SHOCK_TIME_STATE_MISMATCH');
  if (state.appliedValuationShocks.length > 0 || (state.appliedRobustnessShocks?.length ?? 0) > 0) {
    throw new Error('SHOCK_ALREADY_APPLIED');
  }
}

export function applyLiquidityShock(
  state: SimulationState,
  network: NetworkModel,
  scenario: LiquidityShockScenario,
): SimulationState {
  requireShockAvailable(state, scenario);
  const targetFund = network.funds.find(({ id }) => id === scenario.targetFundId);
  if (!targetFund) throw new Error('UNKNOWN_LIQUIDITY_SHOCK_FUND');
  const liquidityByAsset = new Map(network.assetClasses.map(({ id, liquidity }) => [id, liquidity]));
  const liquid = state.assetPositions.filter(({ fundId, assetClassId }) => (
    fundId === scenario.targetFundId && liquidityByAsset.get(assetClassId) === 'liquid'
  ));
  const illiquid = state.assetPositions.filter(({ fundId, assetClassId }) => (
    fundId === scenario.targetFundId && liquidityByAsset.get(assetClassId) === 'illiquid'
  ));
  if (liquid.length === 0 || illiquid.length === 0) {
    throw new Error('LIQUIDITY_SHOCK_REQUIRES_BOTH_ASSET_TYPES');
  }
  const preShockLiquidAssetValue = liquid.reduce((sum, { value }) => sum + value, 0);
  const expectedClaims = Number(
    (BigInt(targetFund.initialAum) * BigInt(targetFund.expectedRedemptionClaimsBps))
      / BigInt(MAX_BPS),
  );
  if (expectedClaims <= 0) throw new Error('INVALID_LIQUIDITY_SHOCK_EXPECTED_CLAIMS');
  const preShockBufferRatioBps = Number(
    (BigInt(preShockLiquidAssetValue) * BigInt(MAX_BPS)) / BigInt(expectedClaims),
  );
  const preShockLiquidityShortfallBps = computeLiquidityShortfallBps(preShockBufferRatioBps);
  const postShockLiquidityShortfallBps = Math.min(
    MAX_BPS,
    preShockLiquidityShortfallBps + scenario.liquidityImpairmentBps,
  );
  const postShockBufferRatioBps = MAX_BPS - postShockLiquidityShortfallBps;
  const postShockLiquidAssetValue = Number(
    (BigInt(expectedClaims) * BigInt(postShockBufferRatioBps)) / BigInt(MAX_BPS),
  );
  const reclassifiedAmount = preShockLiquidAssetValue - postShockLiquidAssetValue;
  if (reclassifiedAmount <= 0) throw new Error('LIQUIDITY_SHOCK_ROUNDS_TO_ZERO');
  const removals = allocateIntegerProportionally(
    reclassifiedAmount,
    liquid.map(({ value }) => value),
  );
  const additions = allocateIntegerProportionally(
    reclassifiedAmount,
    illiquid.map(({ value }) => value),
  );
  const removalByAsset = new Map(liquid.map(({ assetClassId }, index) => [
    assetClassId,
    removals[index]!,
  ]));
  const additionByAsset = new Map(illiquid.map(({ assetClassId }, index) => [
    assetClassId,
    additions[index]!,
  ]));
  const next: SimulationState = {
    ...state,
    assetPositions: state.assetPositions.map((position) => {
      if (position.fundId !== scenario.targetFundId) return position;
      const removal = removalByAsset.get(position.assetClassId) ?? 0;
      const addition = additionByAsset.get(position.assetClassId) ?? 0;
      return removal === 0 && addition === 0
        ? position
        : { ...position, value: position.value - removal + addition };
    }),
    appliedRobustnessShocks: [{
      scenarioId: scenario.scenarioId,
      shockType: 'liquidity',
      targetFundId: scenario.targetFundId,
      shockAt: scenario.shockAt,
      liquidityImpairmentBps: scenario.liquidityImpairmentBps,
      reclassifiedAmount,
      preShockLiquidAssetValue,
      postShockLiquidAssetValue,
      preShockLiquidityShortfallBps,
      postShockLiquidityShortfallBps,
    }],
  };
  validateSimulationState(next, network);
  return next;
}
