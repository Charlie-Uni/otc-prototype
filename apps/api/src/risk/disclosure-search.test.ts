import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchLatestDisclosedSnapshot } from './disclosure-search';
import { getTransparencyRegime } from './regimes';

const DAY_SEC = 24 * 60 * 60;
const WEEK_SEC = 7 * DAY_SEC;

type FakeSnapshot = { index: number; submittedAt: number };

function makeReader(submittedAts: number[]) {
  const reads: number[] = [];
  const readSnapshotAt = async (index: number): Promise<FakeSnapshot> => {
    reads.push(index);
    return { index, submittedAt: submittedAts[index] };
  };
  return { readSnapshotAt, reads, length: submittedAts.length };
}

test('empty history returns null without reads', async () => {
  const { readSnapshotAt, reads } = makeReader([]);
  const result = await searchLatestDisclosedSnapshot(readSnapshotAt, 0, getTransparencyRegime('R1'), 1_710_000_000);

  assert.equal(result.snapshot, null);
  assert.equal(result.disclosedAt, null);
  assert.equal(result.nextDisclosedAt, null);
  assert.equal(reads.length, 0);
});

test('R1 realtime discloses the latest snapshot immediately', async () => {
  const { readSnapshotAt, length } = makeReader([100, 200, 300]);
  const result = await searchLatestDisclosedSnapshot(readSnapshotAt, length, getTransparencyRegime('R1'), 300);

  assert.equal(result.snapshot?.index, 2);
  assert.equal(result.disclosedAt, 300);
  assert.equal(result.nextDisclosedAt, null);
});

test('R3 one-day delay hides recent snapshots and reports the next disclosure time', async () => {
  const base = 1_710_000_000;
  const { readSnapshotAt, length } = makeReader([base, base + 100, base + 200]);
  const regime = getTransparencyRegime('R3');

  const midWindow = await searchLatestDisclosedSnapshot(readSnapshotAt, length, regime, base + DAY_SEC + 150);
  assert.equal(midWindow.snapshot?.index, 1);
  assert.equal(midWindow.disclosedAt, base + 100 + DAY_SEC);
  assert.equal(midWindow.nextDisclosedAt, base + 200 + DAY_SEC);

  const beforeAny = await searchLatestDisclosedSnapshot(readSnapshotAt, length, regime, base + 10);
  assert.equal(beforeAny.snapshot, null);
  assert.equal(beforeAny.nextDisclosedAt, base + DAY_SEC);
});

test('R0 epoch alignment: a snapshot exactly on the weekly boundary is disclosed with zero wait', async () => {
  const boundary = 100 * WEEK_SEC;
  const { readSnapshotAt, length } = makeReader([boundary]);
  const result = await searchLatestDisclosedSnapshot(readSnapshotAt, length, getTransparencyRegime('R0'), boundary);

  assert.equal(result.snapshot?.index, 0);
  assert.equal(result.disclosedAt, boundary);
});

test('binary search matches the linear scan across observation times and uses O(log n) reads', async () => {
  const submittedAts = Array.from({ length: 200 }, (_, i) => 1_710_000_000 + i * 60);
  const regime = getTransparencyRegime('R3');

  for (const observedAt of [
    1_709_000_000,
    1_710_000_000 + DAY_SEC - 1,
    1_710_000_000 + DAY_SEC,
    1_710_000_000 + DAY_SEC + 60 * 57 + 30,
    1_710_000_000 + DAY_SEC + 60 * 199,
    1_800_000_000,
  ]) {
    // Reference: the previous O(n) backward scan.
    let expectedIndex = -1;
    let expectedNext: number | null = null;
    for (let i = submittedAts.length - 1; i >= 0; i -= 1) {
      const disclosedAt = submittedAts[i] + DAY_SEC;
      if (observedAt >= disclosedAt) {
        expectedIndex = i;
        break;
      }
      expectedNext = expectedNext === null ? disclosedAt : Math.min(expectedNext, disclosedAt);
    }

    const { readSnapshotAt, reads, length } = makeReader(submittedAts);
    const result = await searchLatestDisclosedSnapshot(readSnapshotAt, length, regime, observedAt);

    assert.equal(result.snapshot?.index ?? -1, expectedIndex);
    assert.equal(result.nextDisclosedAt, expectedNext);
    assert.ok(reads.length <= Math.ceil(Math.log2(length)) + 3, `expected O(log n) reads, got ${reads.length}`);
  }
});
