import { RED_SCORE_BPS, RiskMetrics, YELLOW_SCORE_BPS, riskLevelFor } from './calc';

export const TRANSPARENCY_REGIME_IDS = ['R0', 'R1', 'R2', 'R3', 'R4'] as const;

export type TransparencyRegimeId = typeof TRANSPARENCY_REGIME_IDS[number];
export type VisibilityMode = 'public' | 'role_based' | 'tiered';
export type GranularityMode = 'aggregate' | 'detailed' | 'tiered';
export type ControlDisclosureMode = 'public' | 'private' | 'delayed' | 'tiered';
export type DisclosureAudience = 'public' | 'regulator';

export type TransparencyRegime = {
  id: TransparencyRegimeId;
  label: string;
  frequencySec: number;
  visibility: VisibilityMode;
  granularity: GranularityMode;
  delaySec: number;
  controlDisclosure: ControlDisclosureMode;
};

export type PublicRiskSnapshot = {
  metrics: RiskMetrics;
  riskScoreBps: number;
  kappaBps: number;
  occurredAt: number;
  submittedAt: number;
  payloadHash: `0x${string}`;
};

export type PublicRiskViewArgs = {
  regime: TransparencyRegime;
  snapshot: PublicRiskSnapshot;
  observedAt: number;
  disclosedAt: number;
  visibleGated: boolean;
  latestVisibleControlEventName: 'GateTriggered' | 'GateReleased' | null;
};

export type PublicRiskUnavailableArgs = {
  regime: TransparencyRegime;
  observedAt: number;
  notYetDisclosed: boolean;
};

export type RegulatorRiskViewArgs = {
  fundId: `0x${string}`;
  regime: TransparencyRegime;
  snapshot: PublicRiskSnapshot;
  observedAt: number;
  disclosedAt: number;
  visibleGated: boolean;
};

export type RegulatorRiskUnavailableArgs = {
  fundId: `0x${string}`;
  regime: TransparencyRegime;
  observedAt: number;
  notYetDisclosed: boolean;
};

const DAY_SEC = 24 * 60 * 60;
const WEEK_SEC = 7 * DAY_SEC;

export const TRANSPARENCY_REGIMES: Record<TransparencyRegimeId, TransparencyRegime> = {
  R0: {
    id: 'R0',
    label: 'low_frequency_disclosure',
    frequencySec: WEEK_SEC,
    visibility: 'public',
    granularity: 'aggregate',
    delaySec: 0,
    controlDisclosure: 'delayed',
  },
  R1: {
    id: 'R1',
    label: 'fully_real_time_public',
    frequencySec: 0,
    visibility: 'public',
    granularity: 'detailed',
    delaySec: 0,
    controlDisclosure: 'public',
  },
  R2: {
    id: 'R2',
    label: 'regulator_real_time_investor_aggregate',
    frequencySec: 0,
    visibility: 'role_based',
    granularity: 'aggregate',
    delaySec: 0,
    controlDisclosure: 'private',
  },
  R3: {
    id: 'R3',
    label: 'delayed_public_disclosure',
    frequencySec: 0,
    visibility: 'public',
    granularity: 'detailed',
    delaySec: DAY_SEC,
    controlDisclosure: 'delayed',
  },
  R4: {
    id: 'R4',
    label: 'tiered_lifecycle_transparency',
    frequencySec: 0,
    visibility: 'tiered',
    granularity: 'tiered',
    delaySec: 0,
    controlDisclosure: 'tiered',
  },
};

export function getTransparencyRegime(id: TransparencyRegimeId): TransparencyRegime {
  return TRANSPARENCY_REGIMES[id];
}

export function resolvePublicRegimeId(
  defaultRegimeId: TransparencyRegimeId,
  requestedRegimeId: TransparencyRegimeId | undefined,
  allowQueryOverride: boolean,
): TransparencyRegimeId {
  if (!allowQueryOverride || requestedRegimeId === undefined) {
    return defaultRegimeId;
  }
  return requestedRegimeId;
}

export function regulatorUsesDisclosureBoundary(regime: TransparencyRegime): boolean {
  return regime.visibility === 'public';
}

export function disclosureTimeFor(submittedAt: number, regime: TransparencyRegime): number {
  if (!Number.isInteger(submittedAt) || submittedAt < 0) {
    throw new Error('INVALID_SUBMITTED_AT');
  }

  const delayedAt = submittedAt + regime.delaySec;
  if (regime.frequencySec <= 0) {
    return delayedAt;
  }

  return Math.ceil(delayedAt / regime.frequencySec) * regime.frequencySec;
}

export function isSnapshotDisclosed(submittedAt: number, regime: TransparencyRegime, observedAt: number): boolean {
  if (!Number.isInteger(observedAt) || observedAt < 0) {
    throw new Error('INVALID_OBSERVED_AT');
  }
  return observedAt >= disclosureTimeFor(submittedAt, regime);
}

export function scoreBandFor(scoreBps: number): 'green' | 'yellow' | 'red' {
  if (scoreBps >= RED_SCORE_BPS) return 'red';
  if (scoreBps >= YELLOW_SCORE_BPS) return 'yellow';
  return 'green';
}

export type ControlDisclosureContext = {
  audience: DisclosureAudience;
  currentGated: boolean;
  riskScoreBps: number;
  eventName: string | null;
};

export function controlDisclosureAllowedFor(
  regime: TransparencyRegime,
  context: ControlDisclosureContext,
): boolean {
  if (context.audience === 'regulator' && regime.visibility !== 'public') {
    return true;
  }

  switch (regime.controlDisclosure) {
    case 'public':
      return true;
    case 'private':
      return false;
    case 'delayed':
      return true;
    case 'tiered':
      return context.currentGated
        || scoreBandFor(context.riskScoreBps) === 'red'
        || context.eventName === 'GateReleased';
  }
}

export function buildPublicRiskPayload(args: PublicRiskViewArgs) {
  const controlDisclosed = controlDisclosureAllowedFor(args.regime, {
    audience: 'public',
    currentGated: args.visibleGated,
    riskScoreBps: args.snapshot.riskScoreBps,
    eventName: args.latestVisibleControlEventName,
  });
  const visibleGated = controlDisclosed ? args.visibleGated : false;
  const riskLevel = riskLevelFor(args.snapshot.riskScoreBps, visibleGated);
  const base = {
    available: true,
    regime: args.regime.id,
    transparency: args.regime,
    riskLevel,
    status: riskLevel,
    controlDisclosed,
    disclosedAt: args.disclosedAt,
    observedAt: args.observedAt,
  };

  const withControl = controlDisclosed
    ? { ...base, gated: args.visibleGated }
    : base;

  if (args.regime.granularity === 'detailed') {
    return {
      ...withControl,
      riskScoreBps: args.snapshot.riskScoreBps,
      kappaBps: args.snapshot.kappaBps,
      occurredAt: args.snapshot.occurredAt,
      submittedAt: args.snapshot.submittedAt,
      metrics: args.snapshot.metrics,
      payloadHash: args.snapshot.payloadHash,
    };
  }

  if (args.regime.granularity === 'tiered') {
    return {
      ...withControl,
      riskScoreBand: scoreBandFor(args.snapshot.riskScoreBps),
    };
  }

  return withControl;
}

export function buildUnavailablePublicRiskPayload(args: PublicRiskUnavailableArgs) {
  return {
    available: false,
    regime: args.regime.id,
    transparency: args.regime,
    notYetDisclosed: args.notYetDisclosed,
    observedAt: args.observedAt,
    status: 'unknown' as const,
    riskLevel: 'unknown' as const,
    controlDisclosed: false,
  };
}

export function buildRegulatorRiskPayload(args: RegulatorRiskViewArgs) {
  const riskLevel = riskLevelFor(args.snapshot.riskScoreBps, args.visibleGated);
  return {
    fundId: args.fundId,
    available: true,
    regime: args.regime.id,
    transparency: args.regime,
    riskLevel,
    status: riskLevel,
    observedAt: args.observedAt,
    disclosedAt: args.disclosedAt,
    gated: args.visibleGated,
    kappaBps: args.snapshot.kappaBps,
    snapshot: args.snapshot,
  };
}

export function buildUnavailableRegulatorRiskPayload(args: RegulatorRiskUnavailableArgs) {
  return {
    fundId: args.fundId,
    available: false,
    regime: args.regime.id,
    transparency: args.regime,
    notYetDisclosed: args.notYetDisclosed,
    observedAt: args.observedAt,
    status: 'unknown' as const,
    riskLevel: 'unknown' as const,
  };
}
