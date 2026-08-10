import {
  controlDisclosureAllowedFor,
  disclosureTimeFor,
  regulatorUsesDisclosureBoundary,
  type DisclosureAudience,
  type TransparencyRegime,
} from '../artifact/risk/regimes';
import type { GateTransitionState } from '../state/types';
import type { ControlDisclosure } from './types';

export function createControlDisclosure(
  transition: GateTransitionState,
  regime: TransparencyRegime,
  audience: DisclosureAudience,
): ControlDisclosure | null {
  const allowed = controlDisclosureAllowedFor(regime, {
    audience,
    currentGated: transition.kind === 'GateTriggered',
    riskScoreBps: transition.riskScoreBps,
    eventName: transition.kind,
  });
  if (!allowed) return null;

  const usesBoundary = audience === 'public' || regulatorUsesDisclosureBoundary(regime);
  return {
    transitionId: transition.transitionId,
    fundId: transition.fundId,
    regimeId: regime.id,
    audience,
    kind: transition.kind,
    sourceSubmissionId: transition.sourceSubmissionId,
    sourceTransitionedAt: transition.transitionedAt,
    disclosedAt: usesBoundary
      ? disclosureTimeFor(transition.transitionedAt, regime)
      : transition.transitionedAt,
    riskScoreBps: transition.riskScoreBps,
  };
}

export function createControlDisclosureTimeline(
  transitions: readonly GateTransitionState[],
  regime: TransparencyRegime,
  audience: DisclosureAudience,
): ControlDisclosure[] {
  return transitions
    .map((transition) => createControlDisclosure(transition, regime, audience))
    .filter((value): value is ControlDisclosure => value !== null)
    .sort((left, right) => (
      left.disclosedAt - right.disclosedAt
      || left.fundId.localeCompare(right.fundId)
      || left.sourceTransitionedAt - right.sourceTransitionedAt
      || left.transitionId.localeCompare(right.transitionId)
    ));
}

export function latestDistressControlDisclosures(
  disclosures: readonly ControlDisclosure[],
): ControlDisclosure[] {
  const latestByFund = new Map<string, ControlDisclosure>();
  for (const disclosure of disclosures) latestByFund.set(disclosure.fundId, disclosure);
  return [...latestByFund.values()]
    .filter(({ kind }) => kind === 'GateTriggered')
    .sort((left, right) => left.fundId.localeCompare(right.fundId));
}
