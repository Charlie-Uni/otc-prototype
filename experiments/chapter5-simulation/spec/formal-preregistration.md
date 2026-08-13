# Chapter 5 Formal Preregistration Specification

Status: corrected v2 candidate. `chapter5-sim-prereg-v1` remains an invalid historical record and cannot authorize results. This candidate must be reviewed and frozen by a dedicated commit, lock, green CI run, and annotated v2 tag before formal Monte Carlo execution.

## Source and calibration boundary

The simulation continues to use the Chapter 3 artifact semantics locked to `chapter3-artifact-v1.4.0`. T17.5 pilot runs are calibration evidence only and are excluded from Chapter 6. They selected an interior behavior baseline: intercept `-5.293304824724492`, redemption request fraction `1000` bps, and investor-overlap/public-risk/public-control demand transmission of `500` bps. Shared-asset loss pass-through remains `10000` bps because it is an accounting channel rather than the calibrated demand channel.

The pilot implied fewer than 500 replicates for accepted redemption and loss precision. The mentor-confirmed floor therefore controls at 500 formal replicates per ordinary cell. Declared key robustness cells use 1000 replicates.

## Detection decision

The mentor confirmation designates RegulatorDetectionLag as the primary detection outcome but does not prescribe a numerical `tau`. T17.5 showed that no global score threshold from 200 to 1200 bps achieved 95% shocked-run coverage across heterogeneous R0-R4 runs. A lower threshold also crossed frequently in no-shock runs because stale pricing, concentration, and endogenous redemption risk are legitimate components of the lifecycle score.

For the baseline valuation-shock experiment, the primary anchor is therefore the first successful post-shock Oracle snapshot whose `valuationHaircutBps` is strictly greater than the same-tick, same-seed, same-fund no-shock counterfactual. RegulatorDetectionLag runs from ground-truth `shockAt` to the corresponding first regulator disclosure. This is a paired simulation estimand, not a replacement for the Chapter 3 warning rule.

The artifact rule `riskScoreBps >= tau` remains a separately reported sensitivity outcome at `tau=6000`, including censoring rate and censor reason. It is never substituted for the primary anchor when censored. Shock-type robustness uses the same paired-increase rule with `liquidityShortfallBps` for liquidity shocks and `redemptionPressureBps` for redemption shocks.

The production-policy baseline retains the Chapter 3 scenario value `kappa=7000`. After T13 corrected the Gate state machine, the separate non-gating reachability pilot was rerun over 100 paired R1 runs and the 30-day window for the H5/H6 control experiments. The unchanged selection rule chooses the candidate whose shocked target-fund activation rate is closest to 50%, with ties resolved toward the higher threshold. The corrected run reselected `kappa=1500`: shocked activation was 48% and no-shock activation was 34%, with the latter retained as a diagnostic only. The complete candidate table and corrected baseline digest are recorded in `control-threshold-calibration-evidence.json`. This control-experiment value is not a regulatory estimate and never replaces the policy-package baseline.

## Formal matrix

`formal-experiment-matrix.json` is generated deterministically from `formal-experiment-design.json`. The v2 candidate contains 146 cells:

- 30 matched policy cells: five R0-R4 packages, three valuation-shock magnitudes, and a same-scenario no-shock arm for each;
- 14 cells for seven two-arm, one-dimension mechanism ablations A1-A7;
- 70 cells for one-dimension robustness comparisons;
- 32 cells for 16 Latin-hypercube behavior profiles, each paired with the same formal baseline.

The seven ablations vary public risk access, delay, granularity, investor-overlap transmission, shared-asset transmission, control-event disclosure, and signal-analogy transmission separately. A7 fixes R1, the network, shocks, random identities, real-transmission channels, and all coefficients while changing only `config.propagation.channels.signalAnalogy`. R0-R4 remain parameter packages rather than assumed outcome rankings. The 16-point behavior Latin hypercube is the only intentionally multidimensional sensitivity design and has its seed and coefficient ranges fixed in the design file.

Formal execution must implement every declared treatment path and fail before running if a path cannot be compiled into a valid treatment. In particular, A1 requires an experiment-only public-risk disclosure toggle; liquidity and redemption shock robustness require their declared shock injectors; network-scale and risk-weight-scheme entries expand atomically into their linked configuration fields. These are runner requirements, not production API changes.

## Missingness and validity

Detection outcomes are either numeric seconds or explicitly censored with a reason. Pending redemption is a lifecycle status and is never called censored. Failed runs retain evidence and may only be rerun with identical locked inputs. Config-digest mismatch, incomplete replicate matrices, undeclared treatment differences, and paired-seed or paired-shock drift are fail-fast errors.

Expected directions for the seven statistical families H1-H3, H4a, H4b, H5, and H6 are analysis statements only. They are not model gates, sanity gates, cell-selection rules, or reasons to alter parameters. Pilot observations cannot be pooled with formal results.

## Freeze procedure

Before formal execution:

1. run type checking, all Chapter 5 tests, matrix regeneration check, plan validation, foundation lock check, and preregistration lock check;
2. commit the plan, baseline, design, generated matrix, validators, and both lock files together;
3. push and require a green Chapter 5 workflow;
4. create annotated tag `chapter5-sim-prereg-v2` at that exact commit;
5. allow the formal runner to accept only that tag or a commit whose preregistration lock is byte-identical.

Changing a locked analysis or design file after the tag requires a new preregistration version. Result files, estimates, verdicts, and observed values are forbidden in the preregistration inputs.
