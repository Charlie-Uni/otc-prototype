import assert from 'node:assert/strict';
import test from 'node:test';
import { TICK_SEC } from '../core/pipeline';
import { riskSnapshotFixture } from '../testing/oracle-snapshot';
import {
  createRiskDisclosure,
  createRiskDisclosureTimeline,
  createRiskDisclosureTimelineForRegime,
} from './engine';
import { getTransparencyRegime, type TransparencyRegimeId } from '../artifact/risk/regimes';

const CYCLE_START = 1_799_884_800;

test('applies R0-R4 disclosure boundaries and audience information sets', () => {
  const submittedAt = CYCLE_START + 1;
  const source = riskSnapshotFixture('s1', 'fund-001', submittedAt);
  const expectedPublicTime: Record<TransparencyRegimeId, number> = {
    R0: CYCLE_START + 7 * TICK_SEC,
    R1: submittedAt,
    R2: submittedAt,
    R3: submittedAt + TICK_SEC,
    R4: submittedAt,
  };

  for (const regimeId of ['R0', 'R1', 'R2', 'R3', 'R4'] as const) {
    const regime = getTransparencyRegime(regimeId);
    const publicView = createRiskDisclosure(source, regime, 'public', 6_000);
    const regulatorView = createRiskDisclosure(source, regime, 'regulator', 6_000);
    assert.equal(publicView.disclosedAt, expectedPublicTime[regimeId]);
    assert.equal(
      regulatorView.disclosedAt,
      regime.visibility === 'public' ? expectedPublicTime[regimeId] : submittedAt,
    );
    assert.equal(regulatorView.signal.kind, 'exact');
    assert.equal(regulatorView.signal.valueBps, 6_500);
    assert.equal(publicView.signal.kind, regime.granularity === 'detailed' ? 'exact' : 'band');
    assert.equal(publicView.signal.valueBps, regime.granularity === 'detailed' ? 6_500 : 8_000);
  }
});

test('marks arbitrary public thresholds as censored when aggregate information cannot identify them', () => {
  const source = riskSnapshotFixture('s1', 'fund-001', CYCLE_START + 1);
  for (const regimeId of ['R0', 'R2', 'R4'] as const) {
    const regime = getTransparencyRegime(regimeId);
    assert.equal(createRiskDisclosure(source, regime, 'public', 6_500).thresholdIdentifiable, false);
    assert.equal(createRiskDisclosure(source, regime, 'public', 6_000).thresholdIdentifiable, true);
    assert.equal(createRiskDisclosure(source, regime, 'regulator', 6_500).thresholdIdentifiable, true);
  }
  for (const regimeId of ['R1', 'R3'] as const) {
    assert.equal(
      createRiskDisclosure(source, getTransparencyRegime(regimeId), 'public', 6_500)
        .thresholdIdentifiable,
      true,
    );
  }
});

test('coalesces same-fund snapshots at one periodic boundary without dropping other funds', () => {
  const snapshots = [
    riskSnapshotFixture('fund1-early', 'fund-001', CYCLE_START + 1),
    riskSnapshotFixture('fund1-latest', 'fund-001', CYCLE_START + 2 * TICK_SEC),
    riskSnapshotFixture('fund2', 'fund-002', CYCLE_START + 4 * TICK_SEC),
  ];
  const r0 = createRiskDisclosureTimeline(snapshots, 'R0', 'public', 6_000);
  assert.equal(r0.length, 2);
  assert.deepEqual(r0.map(({ sourceSubmissionId }) => sourceSubmissionId), [
    'fund1-latest',
    'fund2',
  ]);
  assert.ok(r0.every(({ disclosedAt }) => disclosedAt === CYCLE_START + 7 * TICK_SEC));

  const r1 = createRiskDisclosureTimeline(snapshots, 'R1', 'public', 6_000);
  assert.equal(r1.length, 3);
});

test('rejects disclosure thresholds outside the bps domain', () => {
  assert.throws(
    () => createRiskDisclosure(
      riskSnapshotFixture('s1', 'fund-001', CYCLE_START),
      getTransparencyRegime('R1'),
      'public',
      10_001,
    ),
    /INVALID_DISCLOSURE_THRESHOLD/,
  );
});

test('supports experiment-only parameter packages without rewriting disclosure logic', () => {
  const snapshot = riskSnapshotFixture('custom', 'fund-001', CYCLE_START + 1);
  const custom = { ...getTransparencyRegime('R1'), delaySec: 123 };
  const [disclosure] = createRiskDisclosureTimelineForRegime(
    [snapshot], custom, 'public', 6_000,
  );
  assert.equal(disclosure?.disclosedAt, snapshot.submittedAt + 123);
  assert.equal(disclosure?.signal.kind, 'exact');
});
