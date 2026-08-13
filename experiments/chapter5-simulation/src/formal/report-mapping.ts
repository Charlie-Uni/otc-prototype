import type { TransparencyRegimeId } from '../artifact/risk/regimes';
import type { DetectionLagOutcome } from '../metrics/outcome-types';
import { shockMagnitudeBps } from '../shocks/scenario';
import type { FormalPairContrast } from './contrasts';
import type { FormalPairObservation } from './measurement';

export type HypothesisId = 'H1' | 'H2' | 'H3' | 'H4a' | 'H4b' | 'H5' | 'H6';
export type AnalysisTier = 'primary' | 'window_robustness';

export type FormalEstimateDefinition = {
  hypothesisId: HypothesisId;
  testId: string;
  contrastId: string;
  metricId: string;
  unit: 'bps' | 'seconds';
  orientation: string;
  windowDays: number | null;
  analysisTier: AnalysisTier;
};

export const POLICY_REGIMES: readonly TransparencyRegimeId[] = ['R0', 'R1', 'R2', 'R3', 'R4'];

export function pairedDetectionValue(
  minuend: DetectionLagOutcome,
  subtrahend: DetectionLagOutcome,
): { value: number | null; reason?: string } {
  if (minuend.status === 'detected' && subtrahend.status === 'detected') {
    return { value: minuend.lagSec - subtrahend.lagSec };
  }
  const reasons = [
    minuend.status === 'censored' ? `minuend_${minuend.reason}` : null,
    subtrahend.status === 'censored' ? `subtrahend_${subtrahend.reason}` : null,
  ].filter((reason): reason is string => reason !== null);
  return { value: null, reason: reasons.join('+') };
}

export function primaryPolicyKey(observation: FormalPairObservation): string {
  const scenario = observation.arms[0].scenario;
  return `${shockMagnitudeBps(scenario)}:${observation.replicateId}`;
}

export function primaryPolicyRegime(
  observation: FormalPairObservation,
): TransparencyRegimeId {
  const [first, second] = observation.arms;
  if (first.regimeId !== second.regimeId) throw new Error('FORMAL_POLICY_PAIR_REGIME_MISMATCH');
  return first.regimeId as TransparencyRegimeId;
}

export function directMetricDefinitions(
  pairId: string,
  windowDays: number,
  primaryWindowDays: number,
): FormalEstimateDefinition[] {
  const analysisTier: AnalysisTier = windowDays === primaryWindowDays
    ? 'primary'
    : 'window_robustness';
  const common = { contrastId: pairId, windowDays, analysisTier };
  if (pairId === 'A1' || pairId === 'A2' || pairId === 'A3') {
    const orientation = pairId === 'A1'
      ? 'public minus regulator-visible/private'
      : pairId === 'A2'
        ? 'immediate minus delayed'
        : 'detailed minus aggregate';
    const coordinationRows: FormalEstimateDefinition[] = pairId === 'A1' || pairId === 'A3'
      ? [
          {
            ...common,
            hypothesisId: 'H3',
            testId: `${pairId}:CoordinationCost:w${windowDays}`,
            metricId: 'RedemptionAcceleration',
            unit: 'bps',
            orientation,
          },
          {
            ...common,
            hypothesisId: 'H3',
            testId: `${pairId}:ControlFrozenCost:w${windowDays}`,
            metricId: 'ControlCost.GateFrozenShareRatio',
            unit: 'bps',
            orientation,
          },
          {
            ...common,
            hypothesisId: 'H3',
            testId: `${pairId}:ControlPendingCost:w${windowDays}`,
            metricId: 'ControlCost.PendingRate',
            unit: 'bps',
            orientation,
          },
          {
            ...common,
            hypothesisId: 'H3',
            testId: `${pairId}:ControlWaitingCost:w${windowDays}`,
            metricId: 'ControlCost.AverageExtraWaiting',
            unit: 'seconds',
            orientation,
          },
        ]
      : [];
    return [
      {
        ...common,
        hypothesisId: 'H2',
        testId: `${pairId}:RedemptionAcceleration:w${windowDays}`,
        metricId: 'RedemptionAcceleration',
        unit: 'bps',
        orientation,
      },
      {
        ...common,
        hypothesisId: 'H2',
        testId: `${pairId}:PeakRedemption:w${windowDays}`,
        metricId: 'PeakRedemption',
        unit: 'bps',
        orientation,
      },
      ...coordinationRows,
    ];
  }
  if (pairId === 'A4' || pairId === 'A5' || pairId === 'A7') {
    const orientation = pairId === 'A4'
      ? 'investor-overlap enabled minus disabled'
      : pairId === 'A5'
        ? 'shared-asset enabled minus disabled'
        : 'signal-analogy enabled minus disabled';
    const spilloverRows = [
      ['SpilloverRedemption', 'SpilloverRedemption'],
      ['SpilloverAffectedShare', 'SpilloverScope.AffectedFundShare'],
      ['SpilloverScope', 'SpilloverScope.MeanContinuous'],
    ] as const;
    const rows = pairId === 'A7'
      ? spilloverRows
      : [...spilloverRows, ['LossMagnitude', 'LossMagnitude'] as const];
    return rows.map(([testSuffix, metricId]) => ({
      ...common,
      hypothesisId: pairId === 'A7' ? 'H4b' : 'H4a',
      testId: `${pairId}:${testSuffix}:w${windowDays}`,
      metricId,
      unit: 'bps',
      orientation,
    }));
  }
  if (pairId === 'A6') {
    const rows = [
      ['PublicControlSpillover', 'PublicControlSpillover'],
      ['SpilloverAffectedShare', 'SpilloverScope.AffectedFundShare'],
      ['SpilloverScope', 'SpilloverScope.MeanContinuous'],
    ] as const;
    return rows.map(([testSuffix, metricId]) => ({
      ...common,
      hypothesisId: 'H6',
      testId: `A6:${testSuffix}:w${windowDays}`,
      metricId,
      unit: 'bps',
      orientation: 'public control disclosure minus private control disclosure',
    }));
  }
  if (pairId.startsWith('ROBUST-CONTROL_PHI-')) {
    return [
      {
        ...common,
        hypothesisId: 'H5',
        testId: `${pairId}:LossReduction:w${windowDays}`,
        metricId: 'LossReduction',
        unit: 'bps',
        orientation: 'lower-control loss minus full-control loss; positive favors full control',
      },
      {
        ...common,
        hypothesisId: 'H5',
        testId: `${pairId}:RelativeLossReduction:w${windowDays}`,
        metricId: 'LossReduction.Relative',
        unit: 'bps',
        orientation: 'absolute loss reduction divided by lower-control loss',
      },
      {
        ...common,
        hypothesisId: 'H5',
        testId: `${pairId}:LiquidityBenefit:w${windowDays}`,
        metricId: 'LiquidityBufferDepletion',
        unit: 'bps',
        orientation: 'lower-control depletion minus full-control depletion; positive favors full control',
      },
      {
        ...common,
        hypothesisId: 'H5',
        testId: `${pairId}:ControlPendingCost:w${windowDays}`,
        metricId: 'ControlCost.PendingRate',
        unit: 'bps',
        orientation: 'full-control pending rate minus lower-control pending rate',
      },
      {
        ...common,
        hypothesisId: 'H5',
        testId: `${pairId}:ControlFrozenCost:w${windowDays}`,
        metricId: 'ControlCost.GateFrozenShareRatio',
        unit: 'bps',
        orientation: 'full-control frozen-share ratio minus lower-control frozen-share ratio',
      },
      {
        ...common,
        hypothesisId: 'H5',
        testId: `${pairId}:ControlWaitingCost:w${windowDays}`,
        metricId: 'ControlCost.AverageExtraWaiting',
        unit: 'seconds',
        orientation: 'full-control extra waiting minus lower-control extra waiting',
      },
    ];
  }
  return [];
}

export function valueForDirectDefinition(
  definition: FormalEstimateDefinition,
  contrast: FormalPairContrast,
): { value: number | null; reason?: string } {
  switch (definition.metricId) {
    case 'RedemptionAcceleration':
      return { value: contrast.difference.acceptedRequestRateBps.firstMinusSecond };
    case 'PeakRedemption':
      return { value: contrast.difference.targetPeakRedemptionBps.firstMinusSecond };
    case 'ControlCost.PendingRate':
      return { value: contrast.difference.pendingRateBps.firstMinusSecond };
    case 'ControlCost.GateFrozenShareRatio':
      return { value: contrast.difference.gateFrozenShareRatioBps.firstMinusSecond };
    case 'ControlCost.AverageExtraWaiting':
      return contrast.difference.averageExtraWaitingSec.firstMinusSecond === null
        ? { value: null, reason: 'no_comparable_settled_requests' }
        : { value: contrast.difference.averageExtraWaitingSec.firstMinusSecond };
    case 'SpilloverRedemption':
    case 'PublicControlSpillover':
      return { value: contrast.difference.unshockedAcceptedRequestRateBps.firstMinusSecond };
    case 'SpilloverScope.MeanContinuous':
      return contrast.spillover.status === 'available'
        ? { value: contrast.spillover.value.meanContinuousSpilloverBps }
        : { value: null, reason: contrast.spillover.reason };
    case 'SpilloverScope.AffectedFundShare':
      return contrast.spillover.status === 'available'
        ? { value: contrast.spillover.value.affectedFundShareBps }
        : { value: null, reason: contrast.spillover.reason };
    case 'LossMagnitude':
      return { value: contrast.difference.aggregateLossMagnitudeBps.firstMinusSecond };
    case 'LossReduction':
      return { value: -contrast.difference.aggregateLossMagnitudeBps.firstMinusSecond };
    case 'LossReduction.Relative': {
      const lowerControlLoss = contrast.second.aggregateLossMagnitudeBps;
      return lowerControlLoss === 0
        ? { value: null, reason: 'lower_control_loss_zero' }
        : {
            value: Math.trunc(
              (lowerControlLoss - contrast.first.aggregateLossMagnitudeBps)
              * 10_000
              / lowerControlLoss,
            ),
          };
    }
    case 'LiquidityBufferDepletion':
      return { value: -contrast.difference.targetLiquidityBufferDepletionBps.firstMinusSecond };
    default:
      throw new Error(`UNKNOWN_FORMAL_REPORT_METRIC:${definition.metricId}`);
  }
}
