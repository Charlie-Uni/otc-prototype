import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ControlTransition,
  disclosedControlState,
  latestControlTransition,
  latestDisclosedControlTransition,
} from './control-state';
import { TRANSPARENCY_REGIMES, buildPublicRiskPayload } from './regimes';

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

test('selects the latest transition that has reached its policy disclosure time', () => {
  const regime = TRANSPARENCY_REGIMES.R3;

  assert.equal(latestDisclosedControlTransition([], regime, 0), null);
  assert.equal(latestDisclosedControlTransition([triggered], regime, 1_000), null);
  assert.deepEqual(
    latestDisclosedControlTransition([triggered], regime, 1_000 + regime.delaySec),
    triggered,
  );
});

test('R3 public view retains a disclosed gate until the release reaches its boundary', () => {
  const regime = TRANSPARENCY_REGIMES.R3;
  const observedAt = released.submittedAt + regime.delaySec - 1;
  const latestVisible = latestDisclosedControlTransition([released, triggered], regime, observedAt);
  const view = buildPublicRiskPayload({
    regime,
    snapshot: {
      metrics: {
        valuationHaircutBps: 1_000,
        redemptionPressureBps: 1_000,
        redemptionQueueRatioBps: 1_000,
        liquidityShortfallBps: 1_000,
        stalePricingRiskBps: 1_000,
        investorConcentrationBps: 1_000,
      },
      riskScoreBps: 1_000,
      kappaBps: 7_000,
      occurredAt: 1_000,
      submittedAt: 1_000,
      payloadHash: txA,
    },
    observedAt,
    disclosedAt: triggered.submittedAt + regime.delaySec,
    visibleGated: disclosedControlState([released, triggered], regime, observedAt),
    latestVisibleControlEventName: latestVisible?.eventName ?? null,
  }) as Record<string, unknown>;

  assert.equal(view.controlDisclosed, true);
  assert.equal(view.gated, true);
  assert.equal(view.riskLevel, 'red');
});
