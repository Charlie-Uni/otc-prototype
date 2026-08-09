import { MAX_BPS } from '../artifact/risk/calc';
import type { NetworkModel } from '../network/types';
import type { SimulationState } from '../state/types';
import { firstMoverAdvantageBps } from './fma';

export function liquidAssetValue(
  state: SimulationState,
  network: NetworkModel,
  fundId: string,
): number {
  const liquidAssetIds = new Set(
    network.assetClasses
      .filter(({ liquidity }) => liquidity === 'liquid')
      .map(({ id }) => id),
  );
  if (!network.funds.some(({ id }) => id === fundId)) throw new Error('UNKNOWN_LIQUIDITY_FUND');
  return state.assetPositions
    .filter((position) => position.fundId === fundId && liquidAssetIds.has(position.assetClassId))
    .reduce((sum, position) => sum + position.value, 0);
}

export function runtimeLiquidityBufferRatioBps(
  state: SimulationState,
  network: NetworkModel,
  fundId: string,
): number {
  const fundState = state.funds.find(({ fundId: id }) => id === fundId);
  const fundNode = network.funds.find(({ id }) => id === fundId);
  if (!fundState || !fundNode) throw new Error('UNKNOWN_LIQUIDITY_FUND');
  const expectedClaims = Number(
    (BigInt(fundState.economicAum) * BigInt(fundNode.expectedRedemptionClaimsBps))
      / BigInt(MAX_BPS),
  );
  if (expectedClaims === 0) return MAX_BPS;
  return Number(
    (BigInt(liquidAssetValue(state, network, fundId)) * BigInt(MAX_BPS))
      / BigInt(expectedClaims),
  );
}

export function runtimeFirstMoverAdvantageBps(
  state: SimulationState,
  network: NetworkModel,
  fundId: string,
): number {
  return firstMoverAdvantageBps(runtimeLiquidityBufferRatioBps(state, network, fundId));
}
