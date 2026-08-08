# Replay and Gas Measurement Method

This document fixes the measurement semantics used for Sections 6.3 and 6.4
of Paper 8.5. It extends the sealed replay protocol without changing the
preregistered 42-scenario manifest.

## Closed-input replay

The execution fixture contains 14 accepted state-changing operations covering
qualification, initial and formula-based NAV submission, subscription request
and acceptance, restricted transfer, redemption request and settlement,
settlement-delay recording, pause and resume, and role grant and revocation.
Each operation is mined in a distinct block under a fixed chain ID and genesis
timestamp.

Replay consumes only the frozen genesis configuration and ordered raw
`eth_getLogs` records. Contract views are disabled until every log has been
replayed. After reconstruction is complete, historical views are read solely
to calculate projection consistency.

Constructor and bootstrap-configuration logs are archived separately as
provenance for the trusted genesis state. They are not replayed and are not
included in the ARC denominator.

- ARC denominator: every accepted event in the captured lifecycle stream.
- NRI denominator: accepted subscription and redemption operations containing
  a versioned NAV reference. A reference is valid only when it is the latest
  recoverable version at execution and remains recoverable after later NAV
  versions are appended.
- PCR denominator: one projection checkpoint after each accepted
  state-changing operation.
- `censored` and `pending` are not used by this experiment.

The runner executes the full scenario twice on fresh deterministic Anvil
instances and requires identical semantic evidence hashes.

## Gas measurement

Gas is measured from transaction receipts produced by the unmodified
`chapter3-artifact-v1.4.0` production contracts. Feature-flagged ablation
contracts are excluded. Two batches of five fresh deterministic deployments
are executed and must produce identical gas tables.

Qualification updates, NAV submissions, restricted transfers, pause/resume,
and role updates are reported per transaction. Subscription is the sum of its
request and acceptance transactions per run. Redemption is the sum of its
request and settlement transactions per run. Settlement-delay recording is
reported separately because it is an optional lifecycle branch.

These values are descriptive local-EVM gas costs. Without a separately defined
unconstrained comparator, they do not estimate production fees or identify a
causal "moderate overhead" attributable to the constraint mechanism.
