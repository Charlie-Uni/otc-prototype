# Chapter 5 Model Semantics

## Time

- One abstract tick equals 86400 Unix seconds.
- A run lasts 90 days.
- Main outcomes use `[shockAt, shockAt + 30 days)`.
- Robustness windows use `[shockAt, shockAt + 60 days)` and `[shockAt, shockAt + 90 days)`.
- R0 shocks are uniform over every second of a 604800-second reporting cycle and remain identical across paired runs.

## Within-tick causal order

1. Apply the exogenous shock.
2. Submit Oracle state.
3. Apply programmable control.
4. Apply the disclosure regime.
5. Execute investor observation schedules.
6. Update investor beliefs.
7. Draw redemption decisions.
8. Queue and settle accepted redemptions.
9. Update NAV and liquidity state.
10. Propagate real and signal-analogy effects across funds.

The order is a versioned model contract and has a regression test.
Step 2 publishes any due opening-of-tick valuation and risk snapshot. Step 3 consumes that successful snapshot exactly once. Step 9 updates post-settlement economic NAV and liquidity for the next tick; it does not publish a second Oracle snapshot.

## Randomness and paired counterfactuals

Each draw is identified by `(masterSeed, replicateId, entityId, moduleId, tick, drawPurpose, ordinal)`. There is no mutable global random stream. A disabled mechanism cannot shift unrelated draws. Known decision slots remain addressable even if their output is overridden by a control.

## Detection and intervention

- Detection occurs when raw `riskScoreBps >= tau`.
- Intervention occurs when `riskScoreBps > kappa`.
- `RegulatorDetectionLag` is the main detection measure.
- `censored` is reserved for a detection threshold that is not disclosed or not identifiable at the available granularity.

## Oracle and risk updates

- The six metrics and score reuse the frozen Chapter 3 calculation functions.
- NAV cadence follows each fund's 1/7/14-day stale-pricing tier and is anchored to valuation `asOf` time.
- Stale-pricing age uses the last successful NAV submission time; raw seconds and normalized risk are both retained.
- Oracle latency and execution failure are deterministic paired treatments. Failed attempts do not mutate state.
- Baseline zero latency and zero failure are pilot defaults, not preregistered formal values.
- Investor concentration is recomputed from runtime registered balances, whose sum must equal total supply.

## Redemption and settlement

- The binary redemption decision is converted to requested shares by configurable `redemptionRequestFractionBps`; the 10000-bps pilot value is a modeling input rather than a thesis-prescribed constant.
- Investor decision pressure and requested-share pressure are retained as separate measures and are never substituted for each other.
- RedemptionRequestPressure is the forward-looking behavioral signal and follows the Chapter 3 request-flow implementation.
- Settled redemption pressure is exported separately and is not substituted for request pressure.
- `pending` is reserved for an unsettled redemption request.
- If cash is exhausted and assets cannot be sold, cash never becomes negative and the request remains pending.
- Baseline settlement is whole-request settlement, matching the artifact state machine; no partial settlement is invented.
- Settlement uses the reported NAV at settlement time and integer floor rounding. Cash is consumed before deterministic forced asset sales.
- A request that would redeem all remaining shares stays pending because fund liquidation and terminal NAV accounting are outside the model scope.
- At the 90-day horizon, pending count, shares, amount, and rates are reported explicitly.

## Loss accounting

- `LossMagnitude` is the NAV/AUM loss relative to initial AUM and is the primary loss measure.
- Normal settlement principal is added back to ending AUM before loss measurement so redemptions are not misclassified as economic loss.
- `FireSaleDiscountLoss` is the realized discount from forced asset sales and is a mechanism-decomposition measure.
- The two measures are reported separately and are not added, because market-value loss may already contain the sale-price effect.

## Disclosure and beliefs

- Detailed disclosure supplies the exact score.
- Aggregate and tiered disclosure supplies the disclosed band midpoint.
- Unknown information preserves the previous belief; the first unknown observation uses the initial prior.
- SignalSynchronicity is calculated from realized observation times, not assigned by regime label.
- ExpectedOthersRedeem depends on the public signal, realized synchronicity, and lagged request pressure.
- Risk disclosure events are absent before their policy time; this absence is `unknown`, not a zero-risk signal.
- Same-fund snapshots that share one disclosure boundary are coalesced to the latest submitted snapshot.
- Observation schedules are paired across regimes because their random identity contains no regime label.
- Investor-fund beliefs use a 2000-bps pilot prior. Unknown information retains the existing belief; an available exact or band observation replaces it without smoothing.
- The pilot `ExpectedOthersRedeem` function is a 4000/3000/3000 convex combination of public risk, realized synchronicity, and lagged request pressure. It is an operationalization of the thesis `g(.)`, not an empirical estimate.
- Individual redemption uses the thesis Logistic form with configurable `a0`-`a5`. Pilot slopes are nonnegative and formal ranges remain subject to preregistration and sensitivity analysis.
- Redemption decisions use a fixed counter-based draw for each investor, fund, replicate, and tick. Control stages may override execution but cannot skip or redraw that slot.

## Control boundary

The Chapter 3 artifact triggers Gate automatically and releases it through a regulator transaction carrying `reasonHash`. The simulation adds a rule-based release after `k` successful evidence periods at or below kappa plus a regulatory delay counted only by later qualifying successful periods. Missing or failed Oracle periods freeze progress. This is a Stage 2 model extension, not a claim about the deployed artifact.

Control strength uses `phiBps in [0,10000]`. For `phi<10000`, requests enter the queue and the formula defines a deterministic per-period settlement-value budget. Whole requests settle FIFO, unused budget carries forward, and no Gate random draw is used. Only `phi=10000` blocks new requests and settlement, matching the artifact's full-freeze endpoint. Equality at kappa does not trigger Gate but does qualify as release evidence.

## Network propagation

- `FundNetworkProximity` is the chi-weighted sum of shared illiquid assets, investor overlap, common service provider/manager, and valuation-method similarity.
- Asset and investor components use weighted Jaccard overlap. Common manager and common service provider contribute one half each to their combined component.
- Seeded structural relation weights remain fixed within a run so one-dimension channel ablations stay paired. Economic AUM, asset positions, share balances, risk states, and redemption states remain dynamic.
- An illiquid asset sale marks down the same asset in other exposed funds using the realized source price impact. It changes economic AUM and asset positions, but not reported AUM before a later Oracle update.
- Investor-overlap pressure, disclosed public risk, and disclosed public control events create next-period spillover-redemption inputs. Private or not-yet-disclosed events supply no public signal input.
- The common-asset, investor-overlap, and signal-analogy channel families can be disabled independently without renormalizing chi weights.
- Pilot chi and transmission coefficients are operational inputs, not empirical estimates or preregistered formal values.

## Pilot interpretation

Mechanism-local checks are mandatory: no-shock stability, shock-to-score monotonicity, lower-buffer vulnerability, coefficient signs, and controlled-fund settlement/buffer monotonicity under increasing phi. R0-R4 outcome rankings, including R1 versus R0 redemption acceleration, are diagnostic results and never pass/fail gates.

The model identifies mechanism direction and institutional tradeoffs. It does not claim empirical calibration or point prediction of real fund failure.
