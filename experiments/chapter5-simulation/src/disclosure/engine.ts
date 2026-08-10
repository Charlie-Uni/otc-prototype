import { MAX_BPS } from '../artifact/risk/calc';
import {
  disclosureTimeFor,
  getTransparencyRegime,
  regulatorUsesDisclosureBoundary,
  scoreBandFor,
  type DisclosureAudience,
  type TransparencyRegime,
} from '../artifact/risk/regimes';
import { publicThresholdIsIdentifiable } from '../artifact/simulation/observation';
import type { OracleRiskSnapshot } from '../state/types';
import type { RiskDisclosure, RiskSignalBand, VisibleRiskSignal } from './types';

const BAND_MIDPOINT_BPS: Record<RiskSignalBand, number> = {
  green: 2_000,
  yellow: 5_000,
  red: 8_000,
};

function requireThreshold(thresholdBps: number): void {
  if (!Number.isInteger(thresholdBps) || thresholdBps < 0 || thresholdBps > MAX_BPS) {
    throw new Error('INVALID_DISCLOSURE_THRESHOLD');
  }
}

function visibleSignalFor(
  snapshot: OracleRiskSnapshot,
  regime: TransparencyRegime,
  audience: DisclosureAudience,
): VisibleRiskSignal {
  const band = scoreBandFor(snapshot.riskScoreBps);
  if (audience === 'regulator' || regime.granularity === 'detailed') {
    return { kind: 'exact', valueBps: snapshot.riskScoreBps, band };
  }
  return { kind: 'band', valueBps: BAND_MIDPOINT_BPS[band], band };
}

export function createRiskDisclosure(
  snapshot: OracleRiskSnapshot,
  regime: TransparencyRegime,
  audience: DisclosureAudience,
  thresholdBps: number,
): RiskDisclosure {
  requireThreshold(thresholdBps);
  const usesBoundary = audience === 'public' || regulatorUsesDisclosureBoundary(regime);
  const disclosedAt = usesBoundary
    ? disclosureTimeFor(snapshot.submittedAt, regime)
    : snapshot.submittedAt;
  if (!Number.isSafeInteger(disclosedAt) || disclosedAt < 0) {
    throw new Error('INVALID_DISCLOSURE_TIME');
  }
  return {
    sourceSubmissionId: snapshot.submissionId,
    fundId: snapshot.fundId,
    regimeId: regime.id,
    audience,
    sourceOccurredAt: snapshot.occurredAt,
    sourceSubmittedAt: snapshot.submittedAt,
    disclosedAt,
    thresholdBps,
    thresholdIdentifiable: audience === 'regulator'
      || publicThresholdIsIdentifiable(regime.granularity, thresholdBps),
    signal: visibleSignalFor(snapshot, regime, audience),
  };
}

export function createRiskDisclosureTimeline(
  snapshots: readonly OracleRiskSnapshot[],
  regimeId: RiskDisclosure['regimeId'],
  audience: DisclosureAudience,
  thresholdBps: number,
): RiskDisclosure[] {
  return createRiskDisclosureTimelineForRegime(
    snapshots,
    getTransparencyRegime(regimeId),
    audience,
    thresholdBps,
  );
}

export function createRiskDisclosureTimelineForRegime(
  snapshots: readonly OracleRiskSnapshot[],
  regime: TransparencyRegime,
  audience: DisclosureAudience,
  thresholdBps: number,
): RiskDisclosure[] {
  const latestByFundAndBoundary = new Map<string, RiskDisclosure>();

  for (const snapshot of snapshots) {
    const disclosure = createRiskDisclosure(snapshot, regime, audience, thresholdBps);
    const key = `${disclosure.fundId}\u0000${disclosure.disclosedAt}`;
    const current = latestByFundAndBoundary.get(key);
    if (
      !current
      || disclosure.sourceSubmittedAt > current.sourceSubmittedAt
      || (
        disclosure.sourceSubmittedAt === current.sourceSubmittedAt
        && disclosure.sourceSubmissionId > current.sourceSubmissionId
      )
    ) {
      latestByFundAndBoundary.set(key, disclosure);
    }
  }

  return [...latestByFundAndBoundary.values()].sort((left, right) => (
    left.disclosedAt - right.disclosedAt
    || left.fundId.localeCompare(right.fundId)
    || left.sourceSubmittedAt - right.sourceSubmittedAt
    || left.sourceSubmissionId.localeCompare(right.sourceSubmissionId)
  ));
}
