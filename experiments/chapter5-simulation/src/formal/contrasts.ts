import { controlCost, spilloverScope } from '../metrics/counterfactual';
import { ratioBps } from '../metrics/math';
import type {
  ControlCostMetrics,
  DetectionLagOutcome,
  FundRunOutcome,
  RunOutcomeMetrics,
  SpilloverScopeMetrics,
} from '../metrics/outcome-types';
import { semanticDigestSha256 } from '../runner/digest';
import type { FormalArmMeasurement, FormalPairObservation } from './measurement';

export type PairedScalar = {
  first: number;
  second: number;
  firstMinusSecond: number;
};

export type NullablePairedScalar = {
  first: number | null;
  second: number | null;
  firstMinusSecond: number | null;
};

export type FormalArmAggregate = {
  acceptedRequestRateBps: number;
  unshockedAcceptedRequestRateBps: number;
  targetPeakRedemptionBps: number;
  targetLossMagnitudeBps: number;
  aggregateLossMagnitudeBps: number;
  targetLiquidityBufferDepletionBps: number;
  controlCost: ControlCostMetrics;
};

export type PairedDetectionContrast = {
  first: DetectionLagOutcome;
  second: DetectionLagOutcome;
  firstMinusSecondSec: number | null;
};

export type FormalPairContrast = {
  schemaVersion: 1;
  pairId: string;
  family: FormalPairObservation['family'];
  replicateId: number;
  windowDays: number;
  targetFundId: string;
  firstArm: FormalArmMeasurement['arm'];
  secondArm: FormalArmMeasurement['arm'];
  first: FormalArmAggregate;
  second: FormalArmAggregate;
  difference: {
    acceptedRequestRateBps: PairedScalar;
    unshockedAcceptedRequestRateBps: PairedScalar;
    targetPeakRedemptionBps: PairedScalar;
    targetLossMagnitudeBps: PairedScalar;
    aggregateLossMagnitudeBps: PairedScalar;
    targetLiquidityBufferDepletionBps: PairedScalar;
    gateFrozenShareRatioBps: PairedScalar;
    pendingRateBps: PairedScalar;
    averageExtraWaitingSec: NullablePairedScalar;
  };
  spillover: {
    status: 'available';
    value: SpilloverScopeMetrics;
  } | {
    status: 'not_comparable';
    reason: 'fund_set_differs_by_design' | 'scenario_differs_by_design';
  };
  warningThresholdDetection: PairedDetectionContrast;
  primaryRegulatorDetection: DetectionLagOutcome | null;
  semanticDigestSha256: string;
};

function pairedScalar(first: number, second: number): PairedScalar {
  return { first, second, firstMinusSecond: first - second };
}

function nullablePairedScalar(
  first: number | null,
  second: number | null,
): NullablePairedScalar {
  return {
    first,
    second,
    firstMinusSecond: first === null || second === null ? null : first - second,
  };
}

function targetFund(outcome: RunOutcomeMetrics, targetFundId: string): FundRunOutcome {
  const target = outcome.funds.find(({ fundId }) => fundId === targetFundId);
  if (!target || !target.shocked) throw new Error('FORMAL_CONTRAST_TARGET_FUND_MISMATCH');
  return target;
}

function aggregateRate(
  funds: readonly FundRunOutcome[],
  numerator: (fund: FundRunOutcome) => number,
  label: string,
): number {
  if (funds.length === 0) throw new Error(`EMPTY_FORMAL_CONTRAST_FUND_SET:${label}`);
  return ratioBps(
    funds.reduce((sum, fund) => sum + numerator(fund), 0),
    funds.reduce((sum, fund) => sum + fund.initialTotalShares, 0),
    label,
  );
}

function armAggregate(outcome: RunOutcomeMetrics, targetFundId: string): FormalArmAggregate {
  const target = targetFund(outcome, targetFundId);
  const unshocked = outcome.funds.filter(({ fundId }) => fundId !== targetFundId);
  return {
    acceptedRequestRateBps: aggregateRate(
      outcome.funds,
      (fund) => fund.cumulativeRequestedShares,
      'FORMAL_ACCEPTED_REQUEST_RATE',
    ),
    unshockedAcceptedRequestRateBps: aggregateRate(
      unshocked,
      (fund) => fund.cumulativeRequestedShares,
      'FORMAL_UNSHOCKED_REQUEST_RATE',
    ),
    targetPeakRedemptionBps: target.peakRedemptionBps,
    targetLossMagnitudeBps: target.lossMagnitudeBps,
    aggregateLossMagnitudeBps: ratioBps(
      outcome.funds.reduce((sum, fund) => sum + fund.lossAmount, 0),
      outcome.funds.reduce((sum, fund) => sum + fund.initialAum, 0),
      'FORMAL_AGGREGATE_LOSS_MAGNITUDE',
    ),
    targetLiquidityBufferDepletionBps: target.liquidityBufferDepletionBps,
    controlCost: controlCost(outcome),
  };
}

function outcomeForWindow(arm: FormalArmMeasurement, windowDays: number): RunOutcomeMetrics {
  const matches = arm.outcomesByWindow.filter((outcome) => outcome.windowDays === windowDays);
  if (matches.length !== 1) throw new Error('FORMAL_CONTRAST_WINDOW_MISMATCH');
  return matches[0]!;
}

function sameFundSet(first: RunOutcomeMetrics, second: RunOutcomeMetrics): boolean {
  const firstIds = first.funds.map(({ fundId }) => fundId).sort();
  const secondIds = second.funds.map(({ fundId }) => fundId).sort();
  return JSON.stringify(firstIds) === JSON.stringify(secondIds);
}

function detectionContrast(
  first: DetectionLagOutcome,
  second: DetectionLagOutcome,
): PairedDetectionContrast {
  return {
    first,
    second,
    firstMinusSecondSec: first.status === 'detected' && second.status === 'detected'
      ? first.lagSec - second.lagSec
      : null,
  };
}

export function createFormalPairContrast(
  observation: FormalPairObservation,
  windowDays: number,
  spilloverThresholdBps = 500,
): FormalPairContrast {
  const [firstArm, secondArm] = observation.arms;
  const firstOutcome = outcomeForWindow(firstArm, windowDays);
  const secondOutcome = outcomeForWindow(secondArm, windowDays);
  const targetFundId = firstArm.scenario.targetFundId;
  if (
    secondArm.scenario.targetFundId !== targetFundId
    || firstArm.scenario.shockAt !== secondArm.scenario.shockAt
  ) throw new Error('FORMAL_CONTRAST_SCENARIO_MISMATCH');
  const first = armAggregate(firstOutcome, targetFundId);
  const second = armAggregate(secondOutcome, targetFundId);
  const withoutDigest = {
    schemaVersion: 1 as const,
    pairId: observation.pairId,
    family: observation.family,
    replicateId: observation.replicateId,
    windowDays,
    targetFundId,
    firstArm: firstArm.arm,
    secondArm: secondArm.arm,
    first,
    second,
    difference: {
      acceptedRequestRateBps: pairedScalar(
        first.acceptedRequestRateBps,
        second.acceptedRequestRateBps,
      ),
      unshockedAcceptedRequestRateBps: pairedScalar(
        first.unshockedAcceptedRequestRateBps,
        second.unshockedAcceptedRequestRateBps,
      ),
      targetPeakRedemptionBps: pairedScalar(
        first.targetPeakRedemptionBps,
        second.targetPeakRedemptionBps,
      ),
      targetLossMagnitudeBps: pairedScalar(
        first.targetLossMagnitudeBps,
        second.targetLossMagnitudeBps,
      ),
      aggregateLossMagnitudeBps: pairedScalar(
        first.aggregateLossMagnitudeBps,
        second.aggregateLossMagnitudeBps,
      ),
      targetLiquidityBufferDepletionBps: pairedScalar(
        first.targetLiquidityBufferDepletionBps,
        second.targetLiquidityBufferDepletionBps,
      ),
      gateFrozenShareRatioBps: pairedScalar(
        first.controlCost.gateFrozenShareRatioBps,
        second.controlCost.gateFrozenShareRatioBps,
      ),
      pendingRateBps: pairedScalar(
        first.controlCost.pendingRateBps,
        second.controlCost.pendingRateBps,
      ),
      averageExtraWaitingSec: nullablePairedScalar(
        first.controlCost.averageExtraWaitingSec,
        second.controlCost.averageExtraWaitingSec,
      ),
    },
    spillover: !sameFundSet(firstOutcome, secondOutcome)
      ? {
          status: 'not_comparable' as const,
          reason: 'fund_set_differs_by_design' as const,
        }
      : firstOutcome.scenarioId !== secondOutcome.scenarioId
        ? {
            status: 'not_comparable' as const,
            reason: 'scenario_differs_by_design' as const,
          }
        : {
            status: 'available' as const,
            value: spilloverScope(firstOutcome, secondOutcome, spilloverThresholdBps),
          },
    warningThresholdDetection: detectionContrast(
      firstArm.regulatorWarningThresholdLag,
      secondArm.regulatorWarningThresholdLag,
    ),
    primaryRegulatorDetection: observation.primaryShockLinkedDetection?.regulatorDisclosure ?? null,
  };
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}
