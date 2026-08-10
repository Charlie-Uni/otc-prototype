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
