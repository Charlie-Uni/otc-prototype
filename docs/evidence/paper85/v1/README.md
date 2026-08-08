# Paper 8.5 evaluation evidence v1

This directory preserves the small, semantically relevant evidence produced by
the Paper 8.5 M0 equivalence and M1-M5 ablation runs. Large Forge JSON outputs
remain release assets rather than tracked repository files.

## Anchors

- Repository: `Charlie-Uni/otc-prototype`
- Branch at execution: `experiment/paper85-evaluation`
- Evaluation commit: `4c2c3c5`
- Preregistration tag: `paper85-prereg-v1`
- Preregistration commit: `f3ff71de8fd4634cf37f2c9b980e0c7d92e436a2`
- Scenario manifest SHA-256: `97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69`
- Chapter 3 artifact tag: `chapter3-artifact-v1.4.0`
- Chapter 3 artifact commit: `e5b1e126e5e7ff37f5fe47307d945447724a17d1`

The final HEAD-compatible CI run used for M0 and M1-M5 evidence is GitHub
Actions run `31241819079`. The earlier M0-only run `31241411249` is retained as
historical evidence but is not the final citation because the M0 harness was
subsequently extended. Run `31241819034` is also HEAD-compatible for M0.

The downloaded artifact from run `31241819079` had SHA-256:

`4ccde6ec6a95da71ff8e5e2239fa4eca7a855142e6ad9225b677720fbf5e5606`

The permanent Release asset assembled from the canonical local deterministic
rerun is named `paper85-evaluation-v1-4c2c3c5.zip` and has SHA-256:

`fc6b79e204841fb58e80276baf6389f780df8a853315e9e34930693c8d71a518`

## Results

- M0 differential equivalence: 42/42 scenarios matched.
- M1-M5 ablation: 210/210 observations matched preregistered classifications.
- Targeted cases: 24 total, comprising 22 accepted invalid transitions, one
  residual-guard rejection, and one runtime arithmetic revert.
- Determinism: repeated semantic observations matched byte-for-byte.

`M1.jsonl` through `M5.jsonl` are the canonical classified ablation records.
`m0-observations.json` is the canonical normalized M0 record. The summary files
retain run-instance metadata; their hashes are therefore run-specific rather
than semantic identities.

## Interpretation boundaries

- I10/M3 is an inert ablation on that path: both arms revert with `NO_NAV` and
  have no state divergence. The NAV existence dependency remains structural;
  this case must not be described as a disabled predicate being replaced by a
  residual guard.
- The sealed `stateAssertions` were preregistered as prose. Evidence v1 proves
  classification and digest divergence, but does not yet machine-check each
  decoded before/after state field. That verification is assigned to evidence
  v2 without changing the sealed scenario expectations.
- Gas evidence must come from the production Chapter 3 artifact, not the
  feature-flagged experimental contracts.

## Preregistration history

The first preregistration workflow attempt failed before the formal seal. Its
commit was amended only to correct workflow/generator verification. Scenario
content remained byte-identical. `paper85-prereg-v1` is the earliest formal,
recoverable preregistration anchor, and no M0 or ablation result was run before
that tag.

The annotated tag message contains literal `\n` characters due to shell
quoting. This is a presentation defect only; the tag object, target commit, and
manifest hash remain valid. The existing tag must not be rewritten.

## CI boundary

The Paper 8.5 workflows were green at the cited evaluation commit. The Chapter
3 workflow at that HEAD stopped in dependency audit because of a later
`fast-uri` advisory before executing its test jobs. Production source files were
unchanged, but the Paper 8.5 commit must not be cited as a fresh green Chapter 3
CI run until that dependency/CI issue is resolved separately.
