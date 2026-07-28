import { TransparencyRegime, disclosureTimeFor } from './regimes';

export type DisclosedSnapshotSearchResult<S> = {
  snapshot: S | null;
  disclosedAt: number | null;
  nextDisclosedAt: number | null;
};

type SnapshotWithSubmittedAt = { submittedAt: number };

/**
 * Find the latest snapshot whose regime disclosure time has been reached.
 *
 * Snapshots are stored in submission order and block timestamps are
 * non-decreasing, so disclosureTimeFor(submittedAt, regime) is non-decreasing
 * in the snapshot index for every regime (fixed delay and epoch alignment are
 * both monotone). That makes the "last disclosed index" binary-searchable with
 * O(log n) reads instead of the previous O(n) backward scan, which kept the
 * unauthenticated public view unbounded as history grew.
 *
 * nextDisclosedAt preserves the previous semantics: the earliest disclosure
 * time among the not-yet-disclosed snapshots (null when everything visible).
 */
export async function searchLatestDisclosedSnapshot<S extends SnapshotWithSubmittedAt>(
  readSnapshotAt: (index: number) => Promise<S>,
  historyLength: number,
  regime: TransparencyRegime,
  observedAt: number,
): Promise<DisclosedSnapshotSearchResult<S>> {
  if (historyLength === 0) {
    return { snapshot: null, disclosedAt: null, nextDisclosedAt: null };
  }

  let low = 0;
  let high = historyLength - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = await readSnapshotAt(mid);
    if (observedAt >= disclosureTimeFor(candidate.submittedAt, regime)) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (found === -1) {
    const first = await readSnapshotAt(0);
    return {
      snapshot: null,
      disclosedAt: null,
      nextDisclosedAt: disclosureTimeFor(first.submittedAt, regime),
    };
  }

  const snapshot = await readSnapshotAt(found);
  const nextDisclosedAt = found + 1 < historyLength
    ? disclosureTimeFor((await readSnapshotAt(found + 1)).submittedAt, regime)
    : null;
  return {
    snapshot,
    disclosedAt: disclosureTimeFor(snapshot.submittedAt, regime),
    nextDisclosedAt,
  };
}
