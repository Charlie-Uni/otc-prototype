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
riskScoreBps < kappaBps
```

Equality at kappa is a neutral boundary: it neither triggers a new Gate nor qualifies for release. Missing successful Oracle ticks break the consecutive-low-score streak. Once the streak is met, release occurs after `releaseDelayTicks`, provided each intervening successful period remains below kappa. Pilot values are `k=3` and one regulatory-delay tick; scans use `k in {1,3,5}` and delay in `{0,1,3}`.

## Control strength

Control strength is represented in basis points, `phiBps in [0,10000]`. The continuous attenuation envelope is:

```text
ControlledOutflow = floor(UncontrolledOutflow * (10000 - phiBps) / 10000)
```

`phi=0` has no mechanical restriction and `phi=10000` reproduces the Chapter 3 artifact's full freeze. The required sensitivity grid is `{0,2500,5000,7500,10000}`.

The settlement state machine does not invent partial settlement. Therefore intermediate phi values use a deterministic whole-request admission rule. Each request receives one counter-based draw keyed by control seed, replicate, fund, investor, request ID, and request tick. The request is blocked when `drawBps < phiBps`. The same draw is reused across paired phi runs, so the admitted request set can only shrink as phi rises. A newly blocked request does not enter the queue, matching the Chapter 3 request-entry Gate; its latent shares and investor count remain in the tick summary. A pre-existing queued request blocked at settlement remains `pending` and may settle after Gate release.

## Audit state and ordering

Every transition records its source Oracle submission, source occurrence time, transition time, raw score, kappa, and active phi. State validation requires:

- every transition references an existing, matching Oracle snapshot;
- trigger and release transitions alternate per fund;
- trigger sources satisfy `score > kappa` and release sources satisfy `score < kappa`;
- current Gate state can be reconstructed from the last transition;
- at most one successful Oracle snapshot awaits control processing per fund.

The versioned tick order is shock, Oracle submission, programmable control, disclosure, observation, belief update, redemption decision, queue/settlement, NAV update, and network propagation. This ordering ensures a control event cannot be disclosed before it exists.

## Interpretation boundary

- Baseline phi, release streak, and delay are pilot inputs, not empirical estimates or regulatory standards.
- Mechanical Gate effects apply only to the controlled fund. System-wide outflow may rise when public control disclosure later creates signal spillovers; that H6 result is not a failed local invariant.
- T13 does not decide whether a control event is public, delayed, tiered, or private. It only produces the auditable event consumed by the later disclosure mechanism.
- Triggering remains automatic; release in the simulation is deterministic rather than the artifact's manual regulator action.
