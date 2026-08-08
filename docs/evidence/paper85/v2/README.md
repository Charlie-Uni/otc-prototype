# Paper 8.5 evaluation evidence v2

Evidence v2 hardens the post-preregistration execution and reporting layer. It
does not modify the sealed scenarios, expected errors, target predicates, or
ablation classifications in `paper85-prereg-v1`.

## Anchors

- Repository: `Charlie-Uni/otc-prototype`
- Branch at execution: `experiment/paper85-evaluation`
- Evaluation commit: `39693e58e5d4e1ee6ce7c1df6134d2e856dd343b`
- Worktree at execution: clean (`dirty=false`)
- Preregistration commit: `f3ff71de8fd4634cf37f2c9b980e0c7d92e436a2`
- Scenario manifest SHA-256: `97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69`
- Production artifact commit: `e5b1e126e5e7ff37f5fe47307d945447724a17d1`
- M0 run: `m0-20260808T072627647Z`
- Ablation run: `ablation-20260808T072635107Z`
- Verified CI run: `31246245332`
- CI head: `168be49e74bdefd192f716d53f361abea6b519f6`

## Results

- M0 production/experimental equivalence: 42/42.
- M1-M5 observations: 210/210 preregistered classifications matched.
- Targeted state assertions: 24/24 machine-verified.
- Targeted classifications: 22 `invalid_transition_accepted`, one
  `rejected_by_residual_guard`, and one `runtime_revert`.
- Repeated-run semantic observations: byte-identical.

Stable semantic hashes:

- M0: `56e78b202a16f5a8b236f107991b4c5804db54cfe7784b6b1681682b499f1c19`
- M1-M5: `5a344bcfd631b55b00c58bd78bd4da70a7b146b016e1b2241445e3eed509cf95`

The M1-M5 JSONL rows now include decoded baseline and ablated state for every
targeted scenario. Numeric values are strings to preserve full Solidity
integer precision. `stateAssertionVerified=true` means the Harness checked the
registered state claim, not merely that the two state digests differed.

## Maintainability change

The generated test layout now uses one shared `ScenarioFixtures.sol` plus thin
M0/M1-M5 test stubs. This removes duplicated fixture dispatch and scenario
construction while retaining one independently named Foundry test per sealed
scenario/variant pair. The change affects test Harness bytes, so v1 evidence is
kept as historical evidence and v2 is a complete rerun rather than a relabel.

## Raw evidence

The permanent Release contains both the canonical local rerun and the
independently executed CI artifact:

- `paper85-evaluation-v2-39693e5.zip`:
  `c67629b634c5bb10bc20b5744ecc8523f79f6ad8d00fcc09e756c6ca524bbeea`
- `paper85-evaluation-v2-ci-31246245332.zip`:
  `d2de86cc45b4e585436acf48bb30853ef3d3c22dd2dd3b6cd61a9355b227d4d7`

Both contain raw Forge runs, normalized observations, summaries, and
run-instance SHA manifests. Their stable semantic hashes are identical even
though run-instance metadata differs. Gas figures remain excluded: production
gas must be measured from `chapter3-artifact-v1.4.0`, never from
feature-flagged tests.
