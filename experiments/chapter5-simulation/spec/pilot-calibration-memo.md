# T17.5 Pilot Calibration Memo

## Scope

This memo records exploratory calibration only. It is not a Chapter 6 result and cannot be cited as hypothesis evidence. The run follows the model definitions in `论文框架0630.docx`, the lifecycle and transparency semantics in the Chapter 3 design, and the mentor-confirmed 100-replicate pilot rule in `副本待确认清单2(1).pdf`.

The run used a 30-day window, a 20% single-fund valuation shock, one paired no-shock arm, and R0-R4 arms for every replicate. Candidate selection did not use an expected regime ordering or any direction expected by H1-H3, H4a, H4b, H5, or H6.

## Behavior selection

The 27-row grid varied only the Logistic intercept, the post-decision request fraction, and one symmetric demand-transmission value. Six candidates passed the technical screen. The deterministic closest-to-baseline rule selected:

| Field | Selected value |
| --- | ---: |
| Candidate | `candidate-i2-f1-d2` |
| Logistic intercept | -5.293304824724492 |
| Redemption request fraction | 1000 bps |
| Investor-overlap transmission | 500 bps |
| Public-risk transmission | 500 bps |
| Public-control transmission | 500 bps |

Its three-replicate screening diagnostics were: 876 bps mean no-shock accepted requests, 552 bps maximum tick pressure, and 700 bps mean within-replicate latent-demand range across R0-R4. These values only establish an interior pilot region.

## Detection threshold diagnosis

Neither the thesis framework nor the mentor confirmation fixes a numeric `tau`. The Chapter 3 value 6000 is a configurable artifact scenario baseline. T17.5 evaluated the declared global threshold candidates without using regime rankings.

| tau (bps) | No-shock crossing rate | Minimum shocked crossing rate across R0-R4 | Meets 95% floor |
| ---: | ---: | ---: | --- |
| 200 | 96% | 93% | No |
| 300 | 91% | 91% | No |
| 400 | 90% | 89% | No |
| 500 | 90% | 86% | No |
| 600 | 87% | 80% | No |
| 700 | 76% | 74% | No |
| 800 | 72% | 66% | No |
| 1000 | 67% | 58% | No |
| 1200 | 53% | 48% | No |

No candidate was selected. This is not treated as a failed hypothesis. It shows that one absolute score threshold does not cleanly identify a valuation shock across the configured heterogeneous funds because the same score also reflects stale pricing, liquidity, concentration, queues, and endogenous redemption pressure.

T18 must freeze the primary detection anchor before formal runs. The two defensible choices are:

1. retain a global `riskScoreBps >= tau` anchor and report the resulting censoring rate; or
2. use a shock-linked metric anchor for the primary RegulatorDetectionLag while retaining the global score threshold as an artifact warning-threshold sensitivity.

Until that decision is frozen, no calibrated formal config is emitted and DetectionLag precision remains unavailable rather than being set to zero.

## Precision planning

For accepted request rate, the largest paired standard deviation was 124.3382 bps, implying 6 replicates for a 100-bps half-width. For loss magnitude, the largest paired standard deviation was 0.3145 bps, implying 1 replicate for a 100-bps half-width. The mentor-confirmed minimum therefore controls both recommendations at 500 replicates per formal cell. DetectionLag has no recommendation because no threshold candidate passed the identification rule.

## Reproducibility

| Item | SHA-256 |
| --- | --- |
| Baseline config | `93a8a744481f3a7f9fd35aaacc9886bdf222fb261f4f30753967d7b0c9b651a1` |
| Calibration config | `0a8e9595bf17ff54479b3ab446ba089468aaf96682b702a34795959dcf1cd8e2` |
| Calibration implementation | `751d004feb47e5e9ecc36087038a8ae3430610ed338b7845f566225c1a728330` |
| Report semantic digest | `dfd26e6637f171a8e74b7f7fe10a30e79c7757a3f08c3f6392cf7275200f5f26` |

The report contains 486 screening observations and 600 validation observations. `formalFindingsAllowed` is `false`. The full report is regenerated with `node --import tsx scripts/run-pilot-calibration.ts`; T18 evidence archiving will occur only after the detection method and analysis plan are frozen.
