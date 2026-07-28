import {
  DisclosureAudience,
  TRANSPARENCY_REGIME_IDS,
  TransparencyRegimeId,
  getTransparencyRegime,
} from '../risk/regimes';
import { LifecycleEvent, eventDisclosureTimeFor, sortLifecycleEvents } from '../audit/lifecycle';
import { MAX_BPS, RED_SCORE_BPS, YELLOW_SCORE_BPS } from '../risk/calc';

export type DetectionScenario = {
  scenarioId: string;
  fundId: `0x${string}`;
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
  censorReason: 'not_disclosed' | 'threshold_not_identifiable' | null;
};

export type DetectionLagAnalysis = {
  scenario: DetectionScenario;
  anchor: {
    eventId: string;
    eventName: 'RiskMetricsSubmitted';
    fundId: `0x${string}`;
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
  if (!/^0x[0-9a-fA-F]{64}$/.test(scenario.fundId)) throw new Error('INVALID_SCENARIO_FUND_ID');
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

function sameFundId(a: `0x${string}`, b: `0x${string}`): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function publicThresholdIsIdentifiable(
  granularity: 'aggregate' | 'detailed' | 'tiered',
  thresholdBps: number,
): boolean {
  return granularity === 'detailed'
    || thresholdBps === YELLOW_SCORE_BPS
    || thresholdBps === RED_SCORE_BPS;
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
    return sameFundId(event.fundId, scenario.fundId)
      && event.occurredAt >= scenario.shockAt
      && event.submittedAt >= scenario.shockAt
      && riskScoreBps !== null
      && riskScoreBps >= scenario.detectionThresholdBps;
  });
  if (!anchorEvent) throw new Error('DETECTION_EVENT_NOT_FOUND');

  const riskScoreBps = riskScoreFor(anchorEvent) as number;
  const rows = TRANSPARENCY_REGIME_IDS.flatMap((regimeId) => {
    const regime = getTransparencyRegime(regimeId);
    return AUDIENCES.map((audience): DetectionLagRow => {
      if (
        audience === 'public'
        && !publicThresholdIsIdentifiable(regime.granularity, scenario.detectionThresholdBps)
      ) {
        return {
          regime: regimeId,
          audience,
          disclosedAt: null,
          observedAt: null,
          disclosureDetectionLagSec: null,
          observationDetectionLagSec: null,
          censored: true,
          censorReason: 'threshold_not_identifiable',
        };
      }
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
          censorReason: 'not_disclosed',
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
        censorReason: null,
      };
    });
  });

  return {
    scenario,
    anchor: {
      eventId: anchorEvent.eventId,
      eventName: 'RiskMetricsSubmitted',
      fundId: anchorEvent.fundId,
      riskScoreBps,
      occurredAt: anchorEvent.occurredAt,
      submittedAt: anchorEvent.submittedAt,
    },
    systemDetectionLagSec: anchorEvent.submittedAt - scenario.shockAt,
    rows,
  };
}
