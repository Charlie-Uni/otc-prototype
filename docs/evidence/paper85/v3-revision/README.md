# Paper 8.5 v3.1 post-review revision

Run: [2026-10-20T01-15-00.607Z-f5edfdac](2026-10-20T01-15-00.607Z-f5edfdac/manifest.json)

Measurement code: `347ea2636dce91b5381f72c084006de8aea971aa` (generated the sealed run)

Verification code: `f0127fa538105974b7721c2289dca0ae480eb249` (approved repairs)

The [formal verification report](verification-f0127fa538105974b7721c2289dca0ae480eb249.json)
records that exact code commit, clean governed inputs, all source hashes and
complete Q1–Q7 revalidation. Its source digest matches the tested review
candidate. The report is outside the sealed measurement directory.

Manifest SHA-256: `913cd2aef3cbd861b97f761bc2cabc64027fce15ce9b10c63f1ff1cfef5d1f31`

The original preregistration at `4ce5d24`, baseline mapping, archived v3 files,
and production sources frozen at `chapter3-artifact-v1.4.0` are unchanged.
The [post-review amendment](../../../../experiments/paper85-evaluation/spec-v3/review-amendment.v3.1.md)
discloses the new criteria before this full revised run. It is not retrospective
preregistration. The v2.1 compact manifest (20 files) and v3 manifest (14 files)
were verified unchanged.

## Five repairs

1. Next-applicable-NAV audit replaces the asOf-date proxy. The original case
   still yields 4/5 matches under the stated case policy. An additional on-chain
   order/NAV1/NAV2/acceptance counterexample passes the old proxy but is flagged
   `skipped-next-NAV`. This is a non-preregistered supplementary probe added after
   review of the original v3 results and archived in the revised run. Computation
   time and dealing applicability remain disclosed
   assumptions, not independently established legal compliance.
2. Only positively identified EVM reverts count as blocked attempts. Encoding,
   transport, timeout, non-revert RPC and receipt failures abort. Rejections are
   simulated `eth_call` records, not mined failed transactions.
3. Each run has a unique directory and preserves envelopes/receipts, simulation
   inputs/errors, raw/decoded logs, genesis, exact index contents, checkpoint
   views, storage maps and individual timing samples. Aggregates read persisted
   metrics. A complete manifest is written only after offline replay passes.
4. Source cleanliness covers runners, replay code, specs, configuration and
   dependency manifests. Literal compiler inputs/outputs reproduce creation and
   runtime bytecode; deployed code is checked with immutable positions separated.
5. Scale NAV asOf now equals its assigned submission block timestamp. The old
   60-second lag is disclosed as the third historical deviation. All nine runs
   were repeated; every NAV timestamp equality is asserted. No old/new timing mix.

## Results and limits

- B1/B2 classifications: 84/84 match the preserved mapping; invalid cases blocked
  are 3/24 and 13/24 respectively.
- Canonical gas: five fresh trajectories for production, B1 and B2. Subscription
  and redemption workflow ratios remain 4.39× and 7.95× B2. Current deployment gas
  is taken from rebuilt artifacts/receipts, not assumed equal to historical values.
- Scale: all 100/1,000/10,000 targets × seeds 1/2/3 complete. ARC, NRI and PCR all
  pass; NRI 4,095/4,095 and PCR 92/92. At the 10,000-event target, replay is
  14.79 ± 3.72 ms and log fetch is
  94.36 ± 6.42 ms (sample SD across three seed means).
  This is sequential growth on Apple M3 / Node 22.14.0, not a concurrent stress
  test, production throughput estimate or exclusive-host benchmark.
- Case: 26/26 scripted outcomes; 23 accepted transactions and three simulated
  rejections; seven revised audit expectations pass. The revoked-holder transfer
  path remains observable because production contracts are frozen.
- Offline verification: 17 archived replay streams,
  33,527 events, 199 projections and
  4,114 NAV references checked, plus 84 baseline rows.
  The sealed manifest binds 101 files. These totals include canonical gas repeats
  and the counterexample; they are not additional independent study participants.
- Six focused regression tests passed: next-NAV selection/policy handling,
  infrastructure-vs-revert classification, bytecode/runtime tampering and dirty
  runner/config/lock detection. Test code and reproduction instructions are in
  [the harness](../../../../experiments/paper85-evaluation/scripts/v3/README.md).

The amended manuscript and per-table JSON source map are in
[the manuscript folder](../../../manuscript/paper85-v3.1/). Chapter 5 retains
5.1–5.6 and eleven tables (3–13); the complete document has thirteen tables.
The generator binds the input DOCX hash, run manifest and output DOCX hash.
Only Chapter 5 content is revised. Other chapters retain their draft content;
references, figures, abstract and discussion/conclusion are not completed here.
Expert review and centralized-workflow B3 remain future work.

## Reproduce or verify

Use the pinned prerequisites and commands in the harness README. A fresh suite
rebuilds all artifacts and writes a new directory. For offline verification:

```sh
node experiments/paper85-evaluation/scripts/v3/verify-run.mjs docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac
```

Checksums establish internal integrity. They do not attest external inputs,
real-world adoption, actual valuation computation or regulatory approval.

## Approved verification repairs

The preserved [preapproval review package](review-candidate/README.md) contains
the code diff, all 54 passing regression results and the earlier candidate
verification. Its uncommitted labels describe that historical review state.
The approved code has the same governed source bytes and was verified again
after commit as recorded in the formal report above. All 101 sealed file hashes,
17 replay streams, 33,527 events, 199 projections, 4,114 NAV references and all
nine scale runs pass. Case Q1–Q7, including the complete Q2 affected set and
Q3/Q4/Q5/Q7 details, reproduce the archived answers.

The original `verification.json` and all 101 manifest-bound files remain
unchanged. No gas or latency measurements were repeated. Baseline rows remain
summary-consistency checks, not an independent re-execution of comparator
transitions. The formal report is archived in a separate documentation commit;
its `verifier.commit` identifies the code commit used for the check.

The machine-readable expectation file is explicitly a post-review regression
oracle. Neither it nor this verification replaces the original preregistration.
Use the [pinned measurement checkout instructions](../../../../experiments/paper85-evaluation/scripts/v3/README.md#candidate-verification-repairs)
to remeasure at `347ea26`. To reproduce the formal verification with its exact
code version, use a separate checkout fixed to `f0127fa538105974b7721c2289dca0ae480eb249`,
install the pinned prerequisites and run:

```sh
node experiments/paper85-evaluation/scripts/v3/verify-run.mjs docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac /path/outside/sealed-run/verification-f0127fa.json
```

Use a new output path. This preserves both the original sealed verification and
the accurately identified preapproval candidate report.

## Follow-up verification of Tables 4, 11 and 13

[followup-audit.json](followup-audit.json) reads the sealed run and original v3
archive. It adds no benchmark measurements and does not modify either archive.
Reproduce it with:

```sh
python tools/audit-paper85-followup.py docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac docs/evidence/paper85/v3-revision/followup-audit.json
```

- Table 4: FundToken canonical deployment uses 4,855,363 gas and scale deployment
  4,855,351 gas with identical creation bytecode. The constructor names, symbols
  and fund identifiers differ. Canonical input has one fewer zero byte; the
  12-gas input-data difference accounts for the receipt difference. Attributing
  this comparison to an IPFS metadata change would be incorrect.
- B2 deployment is 1,763,501 gas versus 1,763,489 in original v3. A change in
  metadata zero-byte distribution could explain 12 gas, but the old archive has
  no creation input or artifact to test this hypothesis. The cause remains
  unconfirmed; equal bytecode lengths do not establish byte equality.
- Table 11: all nine new per-run files are tied to new raw logs, transaction
  receipts and storage maps. All 1,510 NAV events have asOf equal to storedAt and
  their recorded block time. Every final projection hash differs from old v3.
  Transaction counts, storage and log/index byte counts are unchanged. Eight
  runs also have identical gas; 10,000-s1 totals 542,417,451 gas, versus
  542,417,463 previously. Its NAV at block 3,791 changes an input zero-byte
  count after the 60-second clock repair, accounting for −12 gas. All 27 displayed
  deterministic cells remain equal after the table's stated rounding. The
  complete offline replay verifier was run again and passed.
- Table 13 and the body explicitly label the skipped-next-NAV probe as
  non-preregistered and describe its order/NAV1/NAV2/acceptance design. The C26
  rejection is reported as a gap in historical correction support under the
  case's CSSF 24/856 grounding, not as an implementation benefit.
