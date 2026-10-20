# Revised v3 evidence harness

The original plan/mapping and `docs/evidence/paper85/v3/` are historical and
immutable. See `spec-v3/review-amendment.v3.1.md` for post-review changes and
expected outcomes. No production Solidity source is changed.

Install the repository's pinned dependencies (viem 2.55.10 in `apps/api`) and
Foundry 1.7.1; make `forge` and `anvil` available on PATH. Supply an explicit
solc 0.8.30 executable. Governed execution inputs must be committed first.

```sh
node --test experiments/paper85-evaluation/scripts/v3/revision.test.mjs
node experiments/paper85-evaluation/scripts/v3/run-revision.mjs /absolute/path/to/solc-0.8.30
node experiments/paper85-evaluation/scripts/v3/verify-run.mjs /absolute/path/to/sealed/run
```

The suite runs sequentially. It creates a unique directory below
`docs/evidence/paper85/v3-revision/`; it never resumes or overwrites a run.
Only a directory with `manifest.json` status `complete` is publication evidence.
Failures retain `FAILED.json` and partial inputs for diagnosis. Do not mix their
files with a completed run. Runners require the suite-assigned `PAPER85_RUN_DIR`.

Module boundaries:

- `common.mjs`: chain operations, verified EVM rejection classification, decoding.
- `evidence.mjs`: source guard, isolation, append-only receipts and file sealing.
- `build.mjs`: pinned build and independent literal-input bytecode reproduction.
- `audit-pricing.mjs`: pure case-policy NAV audit, shared by runner and verifier.
- `run-*.mjs`: experiment orchestration; `probe-*.mjs`: disclosed counterexamples.
- `verify-run.mjs`: offline raw-log replay, view/receipt/storage/timing checks.

Evidence layout:

- `run.json`: code commit, governed file hashes, actual host, chain configuration.
- `build/`: compiler executable hash/version, effective Foundry configuration,
  literal standard-JSON inputs/outputs (gzip), ABI/bytecode artifacts.
- `chains/*.jsonl.gz`: chain configuration; deployment/call inputs, mined
  envelopes/receipts/block timestamps, deployed runtime, simulated rejections,
  snapshot boundaries and final contract storage maps. Snapshot-based comparator
  tests can reuse block numbers; scenario markers preserve those boundaries.
- `scale/*/replay.json.gz`: genesis, raw/decoded logs, exact JSONL index string,
  checkpoints with independent contract views, operations, final replay state,
  reference checks and all timing samples. Tape links bind operations to receipts.
- `case/`, `canonical/`, `next-nav/`, `trajectories/`: replay inputs and projections
  for the remaining experiments. `A`–`E` JSON files contain derived results.
- `verification.json`: offline checks; `manifest.json`: hashes of every file.

Compression is lossless. Index byte counts refer to the archived uncompressed
JSONL string, storage counts to nonzero contract slots, and replay timing to
the pure loop only. Hashes provide internal integrity/provenance, not external
attestation. A case-policy result is not a regulatory certification.
