import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ControlTransition,
  disclosedControlState,
  latestControlTransition,
  latestControlTransitionIsDisclosed,
} from './control-state';
import { TRANSPARENCY_REGIMES } from './regimes';

const txA = `0x${'1'.repeat(64)}` as const;
const txB = `0x${'2'.repeat(64)}` as const;

const triggered: ControlTransition = {
  eventName: 'GateTriggered',
  gated: true,
  occurredAt: 900,
  submittedAt: 1_000,
  transactionHash: txA,
  blockNumber: 10,
  logIndex: 2,
};

const released: ControlTransition = {
  eventName: 'GateReleased',
  gated: false,
  occurredAt: 2_000,
  submittedAt: 2_000,
  transactionHash: txB,
  blockNumber: 20,
  logIndex: 1,
};

test('selects the latest control transition by chain order rather than array order', () => {
  assert.deepEqual(latestControlTransition([released, triggered]), released);
});

test('R3 uses real control event time and preserves the last disclosed state', () => {
  const regime = TRANSPARENCY_REGIMES.R3;
  const gateDisclosedAt = triggered.submittedAt + regime.delaySec;
  const releaseDisclosedAt = released.submittedAt + regime.delaySec;

  assert.equal(disclosedControlState([released, triggered], regime, gateDisclosedAt - 1), false);
  assert.equal(disclosedControlState([released, triggered], regime, gateDisclosedAt), true);
  assert.equal(disclosedControlState([released, triggered], regime, releaseDisclosedAt - 1), true);
  assert.equal(disclosedControlState([released, triggered], regime, releaseDisclosedAt), false);
});

test('reports whether the latest control transition has reached its policy disclosure time', () => {
  const regime = TRANSPARENCY_REGIMES.R3;

  assert.equal(latestControlTransitionIsDisclosed([], regime, 0), true);
  assert.equal(latestControlTransitionIsDisclosed([triggered], regime, 1_000), false);
  assert.equal(
    latestControlTransitionIsDisclosed([triggered], regime, 1_000 + regime.delaySec),
    true,
  );
});
