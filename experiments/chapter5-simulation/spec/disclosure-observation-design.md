# Disclosure and Observation Design

## Scope

T10 transforms successful Oracle risk snapshots into regime-specific information events and schedules investor observations. It does not update beliefs, draw redemptions, execute Gate, or model control-event disclosure.

The implementation imports the hash-locked Chapter 3 `regimes.ts` and observation helper. It does not maintain a second R0-R4 parameter table or a second disclosure-time formula.

## Audience and regime semantics

| Regime | Public risk information | Public time | Regulator information | Regulator time |
| --- | --- | --- | --- | --- |
| R0 | aggregate band | next 604800-second epoch boundary | exact score | same periodic boundary |
| R1 | exact score | submitted time | exact score | submitted time |
| R2 | aggregate band | submitted time | exact score | submitted time |
| R3 | exact score | submitted time + 86400 seconds | exact score | same delayed boundary |
| R4 | tiered band | submitted time | exact score | submitted time |

Public aggregate and tiered bands map to deterministic integer midpoints: green 2000, yellow 5000, and red 8000 bps. The mapping is a Stage 2 belief input approved for parameter sensitivity; it does not claim that the public endpoint exposes a hidden exact score.

When several snapshots for one fund share one disclosure boundary, only the latest submitted snapshot is released at that boundary. This is essential for R0: intraperiod submissions remain unavailable and do not leak through duplicate public observations.

The timeline contains scheduled disclosure events. Before an event's `disclosedAt`, the available information state is `unknown`; no zero-risk observation is manufactured. The T11 belief module preserves the investor's prior while no event is available.

## Threshold identification and censoring

Regulators can identify any threshold from the exact score. Public detailed views can do the same. Aggregate and tiered views can identify only the frozen yellow/red boundaries. An arbitrary threshold that cannot be recovered from the public band is marked `thresholdIdentifiable=false`; later DetectionLag output must use `censored` with reason `threshold_not_identifiable` rather than a fabricated large lag.

## Investor observation schedules

Each investor receives a deterministic schedule generated from:

```text
(observationSeed, replicateId, investorId, module='observation-schedule', tick=0, purpose)
```

No regime or mechanism label is included, so paired R0-R4 and ablation arms use identical schedules. Pilot values are:

- start phase sampled at second resolution from `[0, 86400)` after the schedule anchor;
- polling interval sampled from 3600, 21600, or 86400 seconds;
- synchronicity bucket width of 86400 seconds.

These are pilot design values and must be frozen or revised before formal preregistration. First observation time directly reuses `firstScheduledObservationAt`. If multiple snapshots for the same fund become visible before one poll, the investor observes only the latest one. The investor observation object omits the source snapshot's hidden submission time. Internal disclosure provenance retains it for deterministic coalescing and audit joins, but aggregate behavior cannot consume it as an undeclared signal.

## Signal synchronicity

SignalSynchronicity is derived from realized observation times. For bucket counts `n_b` and total observations `N`:

```text
SignalSynchronicityBps = floor(10000 * sum_b(n_b^2) / N^2)
```

The value is 10000 when every observation falls in one bucket and decreases as observations spread across buckets. Empty input returns zero. The one-day bucket is the pilot baseline and must be included in sensitivity or explicitly frozen before formal execution.

The R0-versus-R1 unit test is a mechanism-local check: identical staggered source snapshots and identical investor schedules are supplied to both regimes, and only the frozen frequency rule changes. It verifies boundary coalescing, not the paper's behavioral hypothesis or redemption outcome ranking.
