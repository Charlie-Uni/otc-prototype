# M0 Differential Equivalence Runbook

M0 compares the `chapter3-artifact-v1.4.0` production contracts with the
feature-flagged experimental contracts when all five predicates are enabled.
It is a quality gate, not an ablation result.

## Preconditions

- `paper85-prereg-v1` resolves to the sealed preregistration commit.
- `scenarios.v1.json` has SHA-256
  `97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69`.
- Foundry 1.7.1, forge-std 1.10.0, and OpenZeppelin 5.4.0 match
  `spec/source-lock.json`.
- No M1-M5 run is admissible until M0 passes all 42 scenarios.

## Execution

```bash
cd experiments/paper85-evaluation/contracts
node ../scripts/generate-m0-tests.mjs --check
node ../scripts/run-m0.mjs
```

The generator derives all test actions and exact expected errors from the
sealed manifest. The Foundry harness restores the same snapshot before each
arm, fixes chain ID 31337 and genesis timestamp 1710000000, advances one block
per operation, and preserves deployment nonce order so contract addresses are
identical.

For each scenario it compares:

- acceptance and complete ABI return/revert data;
- normalized action-event digest;
- balances, allowances, supply, whitelist, queues, lifecycle records, roles,
  bindings, NAV history, and Gate state; and
- rejected-operation pre/post state equality.

`run-m0.mjs` executes the 42 tests twice and requires all semantic state/event
digests to match across repetitions. Results are written under `results/`,
which is intentionally ignored by Git and uploaded by the dedicated CI job.
The SHA manifest covers both raw Forge JSON files and both normalized
observation files; `run-summary.json` records the SHA of that evidence
manifest and is excluded from it to avoid a circular digest. The runner also
records the executing HEAD, branch, dirty-worktree flag, and a stable
`semanticEvidenceSha256` over normalized observations. Failed runs retain a
`failure.json` and their own evidence manifest.

Canonical normalized evidence is committed under `docs/evidence/paper85/`.
Complete raw Forge output must also be attached to a non-expiring GitHub
Release; a 90-day Actions artifact alone is not a permanent evidence anchor.
