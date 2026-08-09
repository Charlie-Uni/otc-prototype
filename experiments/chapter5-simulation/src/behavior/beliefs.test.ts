import assert from 'node:assert/strict';
import test from 'node:test';
import type { InvestorRiskObservation } from '../observation/types';
import {
  initializeInvestorRiskBelief,
  publicnessBps,
  publicRiskSignalBps,
  updateInvestorRiskBelief,
} from './beliefs';

function observation(overrides: Partial<InvestorRiskObservation> = {}): InvestorRiskObservation {
  return {
    investorId: 'investor-001',
    fundId: 'fund-001',
    regimeId: 'R1',
    sourceSubmissionId: 'submission-001',
    disclosedAt: 100,
    observedAt: 120,
    thresholdBps: 6_000,
    thresholdIdentifiable: true,
    signal: { kind: 'exact', valueBps: 4_200, band: 'yellow' },
    ...overrides,
  };
}

test('uses the initial prior while public information is unknown', () => {
  const prior = initializeInvestorRiskBelief('investor-001', 'fund-001', 2_000);
  const unchanged = updateInvestorRiskBelief(prior, [], 90);
  assert.deepEqual(unchanged, prior);
  assert.equal(publicRiskSignalBps(unchanged), 0);
  assert.equal(publicnessBps(unchanged), 0);
});

test('updates belief from the latest observation available at the decision time', () => {
  const prior = initializeInvestorRiskBelief('investor-001', 'fund-001', 2_000);
  const updated = updateInvestorRiskBelief(prior, [
    observation(),
    observation({
      sourceSubmissionId: 'submission-002',
      disclosedAt: 150,
      observedAt: 180,
      signal: { kind: 'band', valueBps: 8_000, band: 'red' },
    }),
    observation({
      sourceSubmissionId: 'submission-003',
      disclosedAt: 200,
      observedAt: 240,
      signal: { kind: 'exact', valueBps: 9_000, band: 'red' },
    }),
  ], 200);

  assert.equal(updated.perceivedRiskBps, 8_000);
  assert.equal(updated.sourceSignalKind, 'band');
  assert.equal(updated.sourceSubmissionId, 'submission-002');
  assert.equal(updated.lastObservedAt, 180);
  assert.equal(publicRiskSignalBps(updated), 8_000);
  assert.equal(publicnessBps(updated), 10_000);
});

test('does not roll a belief back when an older observation is replayed', () => {
  const prior = initializeInvestorRiskBelief('investor-001', 'fund-001', 2_000);
  const current = updateInvestorRiskBelief(prior, [observation({
    sourceSubmissionId: 'submission-002',
    observedAt: 180,
  })], 200);
  assert.deepEqual(
    updateInvestorRiskBelief(current, [observation({ observedAt: 120 })], 200),
    current,
  );
});

test('fails fast when observations are joined to the wrong investor or fund', () => {
  const prior = initializeInvestorRiskBelief('investor-001', 'fund-001', 2_000);
  assert.throws(
    () => updateInvestorRiskBelief(prior, [observation({ investorId: 'investor-002' })], 200),
    /BELIEF_OBSERVATION_INVESTOR_MISMATCH/,
  );
  assert.throws(
    () => updateInvestorRiskBelief(prior, [observation({ fundId: 'fund-002' })], 200),
    /BELIEF_OBSERVATION_FUND_MISMATCH/,
  );
});

test('rejects impossible observation provenance', () => {
  const prior = initializeInvestorRiskBelief('investor-001', 'fund-001', 2_000);
  assert.throws(
    () => updateInvestorRiskBelief(prior, [observation({ disclosedAt: 121 })], 200),
    /OBSERVATION_BEFORE_DISCLOSURE/,
  );
  assert.throws(
    () => updateInvestorRiskBelief(prior, [observation({ sourceSubmissionId: '' })], 200),
    /INVALID_SOURCE_SUBMISSION_ID/,
  );
});
