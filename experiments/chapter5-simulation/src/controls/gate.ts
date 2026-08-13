import { MAX_BPS } from '../artifact/risk/calc';

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

export function controlledOutflow(uncontrolledOutflow: number, phiBps: number): number {
  if (!Number.isSafeInteger(uncontrolledOutflow) || uncontrolledOutflow < 0) {
    throw new Error('INVALID_UNCONTROLLED_OUTFLOW');
  }
  requireBps(phiBps, 'CONTROL_PHI_BPS');
  return Number(
    (BigInt(uncontrolledOutflow) * BigInt(MAX_BPS - phiBps)) / BigInt(MAX_BPS),
  );
}

export function qualifiesForGateRelease(riskScoreBps: number, kappaBps: number): boolean {
  requireBps(riskScoreBps, 'CONTROL_RISK_SCORE_BPS');
  requireBps(kappaBps, 'CONTROL_KAPPA_BPS');
  return riskScoreBps <= kappaBps;
}
