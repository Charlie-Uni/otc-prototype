# Oracle and Risk Update Design

## Purpose and boundary

This module converts economic state into the six Chapter 3 risk metrics and a submitted Oracle snapshot. It is the `submit_oracle_state` stage of the frozen within-tick pipeline. The implementation does not execute Gate, investor behavior, settlement, or network propagation.

The simulation models NAV and risk publication as one atomic Oracle transaction. This is an experimental abstraction of the authorized submitter layer, not a claim that every production deployment must combine those roles.

## Six metric sources

All normalized values and the weighted score are denominated in basis points and reuse the vendored Chapter 3 calculation functions.

| Metric | Runtime source | Rule |
| --- | --- | --- |
| ValuationHaircut | previous reported AUM and current economic AUM | Recomputed when a scheduled NAV update is due; the last reported value persists between NAV updates |
| RedemptionRequestPressure | requested shares in the analysis window and current total shares | Forward-looking request-flow ratio, capped at 10000 bps |
| RedemptionQueueRatio | queued shares and current total shares | Queue ratio, capped at 10000 bps |
| LiquidityShortfall | current liquid asset positions and expected redemption claims | `max(0, 10000 - LiquidityBufferRatioBps)` |
| StalePricingRisk | raw seconds since the last successful NAV submission | `min(staleAgeSec / MaxStaleAgeSec, 1)` |
| InvestorConcentration | current registered holder balances | HHI after deterministic largest-remainder conversion to shares bps |

Expected redemption claims are the fund's initial AUM multiplied by its configured claims ratio. This denominator is a model parameter and is not inferred from future redemptions.

The baseline score uses the equal-weight vector `[1667,1667,1667,1667,1666,1666]`, which sums to 10000. `maxStaleAgeDays=30` is the pilot baseline. Both are provenance fields in every successful snapshot and remain robustness dimensions before formal preregistration.

## NAV cadence and timestamps

Funds use the heterogeneous 1/7/14-day NAV intervals generated in T7. A scheduled update is due when:

```text
occurredAt - lastValuationAsOf >= navUpdateIntervalDays * 86400
```

`occurredAt` is the valuation/risk event time and NAV `asOf`; `submittedAt` is the successful transaction attempt time. Cadence is anchored to `lastValuationAsOf`, while stale-pricing age is anchored to the last successful submission time. This preserves the Chapter 3 distinction between economic occurrence and on-chain recording.

When NAV is due, reported AUM and NAV move to current economic state, the valuation haircut is recomputed, and stale age resets to zero. When NAV is not due, reported valuation state stays unchanged and raw stale seconds continue accumulating.

## Latency, failure, and retries

Oracle latency and execution failure are real treatment hooks. Pilot defaults are zero seconds and zero failure bps; formal values will be frozen before `chapter5-sim-prereg-v1`.

- Attempt time is `occurredAt + latencySec + retryIndex * retryDelaySec`.
- An attempt fails when its deterministic draw is below `executionFailureBps`.
- Draw identity includes Oracle seed, replicate, fund, tick, and attempt number, but no regime or mechanism label.
- A failed attempt changes no simulation state.
- A retry uses the same derived candidate; only its attempt and submission times change.
- Attempts are bounded to 1-16 per submission.

Paired runs therefore receive the same Oracle failure path when their replicate, fund, tick, seed, and treatment are equal. T15 must additionally validate equal generated shock objects and equal Oracle treatments within every paired group.

If a configured latency crosses a later tick's event time, the experiment scheduler must process events chronologically. The Oracle module rejects retrospective submissions instead of silently reordering them.

## Detection and intervention

The submitted raw score is the only threshold input:

- detection: `riskScoreBps >= tau`;
- intervention indication: `riskScoreBps > kappa`.

Display bands and `riskLevel` do not participate. T9 records `interventionTriggered` for later control stages but does not mutate `gated`.

## State integrity

Successful snapshots retain raw stale seconds, raw liquidity-buffer ratio, six normalized metrics, weight configuration, score, thresholds, and attempt counts. State validation recomputes the weighted score and stale normalization. Runtime holder balances must sum exactly to total supply for every fund.
