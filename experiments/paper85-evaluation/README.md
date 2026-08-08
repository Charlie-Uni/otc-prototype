# Paper 8.5 Mechanism Evaluation

This directory contains the reproducible evaluation for Chapter 6 of the
English paper. It is deliberately isolated from the production Chapter 3
artifact.

## Evidence boundaries

- Production behavior and gas measurements come from
  `chapter3-artifact-v1.4.0`.
- Constraint ablation uses a generated, feature-flagged experimental variant.
  It is not a production contract.
- Chapter 5 fund-network simulation belongs in
  `experiments/chapter5-simulation/` and must not reuse results from this
  evaluation.
- Existing Chapter 3 claims remain anchored to commit
  `b5fe1c8ec2153d1e84e0492012be44a45182dfe2`.

## Quality gates

1. Commit the scenario manifest before executing any scenario.
2. Record the manifest SHA-256 in every run summary.
3. Require the all-constraints experimental variant (M0) to match the
   production contracts before running ablations.
4. Run every scenario from a fresh deployment or clean snapshot with fixed
   chain and time configuration.
5. Compare semantic state and event digests after removing transaction hash,
   block hash, gas, and other non-semantic fields.
6. Do not place a number in the paper unless it is traceable to a run summary
   and evidence manifest.

The 42-row manifest is immutable input. Scenario observations are written to a
separate `results/` tree whose run summary must satisfy
`spec/run-summary.schema.json` and reference the `paper85-prereg-v1` commit and
manifest hash.

## Current phase

The `spec/` directory is the preregistration package. Running the ablation
suite before this package is committed invalidates the preregistration claim.

Validate the package without executing scenarios:

```bash
node --test experiments/paper85-evaluation/scripts/validate-manifest.test.mjs
node experiments/paper85-evaluation/scripts/validate-manifest.mjs
node experiments/paper85-evaluation/scripts/generate-experimental-contracts.mjs --check
node experiments/paper85-evaluation/scripts/validate-guard-map.mjs
node experiments/paper85-evaluation/scripts/prereg-lock.mjs --check
(cd experiments/paper85-evaluation/contracts && forge test -vv)
```

`scenarios.schema.json` is the declarative interchange schema. The zero-runtime-
dependency validator is the executable authority and mirrors the schema with
exact-key checks, enums, fixture ordering, reference resolution, and explicit
rejection of post-run fields.
