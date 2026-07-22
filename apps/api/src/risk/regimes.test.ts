import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSPARENCY_REGIMES,
  buildRegulatorRiskPayload,
  buildPublicRiskPayload,
  buildUnavailablePublicRiskPayload,
  buildUnavailableRegulatorRiskPayload,
  disclosureTimeFor,
  isSnapshotDisclosed,
  regulatorUsesDisclosureBoundary,
  resolvePublicRegimeId,
} from './regimes';

const snapshot = {
  metrics: {
    valuationHaircutBps: 1_200,
    redemptionPressureBps: 1_800,
    redemptionQueueRatioBps: 1_800,
    liquidityShortfallBps: 3_500,
    stalePricingRiskBps: 0,
    investorConcentrationBps: 3_000,
  },
  riskScoreBps: 1_960,
  kappaBps: 7_000,
  occurredAt: 1_000,
  submittedAt: 1_000,
  payloadHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as const,
};

test('R0 uses frequency to defer disclosure to the next low-frequency boundary', () => {
  const disclosedAt = disclosureTimeFor(1, TRANSPARENCY_REGIMES.R0);

  assert.equal(disclosedAt, 7 * 24 * 60 * 60);
  assert.equal(isSnapshotDisclosed(1, TRANSPARENCY_REGIMES.R0, disclosedAt - 1), false);
  assert.equal(isSnapshotDisclosed(1, TRANSPARENCY_REGIMES.R0, disclosedAt), true);
});

test('R1 exposes detailed real-time public risk data and control status', () => {
  const view = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R1,
    snapshot,
    observedAt: 1_000,
    disclosedAt: 1_000,
    currentGated: true,
    latestControlIsDisclosed: true,
    latestControlEventName: 'GateTriggered',
  });

  assert.equal(view.regime, 'R1');
  assert.equal(view.controlDisclosed, true);
  assert.equal((view as any).gated, true);
  assert.equal((view as any).riskScoreBps, 1_960);
  assert.deepEqual((view as any).metrics, snapshot.metrics);
});

test('R0 keeps the public payload aggregate after the low-frequency boundary', () => {
  const view = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R0,
    snapshot,
    observedAt: 7 * 24 * 60 * 60,
    disclosedAt: 7 * 24 * 60 * 60,
    currentGated: true,
    latestControlIsDisclosed: true,
    latestControlEventName: 'GateTriggered',
  }) as Record<string, unknown>;

  assert.equal(view.regime, 'R0');
  assert.equal(TRANSPARENCY_REGIMES.R0.controlDisclosure, 'delayed');
  assert.equal(view.controlDisclosed, true);
  assert.equal(view.gated, true);
  assert.equal(view.riskLevel, 'red');
  assert.equal('riskScoreBps' in view, false);
  assert.equal('metrics' in view, false);
});

test('R2 keeps investor view aggregate and hides private control status', () => {
  const view = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R2,
    snapshot,
    observedAt: 1_000,
    disclosedAt: 1_000,
    currentGated: true,
    latestControlIsDisclosed: true,
    latestControlEventName: 'GateTriggered',
  }) as Record<string, unknown>;

  assert.equal(view.regime, 'R2');
  assert.equal(view.controlDisclosed, false);
  assert.equal(view.riskLevel, 'green');
  assert.equal('gated' in view, false);
  assert.equal('riskScoreBps' in view, false);
  assert.equal('metrics' in view, false);
});

test('R3 delays control disclosure until the policy delay has elapsed', () => {
  const hidden = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R3,
    snapshot,
    observedAt: 1_000,
    disclosedAt: 1_000,
    currentGated: true,
    latestControlIsDisclosed: false,
    latestControlEventName: 'GateTriggered',
  }) as Record<string, unknown>;
  const visible = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R3,
    snapshot,
    observedAt: 1_000 + 24 * 60 * 60,
    disclosedAt: 1_000 + 24 * 60 * 60,
    currentGated: true,
    latestControlIsDisclosed: true,
    latestControlEventName: 'GateTriggered',
  }) as Record<string, unknown>;

  assert.equal(hidden.controlDisclosed, false);
  assert.equal('gated' in hidden, false);
  assert.equal(visible.controlDisclosed, true);
  assert.equal(visible.gated, true);
});

test('R4 provides tiered disclosure without exact metrics but reveals active controls', () => {
  const view = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R4,
    snapshot: { ...snapshot, riskScoreBps: 7_260 },
    observedAt: 1_000,
    disclosedAt: 1_000,
    currentGated: true,
    latestControlIsDisclosed: true,
    latestControlEventName: 'GateTriggered',
  }) as Record<string, unknown>;

  assert.equal(view.regime, 'R4');
  assert.equal(view.controlDisclosed, true);
  assert.equal(view.gated, true);
  assert.equal(view.riskScoreBand, 'red');
  assert.equal('riskScoreBps' in view, false);
  assert.equal('metrics' in view, false);
});

test('R4 hides control status for a green non-gated snapshot', () => {
  const view = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R4,
    snapshot,
    observedAt: 1_000,
    disclosedAt: 1_000,
    currentGated: false,
    latestControlIsDisclosed: true,
    latestControlEventName: null,
  }) as Record<string, unknown>;

  assert.equal(view.regime, 'R4');
  assert.equal(view.controlDisclosed, false);
  assert.equal(view.riskLevel, 'green');
  assert.equal(view.riskScoreBand, 'green');
  assert.equal('gated' in view, false);
});

test('R4 discloses GateReleased even when the current snapshot is green', () => {
  const view = buildPublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R4,
    snapshot,
    observedAt: 2_000,
    disclosedAt: 2_000,
    currentGated: false,
    latestControlIsDisclosed: true,
    latestControlEventName: 'GateReleased',
  }) as Record<string, unknown>;

  assert.equal(view.controlDisclosed, true);
  assert.equal(view.gated, false);
  assert.equal(view.riskLevel, 'green');
});

test('delay and frequency compose by applying delay before the frequency boundary', () => {
  const regime = {
    ...TRANSPARENCY_REGIMES.R0,
    delaySec: 2,
    frequencySec: 10,
  };

  assert.equal(disclosureTimeFor(8, regime), 10);
  assert.equal(disclosureTimeFor(9, regime), 20);
});

test('unavailable public risk view uses unknown rather than green', () => {
  const view = buildUnavailablePublicRiskPayload({
    regime: TRANSPARENCY_REGIMES.R3,
    observedAt: 1_000,
    notYetDisclosed: true,
  });

  assert.equal(view.available, false);
  assert.equal(view.notYetDisclosed, true);
  assert.equal(view.riskLevel, 'unknown');
  assert.equal(view.status, 'unknown');
});

test('query regime only overrides the default when experiment override is enabled', () => {
  assert.equal(resolvePublicRegimeId('R4', 'R1', false), 'R4');
  assert.equal(resolvePublicRegimeId('R4', 'R1', true), 'R1');
  assert.equal(resolvePublicRegimeId('R4', undefined, true), 'R4');
});

test('R0 unavailable regulator view is unknown before the reporting boundary', () => {
  const view = buildUnavailableRegulatorRiskPayload({
    fundId: '0x1111111111111111111111111111111111111111111111111111111111111111',
    regime: TRANSPARENCY_REGIMES.R0,
    observedAt: 1_000,
    notYetDisclosed: true,
  });

  assert.equal(view.regime, 'R0');
  assert.equal(view.available, false);
  assert.equal(view.notYetDisclosed, true);
  assert.equal(view.riskLevel, 'unknown');
  assert.equal('snapshot' in view, false);
  assert.equal('gated' in view, false);
});

test('R0 regulator view discloses detailed snapshots only after the reporting boundary', () => {
  const view = buildRegulatorRiskPayload({
    fundId: '0x1111111111111111111111111111111111111111111111111111111111111111',
    regime: TRANSPARENCY_REGIMES.R0,
    snapshot: { ...snapshot, riskScoreBps: 7_260 },
    observedAt: 7 * 24 * 60 * 60,
    disclosedAt: 7 * 24 * 60 * 60,
    visibleGated: true,
  });

  assert.equal(view.regime, 'R0');
  assert.equal(view.available, true);
  assert.equal(view.gated, true);
  assert.equal(view.riskLevel, 'red');
  assert.equal(view.snapshot.riskScoreBps, 7_260);
  assert.deepEqual(view.snapshot.metrics, snapshot.metrics);
});

test('regulator disclosure boundary is driven by visibility rather than regime id', () => {
  assert.equal(regulatorUsesDisclosureBoundary(TRANSPARENCY_REGIMES.R0), true);
  assert.equal(regulatorUsesDisclosureBoundary(TRANSPARENCY_REGIMES.R1), true);
  assert.equal(regulatorUsesDisclosureBoundary(TRANSPARENCY_REGIMES.R3), true);
  assert.equal(regulatorUsesDisclosureBoundary(TRANSPARENCY_REGIMES.R2), false);
  assert.equal(regulatorUsesDisclosureBoundary(TRANSPARENCY_REGIMES.R4), false);
});

test('R3 unavailable regulator view is unknown before the public delay elapses', () => {
  const view = buildUnavailableRegulatorRiskPayload({
    fundId: '0x1111111111111111111111111111111111111111111111111111111111111111',
    regime: TRANSPARENCY_REGIMES.R3,
    observedAt: 1_000,
    notYetDisclosed: true,
  });

  assert.equal(view.regime, 'R3');
  assert.equal(view.available, false);
  assert.equal(view.notYetDisclosed, true);
  assert.equal(view.riskLevel, 'unknown');
  assert.equal('snapshot' in view, false);
});

test('R3 regulator view discloses detailed snapshots after the public delay elapses', () => {
  const view = buildRegulatorRiskPayload({
    fundId: '0x1111111111111111111111111111111111111111111111111111111111111111',
    regime: TRANSPARENCY_REGIMES.R3,
    snapshot: { ...snapshot, riskScoreBps: 7_260 },
    observedAt: 1_000 + 24 * 60 * 60,
    disclosedAt: 1_000 + 24 * 60 * 60,
    visibleGated: true,
  });

  assert.equal(view.regime, 'R3');
  assert.equal(view.available, true);
  assert.equal(view.gated, true);
  assert.equal(view.riskLevel, 'red');
  assert.equal(view.snapshot.riskScoreBps, 7_260);
  assert.deepEqual(view.snapshot.metrics, snapshot.metrics);
});
