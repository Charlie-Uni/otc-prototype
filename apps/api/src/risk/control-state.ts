import { TransparencyRegime, disclosureTimeFor } from './regimes';

export type ControlTransition = {
  eventName: 'GateTriggered' | 'GateReleased';
  gated: boolean;
  occurredAt: number;
  submittedAt: number;
  transactionHash: `0x${string}`;
  blockNumber: number;
  logIndex: number;
};

export function sortControlTransitions(transitions: readonly ControlTransition[]): ControlTransition[] {
  return [...transitions].sort((left, right) => (
    left.blockNumber - right.blockNumber || left.logIndex - right.logIndex
  ));
}

export function latestControlTransition(
  transitions: readonly ControlTransition[],
): ControlTransition | null {
  return sortControlTransitions(transitions).at(-1) ?? null;
}

export function latestDisclosedControlTransition(
  transitions: readonly ControlTransition[],
  regime: TransparencyRegime,
  observedAt: number,
): ControlTransition | null {
  return sortControlTransitions(transitions)
    .filter((transition) => observedAt >= disclosureTimeFor(transition.submittedAt, regime))
    .at(-1) ?? null;
}

export function disclosedControlState(
  transitions: readonly ControlTransition[],
  regime: TransparencyRegime,
  observedAt: number,
): boolean {
  return latestDisclosedControlTransition(transitions, regime, observedAt)?.gated ?? false;
}
