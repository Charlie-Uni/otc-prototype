# Chapter 5 Requirements Traceability

## Source precedence

1. `论文框架0630.docx`, Chapters 5 and 6.
2. `第 3 章 区块链赋能的 OTC fund 生命周期可观测系统与透明度制度.docx`.
3. Mentor-confirmed simulation specification in `副本待确认清单2(1).pdf`.
4. Frozen implementation semantics from `chapter3-artifact-v1.4.0`.

Paper 8.5 evaluation code and evidence are separate and are not simulation inputs.

## Hypothesis mapping

| Hypothesis | Mechanism implemented | Paired counterfactual | Primary outputs | Chapter 6 |
| --- | --- | --- | --- | --- |
| H1 | Frequency, visibility, and delay determine regulator disclosure time | Same shock and seed under R0-R4 | RegulatorDetectionLag, DetectionBenefit | 6.2 |
| H2 | Public signal, observation synchronicity, prior redemption pressure, and first-mover advantage affect individual redemption probability | Same state with publicness or timing mechanism changed | RedemptionAcceleration, PeakRedemption | 6.2 |
| H3 | Regulator-only and tiered disclosure preserve regulatory detection while limiting public coordination | R1 vs R2/R4 with matched mechanism settings | DetectionBenefit, RedemptionAcceleration, ControlCost | 6.2 |
| H4a | Common illiquid assets and investor overlap transmit losses and redemption demand | Disable one real-transmission edge family | SpilloverRedemption, SpilloverScope, LossMagnitude | 6.3 |
| H4b | Common providers, managers, and valuation methods transmit analogous public signals | Disable signal-analogy edges | SpilloverRedemption, PublicControlSpillover | 6.3 |
| H5 | Programmable controls reduce settlement outflow, buffer depletion, and loss transmission | Same seed with control disabled or lower phi | LossReduction, ControlCost, LiquidityBufferDepletion | 6.4 |
| H6 | Public control events change beliefs and redemption demand in proximate unshocked funds | Same control path with ControlDisclosure switched | PublicControlSpillover, SpilloverScope | 6.4 |

## Required one-dimension ablations

| ID | Fixed dimensions | Changed dimension | Identification target |
| --- | --- | --- | --- |
| A1 | Frequency, granularity, delay, control rule, seed, shock | public vs regulator-visible | Public information effect |
| A2 | Visibility, granularity, control rule, seed, shock | immediate vs delayed | Disclosure timing effect |
| A3 | Visibility, timing, control rule, seed, shock | detailed vs aggregate | Information granularity effect |
| A4 | Network, regime, seed, shock | investor-overlap edges on vs off | Investor network effect |
| A5 | Network, regime, seed, shock | common-asset edges on vs off | Asset overlap effect |
| A6 | Control state, regime dimensions, seed, shock | public vs non-public control event | Control signal spillover |

R0-R4 are policy packages. A1-A6 use custom experiment configurations in the independent runner and do not expose a production API.

## Robustness coverage

| Dimension required by Chapter 5.5 | Planned treatment | Status before formal run |
| --- | --- | --- |
| Network structure and size | Baseline 10 funds/200 investors/5 assets; larger network scan | Required |
| Investor overlap | One-dimension overlap scan and A4 | Required |
| Illiquid asset share | One-dimension share scan | Required |
| NAV update frequency | One-dimension frequency scan | Required |
| Redemption delay | One-dimension settlement-delay scan | Required |
| Information granularity | A3 plus aggregate/tiered sensitivity | Required |
| Visibility and publicness | A1 and A6 | Required |
| Control threshold | kappa in 5000/6000/7000/8000 bps | Required |
| Control strength | phi in 0/0.25/0.5/0.75/1 | Implemented, not frozen |
| Control release | k in 1/3/5 periods and delay in 0/1/3 days | Implemented simulation extension, not frozen |
| Shock magnitude and type | Valuation -10/-20/-30%; liquidity and redemption robustness | Required |
| Behavior coefficients | Parameter grid or Latin Hypercube sampling | Required |
| Risk-score weights and stale normalization | Equal/legacy weights and 7/14/30/45-day MaxStaleAge scan | Required |
| Price-impact nonlinearity | Gamma=1 baseline plus nonlinear gamma sensitivity | Required |
| Monte Carlo size | Pilot 100; formal at least 500; key robustness 1000 | Required |
| Oracle latency | Implemented deterministic latency/retry hook; values frozen before preregistration | Implemented, not frozen |
| Contract execution failure | Implemented paired failure hook with fail-no-state-change semantics; rates frozen before preregistration | Implemented, not frozen |
| Network proximity weights | Chi component weight sensitivity | Required |
| Composite stability weights | Alternative weights for supplementary index only | Supplementary |

No silent omission is allowed. Any descope decision must be added to this table with a reason before formal preregistration.

T14 implements all four proximity components, exact shared-asset loss propagation, investor-overlap demand propagation, and public risk/control signal propagation. The equal chi weights and full pass-through pilot coefficients remain unfrozen until pilot diagnostics and preregistration.

T15 composes these mechanisms into the fixed ten-stage runner. It checks paired seeds, scenarios, horizons, and allowed treatment differences; applies network demand only in the next tick; and emits deterministic tick evidence. The additive probability mapping for incoming spillover is a pilot parameterization and is not a formal result until preregistered.

T16 implements eight mechanism-local sanity gates and a separate R0-R4 diagnostic table. Regime rankings never affect pass/fail. Saturated request pressure or latent demand is emitted as a calibration flag that must be resolved before formal preregistration.

T17 implements the Chapter 6 measurement layer without changing the state machine. It separates three DetectionLag clocks, accepted versus latent redemption demand, pending versus censored outcomes, flow-adjusted economic loss, liquidity depletion, paired spillover scope, control cost, loss reduction, and the supplementary weighted stability index.

T17.5 screens declared behavior and demand-transmission parameters only for a stable, interior pilot. It preserves paired seeds, leaves shared-asset loss pass-through unchanged, forbids hypothesis-direction gates, validates the selected candidate over 100 pilot replicates, and derives formal replication recommendations from paired standard errors before T18 preregistration. It also demonstrates that none of the preregistered global `tau` candidates from 200 to 1200 bps reaches the 95% minimum shocked-run coverage across all R0-R4 arms. RegulatorDetectionLag precision therefore remains unavailable, not zero, until T18 freezes the detection-anchor method.

## Stage 1 to Stage 2 continuity gate

Before model pilot execution, the simulation foundation must reproduce:

- the exact R0-R4 parameter packages and disclosure boundaries;
- the equal-weight score vector result `3499`;
- detection comparison `score >= tau` and intervention comparison `score > kappa`;
- the v1.4.0 detection evidence: R1/R2/R4 zero policy delay, R3 86400 seconds, and R0 aligned to a 604800-second epoch boundary;
- `firstScheduledObservationAt(1101, 1000, 60) = 1120`.

The canonical evidence source is `docs/evidence/chapter3-summary.json`: 88 contract tests, 99 API tests, and 98.54% production-contract line coverage.
