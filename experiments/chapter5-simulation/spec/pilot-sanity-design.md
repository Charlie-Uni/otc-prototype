# Pilot Sanity and Calibration Diagnostics

## Purpose

T16 separates mechanism-local validity checks from empirical hypothesis outcomes. Only local invariants contribute to `overallPassed`. R0-R4 rankings are returned in `regimeDiagnostics`, with `diagnosticRankingIsPassGate=false`, and cannot make a run pass or fail.

Pilot outputs are calibration evidence. They are excluded from Chapter 6 formal results and may not be described as preregistered findings.

## Pass/fail checks

The machine checks are:

1. no-shock accounting stability: no shock, redemption, asset sale, AUM drift, or share-supply drift under isolated behavior;
2. no-shock non-stale risk stability: valuation haircut, redemption pressure, queue ratio, liquidity shortfall, and concentration remain fixed, while heterogeneous NAV schedules may create a legitimate stale-risk cycle;
3. larger valuation shocks produce strictly larger economic losses;
4. larger valuation shocks weakly increase and non-trivially change reported risk after each target fund's NAV cadence is reached;
5. first-mover advantage cannot rise when the liquidity buffer improves;
6. a non-negative publicness coefficient cannot lower local redemption probability;
7. detection uses `score >= tau`, while intervention uses `score > kappa`;
8. increasing phi cannot increase settlement or buffer consumption in controlled funds.

The shock checks run for at least 14 days so every 1/7/14-day NAV tier has one reporting opportunity. The phi check uses the same paired control seed and whole-request draw across the complete configured phi grid.

## Non-gating diagnostics

For each R0-R4 package, one paired pilot run reports cumulative latent requests, settled shares, peak request pressure, regulator detection lag or censoring, public control disclosure count, and the run digest. No expected regime ordering appears in the pass conditions.

The runner emits calibration flags when request pressure reaches its 10000-bps ceiling or all regimes reach the same latent-demand ceiling. A flag requires parameter review before formal preregistration; it is not silently fixed and is not relabeled as a result.

Run the deterministic diagnostic with:

```bash
pnpm --filter @ots/chapter5-simulation pilot:sanity
```
