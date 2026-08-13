# Programmable Control Model Design

## Scope and source

This stage implements the Chapter 5.4 programmable-redemption-control mechanism. It consumes successful Oracle risk snapshots and updates Gate state before disclosure and investor observation. It records control transitions for later control-event disclosure and network-signal propagation, but those two effects are not executed in this stage.

The Chapter 3 artifact automatically triggers Gate when `riskScoreBps > kappaBps` and requires a regulator transaction with `reasonHash` to release it. The simulation preserves the automatic trigger but adds a rule-based release so control duration is reproducible across Monte Carlo runs. This release rule is a Stage 2 model extension and must not be attributed to the deployed artifact.

## Trigger and release

The trigger boundary is strict:

```text
GateTriggered = 1[riskScoreBps > kappaBps]
```

Repeated above-threshold snapshots do not emit duplicate trigger transitions. An active Gate becomes eligible for release only after `releaseConsecutiveTicks` consecutive successful Oracle periods satisfy:

```text
riskScoreBps <= kappaBps
```

The release condition is the exact complement of the strict trigger boundary. Missing or failed Oracle periods freeze both the evidence streak and the remaining regulatory delay; they do not increment or reset either value. A successful period above kappa resets release progress. Once the streak is met, release occurs after `releaseDelayTicks` further qualifying successful periods. Pilot values are `k=3` and one regulatory-delay period; scans use `k in {1,3,5}` and delay in `{0,1,3}`.

## Control strength

Control strength is represented in basis points, `phiBps in [0,10000]`. The continuous attenuation envelope is:

```text
ControlledOutflow = floor(UncontrolledOutflow * (10000 - phiBps) / 10000)
```

`phi=0` has no mechanical restriction and `phi=10000` reproduces the Chapter 3 artifact's full freeze. The required sensitivity grid is `{0,2500,5000,7500,10000}`. For `phi<10000`, every otherwise valid request enters the queue; only the full-freeze endpoint blocks new requests.

The settlement state machine does not invent partial settlement. At the start of each settlement period, each gated fund receives a deterministic value budget equal to the formula above applied to eligible pending outflow valued at the batch-start reported NAV. Requests are processed FIFO and settle only when the whole settlement amount fits the available budget. Unused budget carries into later periods so a large queue-head request is not permanently excluded by integer whole-request settlement. A budget-limited request and all later requests for that fund remain `pending` with reason `gated`. No Gate random draw exists.

## Audit state and ordering

Every transition records its source Oracle submission, source occurrence time, transition time, raw score, kappa, and active phi. State validation requires:

- every transition references an existing, matching Oracle snapshot;
- trigger and release transitions alternate per fund;
- the first transition is a trigger; later trigger and release transitions alternate;
- trigger sources satisfy `score > kappa` and release sources satisfy `score <= kappa`;
- current Gate state can be reconstructed from the last transition;
- at most one successful Oracle snapshot awaits control processing per fund.

The versioned tick order is shock, Oracle submission, programmable control, disclosure, observation, belief update, redemption decision, queue/settlement, NAV update, and network propagation. This ordering ensures a control event cannot be disclosed before it exists.

## Correction record

On 2026-08-13, the T13 implementation was re-audited against the Chapter 5 mainline decisions. The earlier request-level random admission model, strict-below-kappa release rule, and reset-on-missing-tick rule were rejected because they changed request-pressure semantics and did not match the approved settlement-side control. This document and the T13 tests now define the corrected mechanism. `chapter5-sim-prereg-v1` and any formal shards produced from it remain immutable historical artifacts but are not valid evidence for the corrected model; formal execution requires a separately reviewed v2 preregistration.

## Interpretation boundary

- Baseline phi, release streak, and delay are pilot inputs, not empirical estimates or regulatory standards.
- Mechanical Gate effects apply only to the controlled fund. System-wide outflow may rise when public control disclosure later creates signal spillovers; that H6 result is not a failed local invariant.
- T13 does not decide whether a control event is public, delayed, tiered, or private. It only produces the auditable event consumed by the later disclosure mechanism.
- Triggering remains automatic; release in the simulation is deterministic rather than the artifact's manual regulator action.
