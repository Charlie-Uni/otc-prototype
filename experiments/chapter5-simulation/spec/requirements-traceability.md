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
| H4b | Common providers, managers, and valuation methods transmit analogous public signals | Disable signal-analogy edges | SpilloverRedemption, SpilloverScope | 6.3 |
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
| A7 | Network, regime, seed, shock, real-transmission channels | signal-analogy components on vs off | H4b signal-analogy spillover |

R0-R4 are policy packages. A1-A7 use custom experiment configurations in the independent runner and do not expose a production API.

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
| Signal analogy | A7 with R1 and all real-transmission channels fixed | Required |
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

T13 implements deterministic settlement-side Gate control. For `phi<1`, valid requests enter the queue and FIFO whole-request settlement consumes a `(1-phi)` value budget with unused budget carried forward; only `phi=1` blocks both new requests and settlement. Triggering remains `score > kappa`, while successful `score <= kappa` periods count toward the simulation-only release rule. Failed or missing Oracle periods freeze release progress. The 2026-08-13 correction removed the earlier request-level Gate random draw. Consequently `chapter5-sim-prereg-v1` and its 860-shard execution plan are retained only as historical artifacts and cannot authorize corrected formal results; a reviewed v2 preregistration is required.

T14 implements all four proximity components, exact shared-asset loss propagation, investor-overlap demand propagation, and public risk/control signal propagation. The corrected v2 candidate adds A7 because A4/A5 identify real channels but do not independently identify the thesis H4b signal-analogy channel. A7 changes only `config.propagation.channels.signalAnalogy`; it creates no direct accounting loss metric. The equal chi weights and full pass-through pilot coefficients remain unfrozen until pilot diagnostics and preregistration.

T15 composes these mechanisms into the fixed ten-stage runner. It checks paired seeds, scenarios, horizons, and allowed treatment differences; applies network demand only in the next tick; and emits deterministic tick evidence. The additive probability mapping for incoming spillover is a pilot parameterization and is not a formal result until preregistered.

T16 implements eight mechanism-local sanity gates and a separate R0-R4 diagnostic table. Regime rankings never affect pass/fail. Saturated request pressure or latent demand is emitted as a calibration flag that must be resolved before formal preregistration.

T17 implements the Chapter 6 measurement layer without changing the state machine. It separates three DetectionLag clocks, accepted versus latent redemption demand, pending versus censored outcomes, flow-adjusted economic loss, liquidity depletion, paired spillover scope, control cost, loss reduction, and the supplementary weighted stability index.

T17.5 screens declared behavior and demand-transmission parameters only for a stable, interior pilot. It preserves paired seeds, leaves shared-asset loss pass-through unchanged, forbids hypothesis-direction gates, validates the selected candidate over 100 pilot replicates, and derives formal replication recommendations from paired standard errors before T18 preregistration. It also demonstrates that none of the preregistered global `tau` candidates from 200 to 1200 bps reaches the 95% minimum shocked-run coverage across all R0-R4 arms. RegulatorDetectionLag precision therefore remains unavailable, not zero, until T18 freezes the detection-anchor method.

T18 freezes the primary valuation-shock detection anchor as the first positive paired haircut difference against the same-tick no-shock counterfactual. The Chapter 3 `score >= tau` clock remains a separately censored sensitivity analysis at 6000 bps. The formal policy baseline retains `kappa=7000`. After T13 corrected the Gate semantics, the unchanged 100-pair reachability design reselected `kappa=1500` for H5/H6 with 48% shocked activation; no-shock activation remained diagnostic and did not enter selection. The corrected calibration evidence is bound to the current formal baseline. The formal baseline contains only the pilot-selected behavior/demand values. The corrected deterministic v2 candidate has 146 cells covering matched R0-R4 shock/no-shock runs, A1-A7, one-dimension robustness, and paired Latin-hypercube behavior sensitivity. The seven statistical families H1-H3, H4a, H4b, H5, and H6 are explicitly forbidden as model gates. No corrected formal result is produced until the dedicated v2 preregistration commit, green CI run, and annotated tag exist.

T19 implements the locked matrix without changing it. An explicit compiler accepts only declared treatment paths, expands linked network and risk-weight settings atomically, and verifies paired random identities before execution. The experiment-only A1 switch removes public risk observations without removing the regulator channel. Valuation, liquidity, and redemption shocks share paired target/time coordinates and retain recomputable injection evidence. The formal executor fails closed unless the annotated preregistration tag exists, the current lock is byte-identical to the tagged lock, the execution commit descends from that tag, the Chapter 5 worktree is clean, and the returned result agrees with the compiled input provenance. No formal Monte Carlo result is generated by these implementation tests.

T20 provides bounded formal-execution infrastructure without changing the candidate design. The 146 cells compile to 73 pairs, 43,500 paired replicates, and 870 deterministic shards at 50 paired replicates per shard. Both arms run under one authorization and are reduced immediately to candidate 30/60/90-day outcome vectors plus detection evidence. Validators reject gaps, overlaps, unknown pairs, scope drift, nested digest drift, mixed execution commits, and conflicting existing evidence. Successful shard publication is atomic and non-replacing; technical failures are recorded separately. Signed contrasts preserve the declared arm order and do not enforce expected directions. Network-scale and shock-type scans explicitly avoid invalid fund-level joins. Streaming Welford estimates, normal intervals, and within-hypothesis Holm adjustment are defined before formal data are read. This infrastructure does not itself constitute a formal result.

T21 fixes the report interpretation and resumable execution path before any formal output is read. Cross-policy comparisons require the same replicate, shock magnitude, target, and shock second across all R0-R4 arms; censored values for both the shock-linked and 6000-bps sensitivity clocks remain missing with reason counts. H5 explicitly reverses the generic full-control-minus-lower-control loss/depletion differences so a positive benefit means stronger control reduced harm, reports relative loss reduction only with a nonzero lower-control denominator, and retains full-minus-lower orientation for control costs. The three control-cost components, continuous SpilloverScope, and 500-bps affected share are reported separately; 250/1000-bps threshold rows remain supplementary. Thirty-day tests alone enter the primary Holm families; longer windows, policy-package descriptive shock effects, and all non-primary robustness/LHS cells remain supplementary. A bounded worker queue resumes only from validated same-authorization immutable shard files, and final reporting rejects incomplete, mixed, or non-quiescent shard sets. No formal Monte Carlo result is generated by these implementation tests.

## Stage 1 to Stage 2 continuity gate

Before model pilot execution, the simulation foundation must reproduce:

- the exact R0-R4 parameter packages and disclosure boundaries;
- the equal-weight score vector result `3499`;
- detection comparison `score >= tau` and intervention comparison `score > kappa`;
- the v1.4.0 detection evidence: R1/R2/R4 zero policy delay, R3 86400 seconds, and R0 aligned to a 604800-second epoch boundary;
- `firstScheduledObservationAt(1101, 1000, 60) = 1120`.

The canonical evidence source is `docs/evidence/chapter3-summary.json`: 88 contract tests, 99 API tests, and 98.54% production-contract line coverage.
