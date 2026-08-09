import { MAX_BPS } from '../artifact/risk/calc';

export type PriceImpactParameters = {
  lambdaBps: number;
  gamma: number;
};

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function requireParameters(parameters: PriceImpactParameters): void {
  if (
    !Number.isInteger(parameters.lambdaBps)
    || parameters.lambdaBps < 0
    || parameters.lambdaBps >= MAX_BPS
  ) {
    throw new Error('INVALID_PRICE_IMPACT_LAMBDA_BPS');
  }
  if (!Number.isFinite(parameters.gamma) || parameters.gamma <= 0 || parameters.gamma > 4) {
    throw new Error('INVALID_PRICE_IMPACT_GAMMA');
  }
}

export function priceImpactBps(
  saleAmount: number,
  marketDepth: number,
  parameters: PriceImpactParameters,
): number {
  requireSafeNonNegative(saleAmount, 'SALE_AMOUNT');
  if (!Number.isSafeInteger(marketDepth) || marketDepth <= 0) {
    throw new Error('INVALID_MARKET_DEPTH');
  }
  requireParameters(parameters);
  if (saleAmount === 0 || parameters.lambdaBps === 0) return 0;
  const impact = Math.floor(
    parameters.lambdaBps * ((saleAmount / marketDepth) ** parameters.gamma),
  );
  return Math.min(impact, MAX_BPS - 1);
}

export function discountedSaleProceeds(
  saleAmount: number,
  marketDepth: number,
  parameters: PriceImpactParameters,
): number {
  const impactBps = priceImpactBps(saleAmount, marketDepth, parameters);
  return Number(
    (BigInt(saleAmount) * BigInt(MAX_BPS - impactBps)) / BigInt(MAX_BPS),
  );
}
