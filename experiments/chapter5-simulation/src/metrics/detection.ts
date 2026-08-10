import type { RiskDisclosure } from '../disclosure/types';
import type { SimulationRunResult } from '../runner/types';
import type { InvestorRiskObservation } from '../observation/types';
import { sameValuationShockScenario } from '../runner/treatment';
import type {
  DetectionLagMetrics,
  DetectionLagOutcome,
  ShockLinkedDetectionLagMetrics,
} from './outcome-types';

function requireDetectionThreshold(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('INVALID_DETECTION_THRESHOLD');
  }
}

function detected(
  detectedAt: number,
  shockAt: number,
  sourceSubmissionId: string,
): DetectionLagOutcome {
  if (detectedAt < shockAt) throw new Error('DETECTION_PRECEDES_SHOCK');
  return {
    status: 'detected',
    detectedAt,
    lagSec: detectedAt - shockAt,
    sourceSubmissionId,
  };
}

function earliestIdentifiableDisclosure(
  disclosures: readonly RiskDisclosure[],
  detectedSubmissionIds: ReadonlySet<string>,
  fundId: string,
): RiskDisclosure | undefined {
  return disclosures
    .filter((value) => value.fundId === fundId
      && detectedSubmissionIds.has(value.sourceSubmissionId)
      && value.thresholdIdentifiable)
    .sort((left, right) => (
      left.disclosedAt - right.disclosedAt
      || left.sourceSubmissionId.localeCompare(right.sourceSubmissionId)
    ))[0];
}

function disclosureLag(
  disclosures: readonly RiskDisclosure[],
  detectedSubmissionIds: ReadonlySet<string>,
  fundId: string,
  shockAt: number,
): DetectionLagOutcome {
  const identifiable = earliestIdentifiableDisclosure(
    disclosures,
    detectedSubmissionIds,
    fundId,
  );
  if (identifiable) {
    return detected(identifiable.disclosedAt, shockAt, identifiable.sourceSubmissionId);
  }
  const hasUnidentifiableDisclosure = disclosures.some((value) => (
    value.fundId === fundId
    && detectedSubmissionIds.has(value.sourceSubmissionId)
    && !value.thresholdIdentifiable
  ));
  return {
    status: 'censored',
    reason: hasUnidentifiableDisclosure
      ? 'threshold_not_identifiable'
      : 'not_disclosed_within_horizon',
  };
}

function observationLag(
  observations: readonly InvestorRiskObservation[],
  publicDisclosures: readonly RiskDisclosure[],
  detectedSubmissionIds: ReadonlySet<string>,
  fundId: string,
  shockAt: number,
  horizonEndAt: number,
): DetectionLagOutcome {
  const observation = observations
    .filter((value) => value.fundId === fundId
      && detectedSubmissionIds.has(value.sourceSubmissionId)
      && value.thresholdIdentifiable
      && value.observedAt < horizonEndAt)
    .sort((left, right) => (
      left.observedAt - right.observedAt
      || left.investorId.localeCompare(right.investorId)
      || left.sourceSubmissionId.localeCompare(right.sourceSubmissionId)
    ))[0];
  if (observation) return detected(observation.observedAt, shockAt, observation.sourceSubmissionId);
  const disclosure = disclosureLag(
    publicDisclosures,
    detectedSubmissionIds,
    fundId,
    shockAt,
  );
  if (disclosure.status === 'censored') return disclosure;
  return { status: 'censored', reason: 'not_observed_within_horizon' };
}

export function regulatorDetectionLagForThreshold(
  result: SimulationRunResult,
  detectionThresholdBps: number,
): DetectionLagOutcome {
  requireDetectionThreshold(detectionThresholdBps);
  const { targetFundId: fundId, shockAt } = result.scenario;
  const eligibleSnapshots = result.finalState.oracleRiskSnapshots
    .filter((snapshot) => (
      snapshot.fundId === fundId
      && snapshot.submittedAt >= shockAt
    ));
  const detectedSnapshots = eligibleSnapshots.filter((snapshot) => (
    snapshot.riskScoreBps >= detectionThresholdBps
  ));
  if (detectedSnapshots.length === 0) {
    return {
      status: 'censored',
      reason: eligibleSnapshots.length === 0
        ? 'no_successful_submission'
        : 'threshold_not_crossed',
    };
  }
  return disclosureLag(
    result.regulatorRiskDisclosures,
    new Set(detectedSnapshots.map(({ submissionId }) => submissionId)),
    fundId,
    shockAt,
  );
}

export function pairedValuationShockDetectionLagMetrics(
  shocked: SimulationRunResult,
  noShock: SimulationRunResult,
): ShockLinkedDetectionLagMetrics {
  if (!shocked.shockEnabled || noShock.shockEnabled) {
    throw new Error('INVALID_SHOCK_LINKED_PAIR_ARMS');
  }
  if (!sameValuationShockScenario(shocked.scenario, noShock.scenario)
    || shocked.configDigestSha256 !== noShock.configDigestSha256
    || shocked.regime.id !== noShock.regime.id) {
    throw new Error('SHOCK_LINKED_PAIR_MISMATCH');
  }
  const { targetFundId: fundId, shockAt } = shocked.scenario;
  const eligibleSnapshots = shocked.finalState.oracleRiskSnapshots
    .filter((snapshot) => snapshot.fundId === fundId && snapshot.submittedAt >= shockAt)
    .sort((left, right) => (
      left.submittedAt - right.submittedAt
      || left.submissionId.localeCompare(right.submissionId)
    ));
  const noShockByTick = new Map(noShock.finalState.oracleRiskSnapshots
    .filter((snapshot) => snapshot.fundId === fundId && snapshot.submittedAt >= shockAt)
    .map((snapshot) => [snapshot.tick, snapshot]));
  const detectedSnapshots = eligibleSnapshots.filter((snapshot) => {
    const counterfactual = noShockByTick.get(snapshot.tick);
    return counterfactual !== undefined
      && snapshot.metrics.valuationHaircutBps
        > counterfactual.metrics.valuationHaircutBps;
  });
  const first = detectedSnapshots[0];
  if (!first) {
    const censored = {
      status: 'censored',
      reason: eligibleSnapshots.length === 0
        ? 'no_successful_submission'
        : 'shock_metric_not_observed',
    } as const;
    return {
      fundId,
      shockAt,
      anchor: 'paired_valuation_haircut_increase',
      system: censored,
      regulatorDisclosure: censored,
    };
  }
  const ids = new Set(detectedSnapshots.map(({ submissionId }) => submissionId));
  return {
    fundId,
    shockAt,
    anchor: 'paired_valuation_haircut_increase',
    system: detected(first.submittedAt, shockAt, first.submissionId),
    regulatorDisclosure: disclosureLag(
      shocked.regulatorRiskDisclosures,
      ids,
      fundId,
      shockAt,
    ),
  };
}

export function detectionLagMetrics(result: SimulationRunResult): DetectionLagMetrics {
  const { targetFundId: fundId, shockAt } = result.scenario;
  const horizonEndAt = shockAt + result.horizonDays * 86_400;
  const targetSnapshots = result.finalState.oracleRiskSnapshots
    .filter((snapshot) => snapshot.fundId === fundId);
  const detectedSnapshots = targetSnapshots
    .filter((snapshot) => (
      snapshot.submittedAt >= shockAt
      && snapshot.detected
    ))
    .sort((left, right) => (
      left.submittedAt - right.submittedAt
      || left.submissionId.localeCompare(right.submissionId)
    ));
  const first = detectedSnapshots[0];
  if (!first) {
    const censored = {
      status: 'censored',
      reason: targetSnapshots.length === 0
        ? 'no_successful_submission'
        : 'threshold_not_crossed',
    } as const;
    return {
      fundId,
      shockAt,
      system: censored,
      regulatorDisclosure: censored,
      publicDisclosure: censored,
      publicObservation: censored,
    };
  }
  const ids = new Set(detectedSnapshots.map(({ submissionId }) => submissionId));
  return {
    fundId,
    shockAt,
    system: detected(first.submittedAt, shockAt, first.submissionId),
    regulatorDisclosure: disclosureLag(
      result.regulatorRiskDisclosures,
      ids,
      fundId,
      shockAt,
    ),
    publicDisclosure: disclosureLag(
      result.publicRiskDisclosures,
      ids,
      fundId,
      shockAt,
    ),
    publicObservation: observationLag(
      result.riskObservations,
      result.publicRiskDisclosures,
      ids,
      fundId,
      shockAt,
      horizonEndAt,
    ),
  };
}

export function detectionBenefitSec(
  r0: DetectionLagOutcome,
  treatment: DetectionLagOutcome,
): number | null {
  if (r0.status === 'censored' || treatment.status === 'censored') return null;
  return r0.lagSec - treatment.lagSec;
}
