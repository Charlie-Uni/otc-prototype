import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drawRedemptionDecision,
  evaluateInvestorRedemption,
  redemptionLogOdds,
  redemptionProbability,
} from './redemption';
import { initializeInvestorRiskBelief } from './beliefs';
import type {
  RedemptionBehaviorCoefficients,
  RedemptionDecisionIdentity,
  RedemptionProbabilityInput,
} from './types';

const coefficients: RedemptionBehaviorCoefficients = {
  interceptLogOdds: -4.59511985013459,
  perceivedRisk: 1,
  publicness: 0.25,
  signalSynchronicity: 0.5,
  expectedOthersRedeem: 1,
  firstMoverAdvantage: 1,
};

const zeroInput: RedemptionProbabilityInput = {
  perceivedRiskBps: 0,
  publicnessBps: 0,
  signalSynchronicityBps: 0,
  expectedOthersRedeemBps: 0,
  firstMoverAdvantageBps: 0,
};

const identity: RedemptionDecisionIdentity = {
  masterSeed: 20260813n,
  replicateId: 4,
  investorId: 'investor-001',
  fundId: 'fund-001',
  tick: 7,
};

test('implements the logistic probability with the pilot zero-input intercept', () => {
  assert.equal(redemptionLogOdds(zeroInput, coefficients), coefficients.interceptLogOdds);
  assert.ok(Math.abs(redemptionProbability(zeroInput, coefficients) - 0.01) < 1e-14);
});

test('positive coefficients make every behavioral primitive locally monotone', () => {
  const baseline = redemptionProbability(zeroInput, coefficients);
  const variants: RedemptionProbabilityInput[] = [
    { ...zeroInput, perceivedRiskBps: 1_000 },
    { ...zeroInput, publicnessBps: 10_000 },
    { ...zeroInput, signalSynchronicityBps: 1_000 },
    { ...zeroInput, expectedOthersRedeemBps: 1_000 },
    { ...zeroInput, firstMoverAdvantageBps: 1_000 },
  ];
  variants.forEach((variant) => assert.ok(redemptionProbability(variant, coefficients) > baseline));
});

test('uses a fixed counter-based draw across paired behavior inputs', () => {
  const low = drawRedemptionDecision(zeroInput, coefficients, identity);
  const high = drawRedemptionDecision({
    perceivedRiskBps: 10_000,
    publicnessBps: 10_000,
    signalSynchronicityBps: 10_000,
    expectedOthersRedeemBps: 10_000,
    firstMoverAdvantageBps: 10_000,
  }, coefficients, identity);
  assert.equal(low.randomDraw, high.randomDraw);
  assert.ok(high.probability > low.probability);
  assert.notEqual(
    drawRedemptionDecision(zeroInput, coefficients, { ...identity, tick: identity.tick + 1 }).randomDraw,
    low.randomDraw,
  );
});

test('wires an unknown prior into behavior without manufacturing a public signal', () => {
  const belief = initializeInvestorRiskBelief('investor-001', 'fund-001', 2_000);
  const evaluation = evaluateInvestorRedemption(
    belief,
    5_000,
    1_000,
    0,
    [4_000, 3_000, 3_000],
    coefficients,
    identity,
  );
  assert.equal(evaluation.expectedOthersRedeemBps, 1_800);
  assert.deepEqual(evaluation.probabilityInput, {
    perceivedRiskBps: 2_000,
    publicnessBps: 0,
    signalSynchronicityBps: 5_000,
    expectedOthersRedeemBps: 1_800,
    firstMoverAdvantageBps: 0,
  });
  assert.equal(evaluation.decision.randomDraw, drawRedemptionDecision(
    evaluation.probabilityInput,
    coefficients,
    identity,
  ).randomDraw);
});

test('rejects an investor-fund belief joined to another decision identity', () => {
  const belief = initializeInvestorRiskBelief('investor-002', 'fund-001', 2_000);
  assert.throws(
    () => evaluateInvestorRedemption(
      belief,
      0,
      0,
      0,
      [4_000, 3_000, 3_000],
      coefficients,
      identity,
    ),
    /REDEMPTION_BELIEF_IDENTITY_MISMATCH/,
  );
});

test('keeps probabilities finite at supported coefficient boundaries', () => {
  const high = redemptionProbability({
    perceivedRiskBps: 10_000,
    publicnessBps: 10_000,
    signalSynchronicityBps: 10_000,
    expectedOthersRedeemBps: 10_000,
    firstMoverAdvantageBps: 10_000,
  }, {
    interceptLogOdds: 20,
    perceivedRisk: 20,
    publicness: 20,
    signalSynchronicity: 20,
    expectedOthersRedeem: 20,
    firstMoverAdvantage: 20,
  });
  assert.ok(high > 0 && high <= 1);
});

test('rejects negative slope coefficients and out-of-range inputs', () => {
  assert.throws(
    () => redemptionProbability(zeroInput, { ...coefficients, publicness: -1 }),
    /INVALID_PUBLICNESS_COEFFICIENT/,
  );
  assert.throws(
    () => redemptionProbability({ ...zeroInput, perceivedRiskBps: 10_001 }, coefficients),
    /INVALID_PERCEIVED_RISK_BPS/,
  );
  assert.throws(
    () => drawRedemptionDecision(zeroInput, coefficients, { ...identity, fundId: '' }),
    /INVALID_DECISION_FUND_ID/,
  );
});
