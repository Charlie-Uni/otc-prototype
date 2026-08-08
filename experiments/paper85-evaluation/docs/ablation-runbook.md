# M1-M5 Single-Predicate Ablation Runbook

The ablation suite deploys five experimental variants. Each variant disables
exactly one predicate while all other predicates remain enabled:

| Variant | Disabled predicate |
|---|---|
| M1 | `Authorized` |
| M2 | `ComplianceValid` |
| M3 | `NAVValid` |
| M4 | `LifecycleValid` |
| M5 | `ParamConsistent` |

Every variant executes all 42 sealed scenarios. The 24 invalid scenarios are
targeted exactly once; the other 186 variant/scenario pairs are non-target
controls and must remain byte-for-byte equivalent to M0 in outcome, return or
revert data, semantic state, and event digest.

```bash
cd experiments/paper85-evaluation/contracts
node ../scripts/generate-m0-tests.mjs --check
node ../scripts/run-m0.mjs
node ../scripts/run-ablation.mjs
```

`run-ablation.mjs` executes all 210 variant/scenario pairs twice. It writes one
42-row JSONL file per variant, retains both raw Forge runs, verifies repeated
semantic digests, and emits a SHA-256 evidence manifest plus run summary.

Primary classifications follow `spec/result-taxonomy.md`. In particular,
I10/M3 remains rejected by the source-locked `latestNAV` residual dependency,
while I24/M5 reaches checked-arithmetic `Panic(0x11)`. These outcomes are not
relabelled as successful invalid transitions.

All results are experimental-variant evidence. They must not be reported as
production contract behavior or used for the production gas table.
