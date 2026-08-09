import { TICK_SEC } from '../core/pipeline';
import type { OracleRiskSnapshot } from '../state/types';

export function riskSnapshotFixture(
  submissionId: string,
  fundId: string,
  submittedAt: number,
  riskScoreBps = 6_500,
): OracleRiskSnapshot {
  return {
    submissionId,
    replicateId: 0,
    tick: 0,
    fundId,
    occurredAt: submittedAt,
    submittedAt,
    attemptCount: 1,
    failedAttemptCount: 0,
    navUpdated: false,
    staleAgeSecRaw: 19.5 * TICK_SEC,
    liquidityBufferRatioBps: 3_500,
    metrics: {
      valuationHaircutBps: riskScoreBps,
      redemptionPressureBps: riskScoreBps,
      redemptionQueueRatioBps: riskScoreBps,
      liquidityShortfallBps: riskScoreBps,
      stalePricingRiskBps: riskScoreBps,
      investorConcentrationBps: riskScoreBps,
    },
    weightSchemeId: 'test',
    weightBps: [1_667, 1_667, 1_667, 1_667, 1_666, 1_666],
    maxStaleAgeDays: 30,
    riskScoreBps,
    detectionThresholdBps: 6_000,
    kappaBps: 7_000,
    detected: riskScoreBps >= 6_000,
    interventionTriggered: riskScoreBps > 7_000,
  };
}
