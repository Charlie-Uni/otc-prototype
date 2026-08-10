import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSPARENCY_REGIMES } from '../artifact/risk/regimes';
import type { GateTransitionState } from '../state/types';
import {
  createControlDisclosure,
  createControlDisclosureTimeline,
  latestDistressControlDisclosures,
} from './control-disclosure';

function transition(kind: GateTransitionState['kind'] = 'GateTriggered'): GateTransitionState {
  return {
    transitionId: `control:submission-1:${kind}`,
    kind,
    fundId: 'fund-001',
    tick: 0,
    sourceOccurredAt: 1,
    transitionedAt: 1,
    sourceSubmissionId: 'submission-1',
    riskScoreBps: kind === 'GateTriggered' ? 8_000 : 3_000,
    kappaBps: 7_000,
    gatePhiBps: 10_000,
  };
}

test('applies the frozen public timing boundary to control transitions', () => {
  assert.equal(createControlDisclosure(
    transition(), TRANSPARENCY_REGIMES.R0, 'public',
  )?.disclosedAt, 604_800);
  assert.equal(createControlDisclosure(
    transition(), TRANSPARENCY_REGIMES.R3, 'public',
  )?.disclosedAt, 86_401);
  assert.equal(createControlDisclosure(
    transition(), TRANSPARENCY_REGIMES.R1, 'public',
  )?.disclosedAt, 1);
});

test('keeps R2 controls private from investors but immediate for regulators', () => {
  assert.equal(createControlDisclosure(
    transition(), TRANSPARENCY_REGIMES.R2, 'public',
  ), null);
  assert.equal(createControlDisclosure(
    transition(), TRANSPARENCY_REGIMES.R2, 'regulator',
  )?.disclosedAt, 1);
});

test('preserves the R4 state-dependent Gate trigger and release policy', () => {
  const timeline = createControlDisclosureTimeline(
    [transition(), { ...transition('GateReleased'), transitionedAt: 2 }],
    TRANSPARENCY_REGIMES.R4,
    'public',
  );
  assert.deepEqual(timeline.map(({ kind, disclosedAt }) => ({ kind, disclosedAt })), [
    { kind: 'GateTriggered', disclosedAt: 1 },
    { kind: 'GateReleased', disclosedAt: 2 },
  ]);
});

test('does not emit stale distress when a later release shares one disclosure boundary', () => {
  const timeline = createControlDisclosureTimeline(
    [transition(), { ...transition('GateReleased'), transitionedAt: 2 }],
    TRANSPARENCY_REGIMES.R0,
    'public',
  );
  assert.equal(latestDistressControlDisclosures(timeline).length, 0);
  assert.deepEqual(
    latestDistressControlDisclosures([timeline[0]!]).map(({ kind }) => kind),
    ['GateTriggered'],
  );
});
