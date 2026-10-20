# Verification repairs for review

Status: uncommitted; no push or merge performed. No new EVM or latency
measurements were generated. The manuscript DOCX is unchanged.

Measurement code: `347ea2636dce91b5381f72c084006de8aea971aa`.

Verification code: candidate based on `bf96995fceb1cdd3f9cab426bdeedfaa4bb5b673`.
Its current governed source digest is
`cd6f3dcf71570a53a7236779d32550e1ba44c65902d5daea04c0bf37d9f90fd5`;
the report records the hash of each input, including untracked new source files.
`verifier.commit` is deliberately null and `governedInputsDirty` true until the
user approves a real code commit. Clean-source requirements for new measurement
runs remain enforced.

## Changes

1. Dirty-input tests operate only inside a disposable Git repository. They copy
   the governed files and create local fixture references for frozen source and
   original preregistration checks. Other working-tree edits outside governed
   paths are allowed. The actual checkout is never modified by the tests.
2. The governed-path list exists only in `evidence.mjs`; `gitHead` delegates to
   `sourceIdentity`. Callers await the shared check.
3. Missing evidence journals raise an error. The chain's initial record is
   written before Anvil is spawned. Rejection unit tests explicitly supply an
   in-memory recorder.
4. Identical `asOf` dates determine case correction relationships; Q2 resolves
   all superseded versions to the last correction. No correction index or
   `navIndex + 1` drives query results. This remains a disclosed case policy.
5. `audit-case.mjs` contains pure Q1–Q7 reconstruction used by runner and verifier.
   The verifier compares complete answer structures and uses a separately stored
   machine-readable expectation oracle, labelled post-review. Negative fixtures
   test incorrect answers and repeated corrections.

## Results

- [Code diff, including new files](code-review.patch).
- [Regression TAP](regression-tests.tap): 54 tests, 54 pass, zero failures/skips.
  This includes 25 revised/new v3 tests and 29 existing evaluation tests.
- [Historical evidence verification](verification-candidate-cd6f3dcf7157.json):
  passed; 101 sealed file hashes, 17 replay streams, 33,527 events,
  199 checkpoint projections, 4,114 NAV references, all nine scale runs,
  the next-NAV probe and complete case Q1–Q7 answers checked.
- [Integrity and test isolation](integrity.json): protected sources, original
  preregistration/amendment, v2.1/v3 archives, sealed run and DOCX unchanged.
  All 42 checked actual source/configuration files kept identical contents and
  modification times during testing.

The offline verifier does not rerun EVM experiments, compiler builds, timing
measurements or the revoked-holder probe. Baseline classification counts are
checked against archived observations. Shared query code and a post-review
oracle establish regression consistency, not third-party empirical validation.

## Reproduce

```sh
node --test experiments/paper85-evaluation/scripts/*.test.mjs experiments/paper85-evaluation/scripts/v3/*.test.mjs
node experiments/paper85-evaluation/scripts/v3/verify-run.mjs docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac /path/outside/sealed-run/verification-candidate.json
```

Tests use temporary directories. A report output path must be new and outside
the sealed input directory. For historical remeasurement, use the separate
checkout fixed to `347ea26` documented in the harness README. After approval,
record a real verification-code commit and reverify without replacing this
candidate report or the sealed measurements.
