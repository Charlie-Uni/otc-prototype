# Outcome Metrics Design

## Scope and time

T17 defines deterministic measurement functions; it does not freeze parameters or report formal findings. Single-run metrics use `[shockAt, shockAt + windowDays * 86400)`. The primary window is 30 days, with 60- and 90-day calls using the same functions.

Every run carries a canonical configuration digest. Metric extraction rejects a caller-supplied configuration whose digest differs, preventing silent denominator or network drift.

`pending` describes an accepted redemption request that has no settlement by the measurement boundary. `censored` is reserved for an unavailable or unidentifiable detection time. Neither is replaced by zero or a large sentinel value.

## Detection

For the shocked fund, the first raw snapshot satisfying `riskScoreBps >= tau` anchors all detection measures:

- `system`: its `submittedAt - shockAt`;
- `regulatorDisclosure`: the first identifiable regulator `disclosedAt - shockAt`;
- `publicDisclosure`: the first identifiable public `disclosedAt - shockAt`;
- `publicObservation`: the first investor `observedAt - shockAt` for an identifiable public signal.

The main thesis measure is `regulatorDisclosure`. `DetectionBenefit_r = RegulatorDetectionLag_R0 - RegulatorDetectionLag_r`. A paired difference is `null` when either arm is censored.

An absent successful Oracle snapshot is censored as `no_successful_submission`, distinct from a successful score that remains below tau.

## Redemption and settlement

For each fund:

- cumulative request rate is accepted requested shares divided by initial shares;
- latent request rate additionally includes requests blocked at the Gate entry boundary and is diagnostic rather than the Chapter 3 event-flow measure;
- `PeakRedemption` is the maximum tick-level `requestedShares / preRequestTotalShares`;
- `RedemptionAcceleration` is the treatment cumulative accepted-request rate minus the same-seed paired counterfactual rate;
- settlement delay reports mean, conventional median, and nearest-rank P95 for requests settled by the window boundary;
- pending rate is pending accepted shares divided by accepted requested shares at the boundary.

## Loss and liquidity

Normal redemption settlement is a fund outflow, not an economic loss. Therefore:

`flowAdjustedEndingAum = endingEconomicAum + settlementAmountPaidWithinWindow`

`LossMagnitude = max(0, initialAum - flowAdjustedEndingAum) / initialAum`

This retains valuation shocks, transmitted losses, and fire-sale discounts as losses while excluding normal redemption principal. `FireSaleDiscountLoss` remains a separate mechanism measure and is not added again.

`LiquidityBufferDepletion = max(0, initialBuffer - minimumBuffer) / initialBuffer`. The first trace with a zero buffer supplies the exhaustion time. Baseline configurations require a positive initial buffer.

`LossReduction` reports both `Loss_no_control - Loss_control` and that difference divided by `Loss_no_control`; the relative value is `null` when no-control loss is zero.

## Spillover and control cost

For each unshocked fund, paired spillover is its request rate under the network or public-control treatment minus the corresponding disabled-channel rate. `SpilloverScope` reports:

- the mean signed continuous excess rate across unshocked funds;
- the share of unshocked funds whose excess is strictly above 500 bps;
- the same function accepts 250- and 1000-bps robustness thresholds.

`ControlCost` reports three mentor-confirmed components: Gate-blocked shares divided by latent requested shares, mean settled-request wait beyond the configured baseline delay, and pending accepted shares divided by accepted requested shares. Pending requests are not assigned a fabricated delay.

`FundNetStabilityBenefit` is supplementary only. Its function combines already-normalized signed component benefits with explicit weights summing to 10000; component normalization and weight schemes must be frozen in the later analysis preregistration.
