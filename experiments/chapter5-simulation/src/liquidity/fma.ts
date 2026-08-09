import { MAX_BPS } from '../artifact/risk/calc';

export function firstMoverAdvantageBps(liquidityBufferRatioBps: number): number {
  if (!Number.isSafeInteger(liquidityBufferRatioBps) || liquidityBufferRatioBps < 0) {
    throw new Error('INVALID_LIQUIDITY_BUFFER_RATIO_BPS');
  }
  return Math.max(0, MAX_BPS - liquidityBufferRatioBps);
}
