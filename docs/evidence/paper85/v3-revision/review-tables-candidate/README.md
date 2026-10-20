# Review candidate: case fixes and Table 8–10 verification

Status: pending user approval; no commit, push or merge in this round.

- Measurement code: `347ea2636dce91b5381f72c084006de8aea971aa`.
- Verification base: `fa8e5b36d146dc948cb171d2e3b1bd042201263a`.
- Verification code: uncommitted candidate, `verifier.commit: null`, governed inputs dirty.
- Candidate source SHA-256: `a8fc7185749be72ea3fd546fa41f31cc85499e2da1ad5389aecaffac1d1e5a64`.
- Source snapshot: 68 present files, plus the absent optional `apps/api/pnpm-lock.yaml` recorded as null.

The [verification report](verification-candidate-a8fc7185749b.json) binds the exact candidate source
bytes and the original sealed manifest. It is outside the sealed run. The
[complete diff](changes.diff) includes code and documentation; generated
verification/test output is linked separately. The [test log](regression-tests.tap)
contains 71 passing tests, zero failures, zero skipped tests. Negative fixtures
change temporary copies only. The original review package and formal report
remain intact.

## Repairs

1. Fresh case summaries use `answers.Q1.total`, removing the undefined `q1`.
   `caseOutcomeSummary` is exercised directly, including accepted/rejected counts.
2. One existing post-review JSON oracle supplies all 26 step expectations.
   Inline expectations are removed. Unknown, missing and duplicate steps fail.
   The preserved field name `stepsMatchingPreregistration` remains for schema
   compatibility; it does not turn post-review expectations into preregistration.
3. Offline identity hashes files without Git tags/history. Git commit/status are
   optional provenance; unavailable Git is disclosed as null/unknown. A complete
   verification test passes with Git removed from PATH, and an identity test uses
   a new temporary repository with no historical tags. New measurements retain
   their clean-source/frozen-reference guard.
4. Table 8 recomputes all 84 labels and every count/predicate group. Fifty
   executed rows are joined to scenario-scoped receipts or EVM rejection records;
   receipt logs reconstruct their before/after snapshots. The remaining 34
   capability absences use null actions in the preserved mapping.
5. Table 9 replays production/B1/B2 raw logs at 14 checkpoints each, recalculating
   component recoverability, missing components, event counts/types and NAV refs.
   Comparator logs are also checked against originating receipt logs.
6. Table 10 recomputes 130 operation gas samples from 15 archived trajectories,
   deployment consistency, means/sample SD, comparator min/max, workflow totals
   and ratios. Chain identity uses port plus deployment name, not hash alone.
7. Tables 8–10 displayed numeric cells in the preserved source-map JSON match
   the reconstructed results (Table 8 prototype column excluded). Coverage and
   limitations for all eleven Chapter 5 tables appear in `coverage.tables`.

## Verified results

| Check | Result |
| --- | --- |
| Original manifest-bound files | 101/101 hashes unchanged |
| Original replay streams / events | 17 / 33,527 |
| Original projections / valid NAV references | 199 / 4,114 |
| Scale runs and case answers | 9 runs; complete Q1–Q7 match |
| B1 / B2 invalid scenarios blocked | 3/24 / 13/24 |
| Balance recovery | B1 and B2: 14/14 |
| Complete projection recovery | B1 and B2: 0/14 |
| Subscription / redemption gas ratio to B2 | 4.39 / 7.95 |
| Baseline gas operation receipts | 130 from 15 trajectories |
| Regression tests | 71 passed; 0 failed; 0 skipped |

The 17-stream totals describe production/scale/case/next-NAV replay streams.
Comparator trajectories checked for Tables 9–10 are separate. They do not add
new study cases or measurements. All gas/latency values remain from the sealed
measurement run; no new EVM experiments, benchmarks or compiler builds ran here.

The [per-table coverage](../README.md#current-review-candidate-baseline-tables-and-verifier-portability)
explicitly distinguishes raw reconstruction, inherited v2.1 evidence, source
review and partial checks. In particular, Tables 6–7 are not recomputed; Table 8
capability absence and business correspondence use declared fixture/mapping
assumptions; Table 12 rejection labels remain archived observations. Displayed
cell validation reads the JSON source map, not a new DOCX render.

## Reproduce

Install the same pinned Node/viem prerequisites described in the harness README.
No RPC, Foundry executable, historical Git tag or compiler is needed for offline
verification itself. The full regression suite uses local Git for disposable
measurement-guard fixtures, but no historical repository refs.

```sh
node --test experiments/paper85-evaluation/scripts/*.test.mjs experiments/paper85-evaluation/scripts/v3/*.test.mjs
node experiments/paper85-evaluation/scripts/v3/verify-run.mjs docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac /path/outside/sealed-run/verification-review.json
```

The output path must be new and outside the sealed directory. The source digest
above identifies this review candidate; an approved formal commit report must
be produced separately after approval. No new commit number is claimed here.

The [integrity record](integrity.json) binds this package, the reviewed diff,
current code snapshot and protected artifacts. Original preregistration and
amendment, frozen production and baseline contracts, the manuscript and source
map, and all 101 sealed files are unchanged. `delivery-manifest.json` only
refreshes the changed documentation checksum and links this review package;
its previous formal verification commit/report remains historical.
