import assert from 'node:assert/strict';
import test from 'node:test';
import type { RiskDisclosure } from '../disclosure/types';
import type { InvestorRiskObservation } from '../observation/types';
import { mergeRiskObservations, observationsFromIndex } from './observation-state';

function disclosure(sourceSubmissionId: string, sourceSubmittedAt: number): RiskDisclosure {
  return {
    sourceSubmissionId,
    fundId: 'fund-001',
    regimeId: 'R1',
    audience: 'public',
    sourceOccurredAt: sourceSubmittedAt,
    sourceSubmittedAt,
    disclosedAt: sourceSubmittedAt,
    thresholdBps: 6_000,
    thresholdIdentifiable: true,
    signal: { kind: 'exact', valueBps: 5_000, band: 'yellow' },
  };
}

function observation(sourceSubmissionId: string): InvestorRiskObservation {
  return {
    investorId: 'investor-001',
    fundId: 'fund-001',
    regimeId: 'R1',
    sourceSubmissionId,
    disclosedAt: 10,
    observedAt: 20,
    thresholdBps: 6_000,
    thresholdIdentifiable: true,
    signal: { kind: 'exact', valueBps: 5_000, band: 'yellow' },
  };
}

test('keeps only the latest disclosure observed at one investor poll', () => {
  const index = new Map<string, InvestorRiskObservation>();
  const disclosures = [disclosure('older', 10), disclosure('newer', 15)];
  mergeRiskObservations(index, [observation('older')], disclosures);
  mergeRiskObservations(index, [observation('newer')], disclosures);
  assert.deepEqual(observationsFromIndex(index).map(({ sourceSubmissionId }) => (
    sourceSubmissionId
  )), ['newer']);
});

test('fails closed when an observation has no disclosure provenance', () => {
  assert.throws(
    () => mergeRiskObservations(new Map(), [observation('missing')], []),
    /UNKNOWN_OBSERVATION_DISCLOSURE_SOURCE/,
  );
});
