import {
  DisclosureAudience,
  TRANSPARENCY_REGIME_IDS,
  TransparencyRegimeId,
  getTransparencyRegime,
} from '../risk/regimes';
import { LifecycleEvent, eventDisclosureTimeFor, sortLifecycleEvents } from '../audit/lifecycle';
import { MAX_BPS } from '../risk/calc';

export type DetectionScenario = {
  scenarioId: string;
  shockAt: number;
  detectionThresholdBps: number;
  observationStartAt: number;
  pollingIntervalSec: number;
};

export type DetectionLagRow = {
  regime: TransparencyRegimeId;
  audience: DisclosureAudience;
  disclosedAt: number | null;
  observedAt: number | null;
  disclosureDetectionLagSec: number | null;
  observationDetectionLagSec: number | null;
  censored: boolean;
};

export type DetectionLagAnalysis = {
  scenario: DetectionScenario;
  anchor: {
    eventId: string;
    eventName: 'RiskMetricsSubmitted';
    riskScoreBps: number;
    occurredAt: number;
    submittedAt: number;
  };
  systemDetectionLagSec: number;
  rows: DetectionLagRow[];
};

const AUDIENCES: readonly DisclosureAudience[] = ['public', 'regulator'];

function riskScoreFor(event: LifecycleEvent): number | null {
  if (event.eventName !== 'RiskMetricsSubmitted') return null;
  const score = Number(event.payload.riskScoreBps);
  return Number.isInteger(score) && score >= 0 && score <= MAX_BPS ? score : null;
}

function validateScenario(scenario: DetectionScenario): void {
  if (!scenario.scenarioId.trim()) throw new Error('INVALID_SCENARIO_ID');
  if (!Number.isInteger(scenario.shockAt) || scenario.shockAt <= 0) throw new Error('INVALID_SHOCK_AT');
  if (
    !Number.isInteger(scenario.detectionThresholdBps)
    || scenario.detectionThresholdBps < 0
    || scenario.detectionThresholdBps > MAX_BPS
  ) {
    throw new Error('INVALID_DETECTION_THRESHOLD');
  }
  if (!Number.isInteger(scenario.observationStartAt) || scenario.observationStartAt < scenario.shockAt) {
    throw new Error('INVALID_OBSERVATION_START');
  }
  if (!Number.isInteger(scenario.pollingIntervalSec) || scenario.pollingIntervalSec <= 0) {
    throw new Error('INVALID_POLLING_INTERVAL');
  }
}

export function firstScheduledObservationAt(
  disclosedAt: number,
  observationStartAt: number,
  pollingIntervalSec: number,
): number {
  if (disclosedAt <= observationStartAt) return observationStartAt;
  const intervals = Math.ceil((disclosedAt - observationStartAt) / pollingIntervalSec);
  return observationStartAt + intervals * pollingIntervalSec;
}

export function analyzeDetectionLags(
  events: readonly LifecycleEvent[],
  scenario: DetectionScenario,
): DetectionLagAnalysis {
  validateScenario(scenario);
  const anchorEvent = sortLifecycleEvents(events).find((event) => {
    const riskScoreBps = riskScoreFor(event);
    return event.submittedAt >= scenario.shockAt
      && riskScoreBps !== null
      && riskScoreBps >= scenario.detectionThresholdBps;
  });
  if (!anchorEvent) throw new Error('DETECTION_EVENT_NOT_FOUND');

  const riskScoreBps = riskScoreFor(anchorEvent) as number;
  const rows = TRANSPARENCY_REGIME_IDS.flatMap((regimeId) => {
    const regime = getTransparencyRegime(regimeId);
    return AUDIENCES.map((audience): DetectionLagRow => {
      const disclosedAt = eventDisclosureTimeFor(anchorEvent, regime, audience);
      if (disclosedAt === null) {
        return {
          regime: regimeId,
          audience,
          disclosedAt: null,
          observedAt: null,
          disclosureDetectionLagSec: null,
          observationDetectionLagSec: null,
          censored: true,
        };
      }
      const observedAt = firstScheduledObservationAt(
        disclosedAt,
        scenario.observationStartAt,
        scenario.pollingIntervalSec,
      );
      return {
        regime: regimeId,
        audience,
        disclosedAt,
        observedAt,
        disclosureDetectionLagSec: disclosedAt - scenario.shockAt,
        observationDetectionLagSec: observedAt - scenario.shockAt,
        censored: false,
      };
    });
  });

  return {
    scenario,
    anchor: {
      eventId: anchorEvent.eventId,
      eventName: 'RiskMetricsSubmitted',
      riskScoreBps,
      occurredAt: anchorEvent.occurredAt,
      submittedAt: anchorEvent.submittedAt,
    },
    systemDetectionLagSec: anchorEvent.submittedAt - scenario.shockAt,
    rows,
  };
}
