import { MAX_BPS } from '../artifact/risk/calc';
import type {
  ExpectedOthersRedeemInput,
  ExpectedOthersRedeemWeights,
} from './types';

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

export function expectedOthersRedeemBps(
  input: ExpectedOthersRedeemInput,
  weightsBps: ExpectedOthersRedeemWeights,
): number {
  requireBps(input.publicRiskSignalBps, 'PUBLIC_RISK_SIGNAL_BPS');
  requireBps(input.signalSynchronicityBps, 'SIGNAL_SYNCHRONICITY_BPS');
  requireBps(input.laggedRedemptionPressureBps, 'LAGGED_REDEMPTION_PRESSURE_BPS');
  weightsBps.forEach((weight, index) => requireBps(weight, `EXPECTATION_WEIGHT_${index}`));
  if (weightsBps.reduce((sum, weight) => sum + weight, 0) !== MAX_BPS) {
    throw new Error('EXPECTATION_WEIGHTS_MUST_SUM_10000');
  }

  const values = [
    input.publicRiskSignalBps,
    input.signalSynchronicityBps,
    input.laggedRedemptionPressureBps,
  ];
  const weightedSum = values.reduce(
    (sum, value, index) => sum + BigInt(value) * BigInt(weightsBps[index]!),
    0n,
  );
  return Number(weightedSum / BigInt(MAX_BPS));
}
