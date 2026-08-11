# Chapter 5 Formal Execution Semantics

This document describes the post-preregistration execution implementation. It does not amend the
locked analysis plan, formal matrix, expected directions, replication counts, or exclusion rules.

## Treatment compilation

Every row of `formal-experiment-matrix.json` is compiled through an explicit path switch. Unknown,
duplicated, malformed, or unimplemented paths fail before simulation. No generic deep-object writer
is used. Network scale expands atomically to fund, investor, and asset-class counts. Risk-weight
scheme identifiers expand atomically to the exact Chapter 3 equal or legacy six-weight vector.
When the control-mechanism kappa is 1500 bps, the compiler also adds that value to the config's
validation scan without changing any paired treatment contrast.

The A1 mechanism switch removes public risk disclosures, investor observations derived from them,
and `public_risk` propagation sources. It does not remove regulator disclosures, public control
events, economic transmission, or any other transparency-regime dimension.

## Paired shock coordinates

All arms derive the shock second and target from the same counter-based random identity. The
network-scale comparison selects the target from the first ten baseline fund identifiers in both
arms, so expansion to twenty funds does not change the treated fund. Shock type and magnitude never
enter the random key.

## Robustness shocks

- **Valuation:** reduce target illiquid positions and economic AUM by the declared fraction of
  pre-shock AUM. Reported state remains unchanged until the Oracle cadence permits an update.
- **Liquidity:** increase the target's `LiquidityShortfall` by the declared bps amount, capped at
  10000 bps. The corresponding liquid-asset value is reclassified into the target's existing
  illiquid positions using deterministic largest-remainder allocation. Economic and reported AUM
  do not change at injection.
- **Redemption:** create registered pending requests equal to the declared bps fraction of target
total shares. Requests are allocated across current holders with deterministic largest
remainders, enter the ordinary queue, and use the ordinary settlement state machine. The evidence
record stores pre-shock total shares so the declared pressure can be recomputed without relying on
an implicit no-subscription assumption. Oracle request pressure uses the rolling interval `(t-w,t]`,
so a request injected at the current event time is included without extending the window at its
older boundary.

The three robustness anchors therefore measure a paired increase in `valuationHaircutBps`,
`liquidityShortfallBps`, or `redemptionPressureBps`, respectively. `pending` remains a redemption
lifecycle status and is not treated as detection censoring.

## Execution gate and provenance

The formal executor requires annotated tag `chapter5-sim-prereg-v1`, requires the execution commit
to descend from that tag, compares the current preregistration lock byte-for-byte with the tagged
copy, rejects uncommitted files under `experiments/chapter5-simulation`, and reruns the lock checker
before a result is accepted. Each result records the tag commit,
execution commit, lock hash, matrix design hash, cell, replicate, treatment digest, and scenario.
Unit tests may inject a test authorization object, but the production executor defaults to the Git
and lock-backed gate.

## Pair measurements and shard execution

Formal work is partitioned by paired replicate rather than by single arm. Both arms of one pair use
the same execution authorization and remain in memory only until their compact observation is
derived. The observation retains the locked 30-, 60-, and 90-day outcome metrics, the regulator's
warning-threshold result, the treatment and run digests, and the complete shock coordinates needed
to audit pairing. Primary-policy pairs additionally retain the shock-linked DetectionLag object.
Robustness shock-type pairs retain both arms' metric vectors; their contrast is the locked paired
increase in the corresponding valuation-haircut, liquidity-shortfall, or redemption-pressure input,
not an invented no-shock arm.

With a maximum of 50 paired replicates per shard, the locked 144-cell matrix compiles to 72 pairs,
43,000 paired replicates, 86,000 single-arm runs, and 860 shards. The plan validator requires two
cells per pair, equal replicate counts, unique shard identifiers, contiguous half-open ranges, no
unknown pairs, and exact coverage of every replicate. These counts are design facts, not findings.

Successful shard files are published from a completed temporary file without replacing an existing
path. Repeating an identical shard is idempotent; an existing valid shard with a different semantic
digest is rejected. Every shard and nested arm/observation has a canonical semantic digest. Failure
records are written separately and never replace successful evidence. Raw daily trajectories are not
persisted by this layer; they are reduced immediately to the preregistered analysis windows so the
formal run remains bounded in memory and storage.

## Merge and paired inference boundaries

Final analysis accepts only the exact successful file set named by one shard plan. Every file is
revalidated against the plan, all nested digests are recomputed, and every shard must carry the same
preregistration and execution authorization. Missing, unknown, malformed, mixed-commit, or conflicting
shards fail closed. Technical-failure records remain part of the run-instance manifest but do not alter
the semantic digest of the complete successful result set. Observation callbacks begin only after a
complete validation pass; the second streaming pass rechecks every shard digest before use.

Pair contrasts use the canonical arm order stored in each observation: `shock - no_shock` for primary
policy pairs and `baseline - comparison` for ablation, robustness, and behavior-LHS pairs. The code
reports the signed value and never treats an expected hypothesis direction as a validity condition.
Network-scale arms have different fund sets, while shock-type arms have different scenario identities;
their fund-by-fund SpilloverScope is therefore marked structurally non-comparable instead of forcing an
invalid join. Their normalized arm-level outcomes remain available for robustness reporting.

Streaming estimates use Welford moments, paired Monte Carlo standard errors, and the locked 95% normal
interval. Two-sided normal p-values are adjusted by the Holm step-down method independently within each
hypothesis family. These functions are fixed before formal outputs are read; the later report builder may
only map locked contrasts to H1-H6 and may not introduce a result-dependent metric or exclusion rule.

## Report mapping and resumable execution

The report mapping is fixed before formal shard generation. R0-R4 comparisons join only observations
with the same valuation-shock magnitude, replicate, shock second, and target fund. Detection differences
remain missing when either side is censored and retain the contributing censor reason. The report includes
detected/censored counts and rates for both the paired shock-linked clock and the 6000-bps warning-threshold
sensitivity clock; it never replaces missing lags with zero. Thirty-day rows form the
primary inference family, while 60- and 90-day rows are labeled window robustness and do not enlarge the
primary Holm family.

Direct ablations preserve `baseline - comparison`. For control-strength rows the production matrix places
full control first, so H5 loss and liquidity benefits are deliberately reported as lower-control harm minus
full-control harm; positive values favor stronger control. All three mentor-confirmed control-cost components
(frozen share, extra wait, and pending share) remain separate. Loss reduction reports absolute bps and the
relative reduction against lower-control loss, with a missing relative value when that denominator is zero.
SpilloverScope reports both the continuous unshocked-fund mean and the 500-bps affected-fund share; 250- and
1000-bps affected-share rows remain threshold robustness. Other robustness and behavior-LHS cells are
streamed into a supplementary table and are not promoted into a new main-hypothesis test. The same table
retains each R0-R4 policy pair's descriptive `shock - no_shock` redemption, loss, liquidity, control-cost,
and spillover summaries so Chapter 6 tables do not require a second pass over raw shards.

The bounded executor uses validated immutable shard files as its only checkpoint. It skips only a shard
whose plan and execution authorization match the current run, stops assigning new work after a worker
failure, and relies on the existing per-shard failure evidence. The deterministic plan is itself published
without replacement. Final merging requires a quiescent directory with no `.partial-*` publication and the
exact expected successful shard set before any observation reaches the statistics accumulator.
