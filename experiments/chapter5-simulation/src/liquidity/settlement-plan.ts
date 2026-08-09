import { MAX_BPS } from '../artifact/risk/calc';
import type { SimulationConfig } from '../core/config';
import type { NetworkModel } from '../network/types';
import type { AssetPositionState, AssetSaleState, SimulationState } from '../state/types';
import {
  discountedSaleProceeds,
  priceImpactBps,
  type PriceImpactParameters,
} from './price-impact';

type SaleDraft = Omit<AssetSaleState, 'saleId' | 'requestId' | 'fundId' | 'occurredAt'>;

export type SettlementLiquidityPlan = {
  assetPositions: AssetPositionState[];
  sales: SaleDraft[];
  fireSaleDiscountLoss: number;
};

function minimumGrossSaleForProceeds(
  requiredProceeds: number,
  maximumSale: number,
  marketDepth: number,
  parameters: PriceImpactParameters,
): number {
  let low = 1;
  let high = maximumSale;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (discountedSaleProceeds(middle, marketDepth, parameters) >= requiredProceeds) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

export function planSettlementLiquidity(
  state: SimulationState,
  network: NetworkModel,
  fundId: string,
  settlementAmount: number,
  config: SimulationConfig['liquidity'],
): SettlementLiquidityPlan | null {
  const assetPositions = structuredClone(state.assetPositions);
  const liquidAssetIds = new Set(
    network.assetClasses
      .filter(({ liquidity }) => liquidity === 'liquid')
      .map(({ id }) => id),
  );
  const fundPositionIndexes = assetPositions
    .map((position, index) => ({ position, index }))
    .filter(({ position }) => position.fundId === fundId)
    .sort((left, right) => left.position.assetClassId.localeCompare(right.position.assetClassId));
  const liquidIndexes = fundPositionIndexes
    .filter(({ position }) => liquidAssetIds.has(position.assetClassId))
    .map(({ index }) => index);
  if (liquidIndexes.length === 0) throw new Error('FUND_HAS_NO_LIQUID_POSITION');

  let remaining = settlementAmount;
  for (const index of liquidIndexes) {
    const position = assetPositions[index]!;
    const consumed = Math.min(position.value, remaining);
    position.value -= consumed;
    remaining -= consumed;
  }
  if (remaining === 0) return { assetPositions, sales: [], fireSaleDiscountLoss: 0 };

  const cashGap = remaining;
  const sales: SaleDraft[] = [];
  const parameters = {
    lambdaBps: config.priceImpactLambdaBps,
    gamma: config.priceImpactGamma,
  };
  for (const { position, index } of fundPositionIndexes) {
    if (liquidAssetIds.has(position.assetClassId) || remaining === 0 || position.value === 0) continue;
    const systemAssetValue = state.assetPositions
      .filter(({ assetClassId }) => assetClassId === position.assetClassId)
      .reduce((sum, candidate) => sum + candidate.value, 0);
    const marketDepth = Number(
      (BigInt(systemAssetValue) * BigInt(config.marketDepthMultipleBps)) / BigInt(MAX_BPS),
    );
    if (marketDepth <= 0) continue;
    const maximumProceeds = discountedSaleProceeds(position.value, marketDepth, parameters);
    if (maximumProceeds === 0) continue;
    const grossAmount = maximumProceeds <= remaining
      ? position.value
      : minimumGrossSaleForProceeds(remaining, position.value, marketDepth, parameters);
    const proceeds = discountedSaleProceeds(grossAmount, marketDepth, parameters);
    assetPositions[index]!.value -= grossAmount;
    sales.push({
      assetClassId: position.assetClassId,
      grossAmount,
      proceeds,
      priceImpactBps: priceImpactBps(grossAmount, marketDepth, parameters),
    });
    remaining = Math.max(0, remaining - proceeds);
  }
  if (remaining > 0) return null;

  const saleProceeds = sales.reduce((sum, sale) => sum + sale.proceeds, 0);
  assetPositions[liquidIndexes[0]!]!.value += saleProceeds - cashGap;
  return {
    assetPositions,
    sales,
    fireSaleDiscountLoss: sales.reduce(
      (sum, sale) => sum + sale.grossAmount - sale.proceeds,
      0,
    ),
  };
}
