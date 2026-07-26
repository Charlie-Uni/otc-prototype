export const MAX_BPS = 10_000;
export const RED_SCORE_BPS = 7_000;
export const YELLOW_SCORE_BPS = 4_000;

export type RiskLevel = 'green' | 'yellow' | 'red';

export type RiskMetrics = {
  valuationHaircutBps: number;
  redemptionPressureBps: number;
  redemptionQueueRatioBps: number;
  liquidityShortfallBps: number;
  stalePricingRiskBps: number;
  investorConcentrationBps: number;
};

export function normalizeStalePricingRiskBps(ageSec: number, maxStaleAgeSec: number): number {
  if (!Number.isInteger(ageSec) || ageSec < 0) {
    throw new Error('INVALID_STALE_AGE');
  }
  if (!Number.isInteger(maxStaleAgeSec) || maxStaleAgeSec <= 0) {
    throw new Error('INVALID_MAX_STALE_AGE');
  }
  return Math.min(MAX_BPS, Math.floor((ageSec * MAX_BPS) / maxStaleAgeSec));
}

export function computeInvestorConcentrationBps(holderSharesBps: number[]): number {
  const total = holderSharesBps.reduce((sum, share) => sum + share, 0);
  if (total !== MAX_BPS) {
    throw new Error('HOLDER_SHARES_MUST_SUM_10000');
  }

  const hhiNumerator = holderSharesBps.reduce((sum, share) => sum + share * share, 0);
  return Math.floor(hhiNumerator / MAX_BPS);
}

export function computeLiquidityShortfallBps(liquidityBufferRatioBps: number): number {
  if (!Number.isInteger(liquidityBufferRatioBps) || liquidityBufferRatioBps < 0) {
    throw new Error('INVALID_LIQUIDITY_BUFFER_RATIO');
  }
  return Math.max(0, MAX_BPS - liquidityBufferRatioBps);
}

export function computeRedemptionPressureBps(requestedAmount: bigint, totalSupply: bigint): number {
  if (requestedAmount < 0n || totalSupply < 0n) {
    throw new Error('INVALID_REDEMPTION_PRESSURE_INPUT');
  }
  if (totalSupply === 0n) {
    return 0;
  }
  const pressureBps = Number((requestedAmount * BigInt(MAX_BPS)) / totalSupply);
  return Math.min(MAX_BPS, pressureBps);
}

export function riskLevelFor(scoreBps: number, gated: boolean): RiskLevel {
  if (gated) return 'red';
  if (scoreBps >= RED_SCORE_BPS) return 'red';
  if (scoreBps >= YELLOW_SCORE_BPS) return 'yellow';
  return 'green';
}
