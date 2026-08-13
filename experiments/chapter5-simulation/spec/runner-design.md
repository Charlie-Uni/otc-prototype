# Full Simulation Runner Design

## Scope

T15 composes the tested economic, disclosure, behavior, control, liquidity, and network modules into one deterministic replicate. It is orchestration code, not a second implementation of those mechanisms. R0-R4 timing and visibility continue to use the hash-locked Chapter 3 policy functions.

## Run identity and pairing

A run is identified by a treatment, one pre-generated valuation-shock scenario, its replicate ID, and a horizon no longer than 90 configured days. The runner regenerates the network and shock candidates and rejects a scenario that does not exactly match its configuration.

Paired counterfactuals must have the same scenario and horizon. Network, shock, Oracle, observation, and behavior seeds are protected and cannot be waived by an ablation allow-list. Gate control is deterministic and has no random seed. Every other changed leaf field must be listed explicitly. This makes the common-random-number convention machine-checkable.

## Tick clock and stage order

The run clock is anchored at `shockAt`, not at a calendar-day boundary. For tick `t`:

- `tickStartedAt = shockAt + t * 86400`;
- `decisionAt = tickStartedAt + 86399`;
- Oracle latency and retries must finish before `decisionAt` or the run fails closed;
- all funds share one Oracle `occurredAt`, while transaction completion order may differ;
- the primary redemption-pressure window is event-time anchored and excludes same-tick decisions.

The fixed stages are shock, Oracle submission, Gate evaluation, disclosure, observation, belief update, redemption decision, queue and settlement, post-settlement NAV/liquidity state, then network propagation. Network outputs from tick `t` enter behavior at tick `t+1`.

## Disclosure, observation, and beliefs

Risk disclosure uses the existing `createRiskDisclosure` implementation through an object-parameterized timeline adapter. This supports one-dimension experiment packages without changing the frozen R0-R4 source.

Control transitions use the same `disclosureTimeFor`, `regulatorUsesDisclosureBoundary`, and `controlDisclosureAllowedFor` functions. R2 exposes control events to the regulator but not the public. R4 preserves state-dependent trigger and release disclosure. Only a disclosed `GateTriggered` event is a distress signal; `GateReleased` remains auditable but does not create redemption pressure.

Investor observations use heterogeneous schedules and are deduplicated globally by investor, fund, and poll time, retaining the latest submitted source at a shared poll. `unknown` preserves the prior. Signal synchronicity is calculated only over current holders of the relevant fund.

## Redemption and propagation

The existing Logistic behavior model produces the base probability and one counter-based random draw. A previous-tick fund-level spillover rate is added to that probability and capped at one; the same draw is reused. This is a pilot operationalization of the reduced-form spillover term and must be frozen or revised before formal preregistration.

Requests are queued for every active holder. Partial Gate strength applies only through the settlement-value budget; the full-freeze endpoint also blocks new requests. Settlement runs once after all fund decisions. New asset sales, request pressure, newly disclosed public risk, and newly disclosed Gate triggers then propagate. Private and future control events provide no signal input.

## Evidence and runtime storage

Each tick records timing, stage order, Oracle and control outcomes, disclosure IDs, observation counts, behavior summaries, queue and settlement summaries, propagation summaries, and post-tick fund state. The complete result receives a canonical SHA-256 semantic digest.

Historical propagation records are detached from the frequently cloned economic state during the loop, retained in an append-only runner archive, restored to `finalState`, and fully validated once at completion. This changes runtime cost only: all records and provenance remain in final evidence, and the runner independently rejects repeated sources.

The baseline 90-day golden run is a deterministic functional test, not a Chapter 6 result or a preferred-regime assertion.
