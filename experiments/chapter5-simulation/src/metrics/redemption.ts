import { MAX_BPS } from '../artifact/risk/calc';

function ratioBps(numerator: number, denominator: number, denominatorError: string): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new Error('INVALID_REDEMPTION_PRESSURE_NUMERATOR');
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(denominatorError);
  }
  return Math.min(
    MAX_BPS,
    Number((BigInt(numerator) * BigInt(MAX_BPS)) / BigInt(denominator)),
  );
}

export function redemptionDecisionPressureBps(
  redeemingInvestorCount: number,
  eligibleInvestorCount: number,
): number {
  if (!Number.isSafeInteger(eligibleInvestorCount) || eligibleInvestorCount <= 0) {
    throw new Error('INVALID_ELIGIBLE_INVESTOR_COUNT');
  }
  if (redeemingInvestorCount > eligibleInvestorCount) {
    throw new Error('REDEEMING_INVESTORS_EXCEED_ELIGIBLE_COUNT');
  }
  return ratioBps(
    redeemingInvestorCount,
    eligibleInvestorCount,
    'INVALID_ELIGIBLE_INVESTOR_COUNT',
  );
}

export function redemptionRequestPressureBps(
  requestedShares: number,
  preRequestTotalShares: number,
): number {
  return ratioBps(
    requestedShares,
    preRequestTotalShares,
    'INVALID_PRE_REQUEST_TOTAL_SHARES',
  );
}
