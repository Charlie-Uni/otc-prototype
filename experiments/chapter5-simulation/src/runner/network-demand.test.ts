import assert from 'node:assert/strict';
import test from 'node:test';
import type { InvestorRedemptionEvaluation } from '../behavior/types';
import { applyIncomingSpilloverToDecision } from './network-demand';

function evaluation(probability: number, randomDraw: number): InvestorRedemptionEvaluation {
  return {
    expectedOthersRedeemBps: 0,
    probabilityInput: {
      perceivedRiskBps: 0,
      publicnessBps: 0,
      signalSynchronicityBps: 0,
      expectedOthersRedeemBps: 0,
      firstMoverAdvantageBps: 0,
    },
    decision: { probability, randomDraw, redeem: randomDraw < probability },
  };
}

test('adds fund-level spillover without consuming a second random draw', () => {
  const result = applyIncomingSpilloverToDecision(evaluation(0.2, 0.25), 1_000);
  assert.equal(result.baseProbability, 0.2);
  assert.ok(Math.abs(result.decision.probability - 0.3) < Number.EPSILON);
  assert.equal(result.decision.randomDraw, 0.25);
  assert.equal(result.decision.redeem, true);
});

test('caps probability and rejects invalid spillover values', () => {
  assert.equal(
    applyIncomingSpilloverToDecision(evaluation(0.9, 0.99), 5_000).decision.probability,
    1,
  );
  assert.throws(
    () => applyIncomingSpilloverToDecision(evaluation(0.2, 0.3), 10_001),
    /INVALID_INCOMING_SPILLOVER_REDEMPTION_BPS/,
  );
});
