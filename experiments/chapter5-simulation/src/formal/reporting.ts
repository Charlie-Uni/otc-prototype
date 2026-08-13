import type { TransparencyRegimeId } from '../artifact/risk/regimes';
import type { FormalAnalysisPlan } from '../preregistration/analysis-plan';
import { shockMagnitudeBps } from '../shocks/scenario';
import { semanticDigestSha256 } from '../runner/digest';
import type { DetectionCensorReason, DetectionLagOutcome } from '../metrics/outcome-types';
import { createFormalPairContrast, type FormalPairContrast } from './contrasts';
import type { FormalPairObservation } from './measurement';
import {
  directMetricDefinitions,
  pairedDetectionValue,
  POLICY_REGIMES,
  primaryPolicyKey,
  primaryPolicyRegime,
  valueForDirectDefinition,
  type AnalysisTier,
  type FormalEstimateDefinition,
  type HypothesisId,
} from './report-mapping';
import {
  addRunningSample,
  createRunningMoments,
  holmAdjustWithinHypothesis,
  summarizeRunningMoments,
  type FormalPairedEstimate,
  type HolmAdjustedPValue,
  type RunningMoments,
} from './statistics';

export type { FormalEstimateDefinition } from './report-mapping';

export type FormalEstimateSummary = FormalEstimateDefinition & {
  observedCount: number;
  missingCount: number;
  missingRateBps: number;
  missingByReason: Record<string, number>;
  estimate: FormalPairedEstimate | null;
};

export type PolicyDetectionSummary = {
  metricId: 'RegulatorDetectionLag' | 'RegulatorWarningThresholdLag';
  regimeId: TransparencyRegimeId;
  shockMagnitudeBps: number;
  detectedCount: number;
  censoredCount: number;
  censoringRateBps: number;
  censoredByReason: Partial<Record<DetectionCensorReason, number>>;
  lagSec: FormalPairedEstimate | null;
};

export type SupplementaryEstimateSummary = {
  pairId: string;
  family: FormalPairObservation['family'];
  metricId: string;
  unit: 'bps' | 'seconds';
  orientation: 'shock minus no-shock' | 'baseline minus comparison';
  windowDays: number | null;
  observedCount: number;
  missingCount: number;
  missingRateBps: number;
  missingByReason: Record<string, number>;
  estimate: FormalPairedEstimate | null;
};

export type FormalAnalysisReport = {
  schemaVersion: 1;
  primaryWindowDays: number;
  robustnessWindowDays: number[];
  estimateSummaries: FormalEstimateSummary[];
  policyDetectionSummaries: PolicyDetectionSummary[];
  supplementaryEstimateSummaries: SupplementaryEstimateSummary[];
  holmAdjustedPrimaryPValues: HolmAdjustedPValue[];
  semanticDigestSha256: string;
};

type EstimateState = {
  definition: FormalEstimateDefinition;
  moments: RunningMoments;
  missingCount: number;
  missingByReason: Map<string, number>;
};

type DetectionState = {
  moments: RunningMoments;
  censoredCount: number;
  censoredByReason: Map<DetectionCensorReason, number>;
};

type SupplementaryState = {
  definition: Omit<
    SupplementaryEstimateSummary,
    'observedCount' | 'missingCount' | 'missingRateBps' | 'missingByReason' | 'estimate'
  >;
  moments: RunningMoments;
  missingCount: number;
  missingByReason: Map<string, number>;
};

type PrimaryPolicyGroup = {
  shockAt: number;
  targetFundId: string;
  records: Map<TransparencyRegimeId, PrimaryPolicyRecord>;
};

type PrimaryPolicyWindowEffect = {
  acceptedRequestRateBps: number;
  gateFrozenShareRatioBps: number;
  pendingRateBps: number;
  averageExtraWaitingSec: number | null;
};

type PrimaryPolicyRecord = {
  magnitudeBps: number;
  detection: DetectionLagOutcome;
  effectsByWindow: Map<number, PrimaryPolicyWindowEffect>;
};

function stateKey(definition: FormalEstimateDefinition): string {
  return [
    definition.hypothesisId,
    definition.testId,
    definition.metricId,
    definition.windowDays ?? 'event',
  ].join(':');
}

function increment<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function missingRateBps(observedCount: number, missingCount: number): number {
  const total = observedCount + missingCount;
  if (total <= 0) throw new Error('EMPTY_FORMAL_REPORT_SAMPLE');
  return Math.trunc(missingCount * 10_000 / total);
}

export class FormalAnalysisAccumulator {
  readonly #plan: FormalAnalysisPlan;
  readonly #states = new Map<string, EstimateState>();
  readonly #supplementaryStates = new Map<string, SupplementaryState>();
  readonly #policyDetection = new Map<string, DetectionState>();
  readonly #primaryGroups = new Map<string, PrimaryPolicyGroup>();
  #finished = false;

  constructor(plan: FormalAnalysisPlan) {
    this.#plan = plan;
  }

  #add(
    definition: FormalEstimateDefinition,
    sample: { value: number | null; reason?: string },
  ): void {
    const key = stateKey(definition);
    const existing = this.#states.get(key);
    if (existing && semanticDigestSha256(existing.definition) !== semanticDigestSha256(definition)) {
      throw new Error(`FORMAL_REPORT_DEFINITION_CONFLICT:${key}`);
    }
    const state = existing ?? {
      definition,
      moments: createRunningMoments(),
      missingCount: 0,
      missingByReason: new Map<string, number>(),
    };
    if (sample.value === null) {
      state.missingCount += 1;
      increment(state.missingByReason, sample.reason ?? 'unspecified_missing');
    } else {
      addRunningSample(state.moments, sample.value);
    }
    this.#states.set(key, state);
  }

  #addPolicyDetection(
    metricId: PolicyDetectionSummary['metricId'],
    regimeId: TransparencyRegimeId,
    magnitudeBps: number,
    outcome: DetectionLagOutcome,
  ): void {
    const key = `${metricId}:${regimeId}:${magnitudeBps}`;
    const state = this.#policyDetection.get(key) ?? {
      moments: createRunningMoments(),
      censoredCount: 0,
      censoredByReason: new Map<DetectionCensorReason, number>(),
    };
    if (outcome.status === 'detected') addRunningSample(state.moments, outcome.lagSec);
    else {
      state.censoredCount += 1;
      increment(state.censoredByReason, outcome.reason);
    }
    this.#policyDetection.set(key, state);
  }

  #addSpilloverThresholdSensitivity(
    observation: FormalPairObservation,
    windowDays: number,
  ): void {
    if (
      observation.pairId !== 'A4'
      && observation.pairId !== 'A5'
      && observation.pairId !== 'A6'
      && observation.pairId !== 'A7'
    ) {
      return;
    }
    for (const thresholdBps of [250, 1_000]) {
      const contrast = createFormalPairContrast(observation, windowDays, thresholdBps);
      this.#addSupplementary({
        pairId: observation.pairId,
        family: 'ablation',
        metricId: `SpilloverScope.AffectedFundShare@${thresholdBps}`,
        unit: 'bps',
        orientation: 'baseline minus comparison',
        windowDays,
      }, contrast.spillover.status === 'available'
        ? { value: contrast.spillover.value.affectedFundShareBps }
        : { value: null, reason: contrast.spillover.reason });
    }
  }

  #addSupplementary(
    definition: SupplementaryState['definition'],
    sample: { value: number | null; reason?: string },
  ): void {
    const key = [definition.pairId, definition.metricId, definition.windowDays ?? 'event'].join(':');
    const state = this.#supplementaryStates.get(key) ?? {
      definition,
      moments: createRunningMoments(),
      missingCount: 0,
      missingByReason: new Map<string, number>(),
    };
    if (semanticDigestSha256(state.definition) !== semanticDigestSha256(definition)) {
      throw new Error(`FORMAL_SUPPLEMENTARY_DEFINITION_CONFLICT:${key}`);
    }
    if (sample.value === null) {
      state.missingCount += 1;
      increment(state.missingByReason, sample.reason ?? 'unspecified_missing');
    } else addRunningSample(state.moments, sample.value);
    this.#supplementaryStates.set(key, state);
  }

  #addSupplementaryContrast(
    observation: FormalPairObservation,
    contrast: FormalPairContrast,
    windowDays: number,
  ): void {
    if (observation.family === 'ablation') return;
    const common = {
      pairId: observation.pairId,
      family: observation.family,
      orientation: observation.family === 'primary_policy'
        ? 'shock minus no-shock' as const
        : 'baseline minus comparison' as const,
      windowDays,
    };
    const rows: Array<{
      metricId: string;
      unit: 'bps' | 'seconds';
      sample: { value: number | null; reason?: string };
    }> = [
      {
        metricId: 'AcceptedRequestRate',
        unit: 'bps',
        sample: { value: contrast.difference.acceptedRequestRateBps.firstMinusSecond },
      },
      {
        metricId: 'UnshockedAcceptedRequestRate',
        unit: 'bps',
        sample: { value: contrast.difference.unshockedAcceptedRequestRateBps.firstMinusSecond },
      },
      {
        metricId: 'PeakRedemption',
        unit: 'bps',
        sample: { value: contrast.difference.targetPeakRedemptionBps.firstMinusSecond },
      },
      {
        metricId: 'AggregateLossMagnitude',
        unit: 'bps',
        sample: { value: contrast.difference.aggregateLossMagnitudeBps.firstMinusSecond },
      },
      {
        metricId: 'LiquidityBufferDepletion',
        unit: 'bps',
        sample: { value: contrast.difference.targetLiquidityBufferDepletionBps.firstMinusSecond },
      },
      {
        metricId: 'ControlCost.GateFrozenShareRatio',
        unit: 'bps',
        sample: { value: contrast.difference.gateFrozenShareRatioBps.firstMinusSecond },
      },
      {
        metricId: 'ControlCost.PendingRate',
        unit: 'bps',
        sample: { value: contrast.difference.pendingRateBps.firstMinusSecond },
      },
      {
        metricId: 'ControlCost.AverageExtraWaiting',
        unit: 'seconds',
        sample: contrast.difference.averageExtraWaitingSec.firstMinusSecond === null
          ? { value: null, reason: 'no_comparable_settled_requests' }
          : { value: contrast.difference.averageExtraWaitingSec.firstMinusSecond },
      },
      {
        metricId: 'SpilloverScope.MeanContinuous',
        unit: 'bps',
        sample: contrast.spillover.status === 'available'
          ? { value: contrast.spillover.value.meanContinuousSpilloverBps }
          : { value: null, reason: contrast.spillover.reason },
      },
      {
        metricId: 'SpilloverScope.AffectedFundShare',
        unit: 'bps',
        sample: contrast.spillover.status === 'available'
          ? { value: contrast.spillover.value.affectedFundShareBps }
          : { value: null, reason: contrast.spillover.reason },
      },
    ];
    rows.forEach(({ metricId, unit, sample }) => this.#addSupplementary(
      { ...common, metricId, unit },
      sample,
    ));
  }

  addObservation(observation: FormalPairObservation): void {
    if (this.#finished) throw new Error('FORMAL_REPORT_ALREADY_FINALIZED');
    if (observation.family === 'primary_policy') {
      const regimeId = primaryPolicyRegime(observation);
      const scenario = observation.arms[0].scenario;
      const magnitudeBps = shockMagnitudeBps(scenario);
      const detection = observation.primaryShockLinkedDetection?.regulatorDisclosure;
      if (!detection) throw new Error('FORMAL_POLICY_DETECTION_MISSING');
      this.#addPolicyDetection('RegulatorDetectionLag', regimeId, magnitudeBps, detection);
      this.#addPolicyDetection(
        'RegulatorWarningThresholdLag',
        regimeId,
        magnitudeBps,
        observation.arms[0].regulatorWarningThresholdLag,
      );
      const key = primaryPolicyKey(observation);
      const effectsByWindow = new Map<number, PrimaryPolicyWindowEffect>();
      for (const windowDays of [this.#plan.primaryWindowDays, ...this.#plan.robustnessWindowDays]) {
        const contrast = createFormalPairContrast(observation, windowDays);
        this.#addSupplementaryContrast(observation, contrast, windowDays);
        effectsByWindow.set(windowDays, {
          acceptedRequestRateBps: contrast.difference.acceptedRequestRateBps.firstMinusSecond,
          gateFrozenShareRatioBps: contrast.difference.gateFrozenShareRatioBps.firstMinusSecond,
          pendingRateBps: contrast.difference.pendingRateBps.firstMinusSecond,
          averageExtraWaitingSec: contrast.difference.averageExtraWaitingSec.firstMinusSecond,
        });
      }
      const group = this.#primaryGroups.get(key) ?? {
        shockAt: scenario.shockAt,
        targetFundId: scenario.targetFundId,
        records: new Map<TransparencyRegimeId, PrimaryPolicyRecord>(),
      };
      if (
        group.shockAt !== scenario.shockAt
        || group.targetFundId !== scenario.targetFundId
        || group.records.has(regimeId)
      ) throw new Error(`FORMAL_POLICY_CROSS_REGIME_PAIR_MISMATCH:${key}`);
      group.records.set(regimeId, { magnitudeBps, detection, effectsByWindow });
      this.#primaryGroups.set(key, group);
      return;
    }
    for (const windowDays of [this.#plan.primaryWindowDays, ...this.#plan.robustnessWindowDays]) {
      const contrast = createFormalPairContrast(observation, windowDays);
      this.#addSupplementaryContrast(observation, contrast, windowDays);
      this.#addSpilloverThresholdSensitivity(observation, windowDays);
      for (const definition of directMetricDefinitions(
        observation.pairId,
        windowDays,
        this.#plan.primaryWindowDays,
      )) this.#add(definition, valueForDirectDefinition(definition, contrast));
    }
    if (observation.family === 'robustness' || observation.family === 'behavior_lhs') {
      this.#addSupplementary({
        pairId: observation.pairId,
        family: observation.family,
        metricId: 'RegulatorWarningThresholdLag',
        unit: 'seconds',
        orientation: 'baseline minus comparison',
        windowDays: null,
      }, observation.arms[0].regulatorWarningThresholdLag.status === 'detected'
        && observation.arms[1].regulatorWarningThresholdLag.status === 'detected'
        ? {
            value: observation.arms[0].regulatorWarningThresholdLag.lagSec
              - observation.arms[1].regulatorWarningThresholdLag.lagSec,
          }
        : {
            value: null,
            reason: 'warning_threshold_pair_censored',
          });
    }
  }

  #addDetectionComparison(
    hypothesisId: HypothesisId,
    testPrefix: string,
    magnitudeBps: number,
    minuendRegime: TransparencyRegimeId,
    subtrahendRegime: TransparencyRegimeId,
    records: Map<TransparencyRegimeId, PrimaryPolicyRecord>,
  ): void {
    const minuend = records.get(minuendRegime)?.detection;
    const subtrahend = records.get(subtrahendRegime)?.detection;
    if (!minuend || !subtrahend) throw new Error('FORMAL_POLICY_DETECTION_MISSING');
    this.#add({
      hypothesisId,
      testId: `${testPrefix}:m${magnitudeBps}`,
      contrastId: 'POLICY_R0_R4',
      metricId: 'DetectionBenefit',
      unit: 'seconds',
      orientation: `${minuendRegime} regulator lag minus ${subtrahendRegime} regulator lag`,
      windowDays: null,
      analysisTier: 'primary',
    }, pairedDetectionValue(minuend, subtrahend));
  }

  #addPolicyDifferenceInDifferences(
    magnitudeBps: number,
    windowDays: number,
    minuendRegime: 'R1',
    subtrahendRegime: 'R2' | 'R4',
    records: Map<TransparencyRegimeId, PrimaryPolicyRecord>,
  ): void {
    const first = records.get(minuendRegime)?.effectsByWindow.get(windowDays);
    const second = records.get(subtrahendRegime)?.effectsByWindow.get(windowDays);
    if (!first || !second) throw new Error('FORMAL_POLICY_PAIR_INCOMPLETE');
    const tier: AnalysisTier = windowDays === this.#plan.primaryWindowDays
      ? 'primary'
      : 'window_robustness';
    const common = {
      hypothesisId: 'H3' as const,
      contrastId: 'POLICY_R0_R4',
      windowDays,
      analysisTier: tier,
      orientation: `${minuendRegime} shock effect minus ${subtrahendRegime} shock effect`,
    };
    this.#add({
      ...common,
      testId: `H3:${minuendRegime}_MINUS_${subtrahendRegime}:CoordinationCost:m${magnitudeBps}:w${windowDays}`,
      metricId: 'RedemptionAcceleration',
      unit: 'bps',
    }, {
      value: first.acceptedRequestRateBps - second.acceptedRequestRateBps,
    });
    this.#add({
      ...common,
      testId: `H3:${minuendRegime}_MINUS_${subtrahendRegime}:ControlFrozenCost:m${magnitudeBps}:w${windowDays}`,
      metricId: 'ControlCost.GateFrozenShareRatio',
      unit: 'bps',
    }, {
      value: first.gateFrozenShareRatioBps - second.gateFrozenShareRatioBps,
    });
    this.#add({
      ...common,
      testId: `H3:${minuendRegime}_MINUS_${subtrahendRegime}:ControlPendingCost:m${magnitudeBps}:w${windowDays}`,
      metricId: 'ControlCost.PendingRate',
      unit: 'bps',
    }, {
      value: first.pendingRateBps - second.pendingRateBps,
    });
    const firstWaiting = first.averageExtraWaitingSec;
    const secondWaiting = second.averageExtraWaitingSec;
    this.#add({
      ...common,
      testId: `H3:${minuendRegime}_MINUS_${subtrahendRegime}:ControlWaitingCost:m${magnitudeBps}:w${windowDays}`,
      metricId: 'ControlCost.AverageExtraWaiting',
      unit: 'seconds',
    }, firstWaiting === null || secondWaiting === null
      ? { value: null, reason: 'no_comparable_settled_requests' }
      : { value: firstWaiting - secondWaiting });
  }

  finish(): FormalAnalysisReport {
    if (this.#finished) throw new Error('FORMAL_REPORT_ALREADY_FINALIZED');
    this.#finished = true;
    for (const [key, group] of this.#primaryGroups) {
      if (POLICY_REGIMES.some((regimeId) => !group.records.has(regimeId))) {
        throw new Error(`FORMAL_POLICY_PAIR_INCOMPLETE:${key}`);
      }
      const magnitudeBps = group.records.get('R0')!.magnitudeBps;
      (['R1', 'R2', 'R3', 'R4'] as const).forEach((regimeId) => {
        this.#addDetectionComparison(
          'H1',
          `H1:R0_MINUS_${regimeId}`,
          magnitudeBps,
          'R0',
          regimeId,
          group.records,
        );
      });
      (['R1', 'R2', 'R4'] as const).forEach((regimeId) => {
        this.#addDetectionComparison(
          'H1',
          `H1:R3_MINUS_${regimeId}`,
          magnitudeBps,
          'R3',
          regimeId,
          group.records,
        );
      });
      (['R2', 'R4'] as const).forEach((regimeId) => {
        this.#addDetectionComparison(
          'H3',
          `H3:R0_MINUS_${regimeId}`,
          magnitudeBps,
          'R0',
          regimeId,
          group.records,
        );
      });
      for (const windowDays of [this.#plan.primaryWindowDays, ...this.#plan.robustnessWindowDays]) {
        this.#addPolicyDifferenceInDifferences(
          magnitudeBps,
          windowDays,
          'R1',
          'R2',
          group.records,
        );
        this.#addPolicyDifferenceInDifferences(
          magnitudeBps,
          windowDays,
          'R1',
          'R4',
          group.records,
        );
      }
    }

    const estimateSummaries = [...this.#states.values()]
      .map((state): FormalEstimateSummary => ({
        ...state.definition,
        observedCount: state.moments.count,
        missingCount: state.missingCount,
        missingRateBps: missingRateBps(state.moments.count, state.missingCount),
        missingByReason: Object.fromEntries([...state.missingByReason.entries()].sort()),
        estimate: state.moments.count >= 2 ? summarizeRunningMoments(state.moments) : null,
      }))
      .sort((left, right) => stateKey(left).localeCompare(stateKey(right)));
    const holmAdjustedPrimaryPValues = holmAdjustWithinHypothesis(estimateSummaries
      .filter((summary) => summary.analysisTier === 'primary' && summary.estimate !== null)
      .map((summary) => ({
        hypothesisId: summary.hypothesisId,
        testId: summary.testId,
        pValue: summary.estimate!.twoSidedNormalPValue,
      })));
    const policyDetectionSummaries = [...this.#policyDetection.entries()]
      .map(([key, state]): PolicyDetectionSummary => {
        const [metricId, regimeId, magnitude] = key.split(':');
        return {
          metricId: metricId as PolicyDetectionSummary['metricId'],
          regimeId: regimeId as TransparencyRegimeId,
          shockMagnitudeBps: Number(magnitude),
          detectedCount: state.moments.count,
          censoredCount: state.censoredCount,
          censoringRateBps: missingRateBps(state.moments.count, state.censoredCount),
          censoredByReason: Object.fromEntries([...state.censoredByReason.entries()].sort()),
          lagSec: state.moments.count >= 2 ? summarizeRunningMoments(state.moments) : null,
        };
      })
      .sort((left, right) => (
        left.metricId.localeCompare(right.metricId)
        || left.regimeId.localeCompare(right.regimeId)
        || left.shockMagnitudeBps - right.shockMagnitudeBps
      ));
    const supplementaryEstimateSummaries = [...this.#supplementaryStates.values()]
      .map((state): SupplementaryEstimateSummary => ({
        ...state.definition,
        observedCount: state.moments.count,
        missingCount: state.missingCount,
        missingRateBps: missingRateBps(state.moments.count, state.missingCount),
        missingByReason: Object.fromEntries([...state.missingByReason.entries()].sort()),
        estimate: state.moments.count >= 2 ? summarizeRunningMoments(state.moments) : null,
      }))
      .sort((left, right) => (
        left.pairId.localeCompare(right.pairId)
        || left.metricId.localeCompare(right.metricId)
        || (left.windowDays ?? 0) - (right.windowDays ?? 0)
      ));
    const withoutDigest = {
      schemaVersion: 1 as const,
      primaryWindowDays: this.#plan.primaryWindowDays,
      robustnessWindowDays: [...this.#plan.robustnessWindowDays],
      estimateSummaries,
      policyDetectionSummaries,
      supplementaryEstimateSummaries,
      holmAdjustedPrimaryPValues,
    };
    return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
  }
}

export function assertFormalAnalysisReportComplete(report: FormalAnalysisReport): void {
  const { semanticDigestSha256: recordedDigest, ...withoutDigest } = report;
  if (semanticDigestSha256(withoutDigest) !== recordedDigest) {
    throw new Error('FORMAL_REPORT_DIGEST_MISMATCH');
  }
  const hypothesisIds = new Set(report.estimateSummaries.map(({ hypothesisId }) => hypothesisId));
  if ((['H1', 'H2', 'H3', 'H4', 'H5', 'H6'] as const).some((id) => !hypothesisIds.has(id))) {
    throw new Error('FORMAL_REPORT_HYPOTHESIS_COVERAGE_INCOMPLETE');
  }
  const expectedPolicyRows = POLICY_REGIMES.length * 3 * 2;
  if (
    report.policyDetectionSummaries.length !== expectedPolicyRows
    || report.supplementaryEstimateSummaries.length === 0
    || report.estimateSummaries.some((row) => row.observedCount + row.missingCount === 0)
    || report.policyDetectionSummaries.some((row) => row.detectedCount + row.censoredCount === 0)
  ) throw new Error('FORMAL_REPORT_COVERAGE_INCOMPLETE');
}
