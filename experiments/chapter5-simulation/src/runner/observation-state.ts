import type { RiskDisclosure } from '../disclosure/types';
import type { InvestorRiskObservation } from '../observation/types';

function pollKey(observation: InvestorRiskObservation): string {
  return `${observation.investorId}\u0000${observation.fundId}\u0000${observation.observedAt}`;
}

export function mergeRiskObservations(
  index: Map<string, InvestorRiskObservation>,
  incoming: readonly InvestorRiskObservation[],
  disclosures: readonly RiskDisclosure[],
): void {
  const submittedAtBySource = new Map(disclosures.map((disclosure) => [
    disclosure.sourceSubmissionId,
    disclosure.sourceSubmittedAt,
  ]));
  for (const observation of incoming) {
    const submittedAt = submittedAtBySource.get(observation.sourceSubmissionId);
    if (submittedAt === undefined) throw new Error('UNKNOWN_OBSERVATION_DISCLOSURE_SOURCE');
    const key = pollKey(observation);
    const current = index.get(key);
    if (!current) {
      index.set(key, observation);
      continue;
    }
    const currentSubmittedAt = submittedAtBySource.get(current.sourceSubmissionId);
    if (currentSubmittedAt === undefined) throw new Error('UNKNOWN_EXISTING_OBSERVATION_SOURCE');
    if (
      submittedAt > currentSubmittedAt
      || (
        submittedAt === currentSubmittedAt
        && observation.sourceSubmissionId > current.sourceSubmissionId
      )
    ) index.set(key, observation);
  }
}

export function observationsFromIndex(
  index: ReadonlyMap<string, InvestorRiskObservation>,
): InvestorRiskObservation[] {
  return [...index.values()].sort((left, right) => (
    left.observedAt - right.observedAt
    || left.investorId.localeCompare(right.investorId)
    || left.fundId.localeCompare(right.fundId)
    || left.sourceSubmissionId.localeCompare(right.sourceSubmissionId)
  ));
}
