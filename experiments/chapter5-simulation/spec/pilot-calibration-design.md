# Pilot Calibration and Precision Planning

## Status and boundary

T17.5 is exploratory calibration. Its runs are excluded from Chapter 6 formal results and `formalFindingsAllowed` is always false. The grid cannot pass or fail based on an R0-R4 ordering or an H1-H6 direction.

The grid changes three declared demand-scale parameters: the Logistic intercept, the fraction of available shares requested after a positive decision, and one symmetric transmission value applied to investor-overlap, public-risk, and public-control demand channels. Shared-asset loss pass-through is not changed. Network topology plus shock, Oracle, observation, and behavior seeds remain unchanged; Gate control is deterministic and has no seed. Each candidate uses the same replicate-level scenario across its no-shock and R0-R4 arms.

## Screening

The tracked calibration configuration creates the Cartesian product of three intercepts, three request fractions, and three symmetric demand-transmission values. Three screening replicates generate one no-shock R1 run and five shocked regime runs per candidate. A candidate is excluded only for a technical identification problem:

- no accepted no-shock requests;
- no-shock accepted request rate beyond 1000 bps of initial shares over 30 days;
- tick request pressure reaching the configured 10000-bps boundary;
- mean within-replicate R0-R4 latent-demand range below the configured minimum.

Among eligible candidates, selection minimizes the declared distance

`abs(intercept - baselineIntercept) + abs(requestFractionBps - baselineRequestFractionBps) / 10000 + abs(demandTransmissionBps - baselinePublicRiskTransmissionBps) / 10000`

from the existing pilot baseline, with candidate ID as the deterministic tie-breaker. The terms are measured in log-odds units and fractions of available shares or transmission capacity. This preserves the earlier model as far as the technical ceiling permits and does not optimize a hypothesis result.

The first exploratory screen varied only intercept and request fraction while retaining 10000-bps demand transmission. Its two technically eligible rows still generated 8848 and 8962 bps of accepted no-shock requests. Those values showed that full pass-through, which T14 had already marked as an unfrozen pilot coefficient, dominated the Logistic intercept. They are calibration diagnostics, not formal findings. The revised grid therefore calibrates the demand transmission scale and uses the mechanism-local no-shock stability ceiling above; no regime ordering enters selection.

## Validation and replication planning

The selected candidate receives 100 paired pilot replicates. Reports retain observations for no shock and R0-R4, raw regime summaries, censoring status, and run digests.

The mentor confirmation defines RegulatorDetectionLag as the main detection measure but does not prescribe a numeric `tau`. The Chapter 3 value 6000 is a configurable artifact scenario baseline, not a thesis or regulatory constant. T17.5 therefore evaluates the ascending threshold candidates declared in `pilot-calibration.json` against the 20% baseline valuation shock. For every candidate it reports the no-shock crossing rate and the shocked crossing rate under each regime, then selects the highest candidate whose minimum shocked crossing rate reaches the declared 9500-bps coverage floor. The no-shock rate is diagnostic only: endogenous stale-pricing, concentration, or redemption risk can legitimately cross a lifecycle-risk threshold, so it is not mislabeled as a classifier false-positive rate. Neither regime ordering nor a Chapter 6 outcome enters selection.

The completed pilot found no eligible global threshold among 200-1200 bps. Low thresholds crossed frequently in no-shock runs, while higher thresholds failed the 95% shocked-run coverage floor, especially under R0. Consequently T17.5 does not silently replace 6000 or fabricate DetectionLag precision. T18 must freeze one of two explicit methods before formal execution: retain a global score threshold and accept/report censoring, or define a shock-linked detection anchor while retaining `score >= tau` as the artifact warning-threshold sensitivity. This method decision is separate from the successfully selected behavior candidate.

Replication planning uses the largest sample standard deviation of the paired R1-R4 minus R0 differences for accepted request rate, loss magnitude, and regulator DetectionLag. Censored DetectionLag pairs are excluded rather than assigned a fabricated duration; their statuses remain present in the raw validation observations and must be reported with the recommendation. For each metric:

`n_implied = ceil((z * sampleSD / targetHalfWidth)^2)`

The recommendation is `max(500, n_implied)`. The precision half-widths in the calibration file are planning values and must be explicitly frozen or revised in the T18 preregistration commit. Key robustness cells retain the mentor-confirmed minimum of 1000 replicates.

A metric with no usable paired observations cannot support a variance estimate and must be marked unavailable before T18 rather than interpreted as zero variance.

Run the deterministic calibration with:

```bash
pnpm --filter @ots/chapter5-simulation pilot:calibrate > results/chapter5-pilot-calibration.json
```
