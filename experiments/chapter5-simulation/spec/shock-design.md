# Chapter 5 Shock Design

## Confirmed baseline

The mentor-confirmed baseline is a valuation shock to one fund, with NAV/AUM reductions of 1000, 2000, and 3000 bps. Liquidity and redemption shocks are robustness treatments and are not implemented in the baseline shock module.

For each replicate, `shockAt` is sampled uniformly from every integer second in one complete 604800-second R0 reporting cycle. The cycle starts on a Unix-epoch-aligned boundary. The target fund is assigned in shuffled blocks: every block of 10 replicates shocks each baseline fund exactly once. Magnitude cells share the same `shockAt` and target fund, and the resulting scenario object is reused across R0-R4 and paired mechanism counterfactuals.

## State semantics

The initial state separates economic truth from the latest Oracle-reported state:

- `economicAum` equals the current marked value of asset positions;
- `reportedAum`, `reportedNavPerShareBps`, and `reportedRiskMetrics` retain the latest submitted valuation;
- lifecycle counters and the redemption queue start at zero;
- initial risk metrics contain the liquidity shortfall and HHI derived from the network, with all flow, queue, stale-pricing, and haircut metrics at zero.

Applying the valuation shock reduces the target fund's illiquid asset positions proportionally and reduces `economicAum` by the exact configured fraction of pre-shock AUM. Liquid assets and all non-target funds remain unchanged. Reported values remain unchanged until the later `submit_oracle_state` pipeline stage. This preserves the frozen causal order instead of making the shock observable at injection time.

Integer losses use deterministic largest-remainder allocation, so asset positions always sum exactly to economic AUM. The shock module assigns no transparency regime and encodes no predicted R0-R4 ordering.
