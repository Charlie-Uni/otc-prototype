import { MAX_BPS } from '../artifact/risk/calc';
import { randomIntegerBelow } from '../core/rng';
import type { RedemptionRequestState } from '../state/types';

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
  return riskScoreBps < kappaBps;
}

export function gateSettlementDrawBps(
  request: RedemptionRequestState,
  controlSeed: number,
): number {
  if (!Number.isSafeInteger(controlSeed) || controlSeed <= 0) {
    throw new Error('INVALID_CONTROL_SEED');
  }
  return randomIntegerBelow({
    masterSeed: BigInt(controlSeed),
    replicateId: request.replicateId,
    entityId: JSON.stringify([request.fundId, request.investorId, request.requestId]),
    moduleId: 'gate-settlement',
    tick: request.tick,
    drawPurpose: 'whole-request-admission',
  }, MAX_BPS);
}

export function redemptionBlockedByGate(
  request: RedemptionRequestState,
  phiBps: number,
  controlSeed: number,
): boolean {
  requireBps(phiBps, 'CONTROL_PHI_BPS');
  if (phiBps === 0) return false;
  if (phiBps === MAX_BPS) return true;
  return gateSettlementDrawBps(request, controlSeed) < phiBps;
}
