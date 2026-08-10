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
