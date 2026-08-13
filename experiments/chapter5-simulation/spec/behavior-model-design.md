# Investor Behavior Model Design

## Source and scope

This module implements the investor-level mechanism in thesis Section 5.3. It consumes T10 public observations and produces a binary redemption decision probability. It does not execute a request, settle shares, apply Gate, or propagate network effects.

The thesis specifies the Logistic form and the arguments of `g(.)`, but it does not prescribe numerical coefficients or a functional form for `g(.)`. The mentor-approved method is therefore a non-calibrated pilot baseline followed by a parameter grid or Latin Hypercube scan. Pilot values are model-development inputs and are not thesis results.

## Belief state

Each investor-fund pair starts with `initialRiskPriorBps`. Before any public observation is available, the information state is unknown and the prior is retained. Unknown is never converted to zero risk. At a decision time, the latest observation actually available to that investor replaces the prior:

- detailed disclosure uses the exact score supplied by T10;
- aggregate or tiered disclosure uses the frozen band midpoint supplied by T10;
- future or stale replayed observations cannot change the current belief.

`publicnessBps` is 10000 after the investor has received a public observation and zero before one is available. `publicRiskSignalBps` is the current perceived risk when public information exists and zero otherwise. The zero value in the latter case means absence of a public coordination input; it does not overwrite the investor's private prior.

## Expected others to redeem

The unspecified `g(.)` function is operationalized as a convex combination in basis points:

```text
ExpectedOthersRedeemBps = floor(
  (w1 * PublicRiskSignalBps
   + w2 * SignalSynchronicityBps
   + w3 * LaggedRedemptionRequestPressureBps) / 10000
)
```

The weights must be nonnegative and sum to 10000. This is the smallest monotone and interpretable implementation of the three thesis arguments. The pilot weights are 4000/3000/3000 and must be frozen or revised before formal preregistration.

## Redemption probability

All basis-point inputs are normalized to `[0, 1]`. The implemented equation is:

```text
P(Redeem[h,i,t] = 1) = logistic(
  a0
  + a1 * PerceivedRisk
  + a2 * Publicness
  + a3 * SignalSynchronicity
  + a4 * ExpectedOthersRedeem
  + a5 * FirstMoverAdvantage
)
```

The Logistic implementation is numerically stable for positive and negative log odds. Slope coefficients are constrained to `[0, 20]`; the intercept is constrained to `[-20, 20]`. The pilot baseline is:

| Parameter | Pilot value | Interpretation |
| --- | ---: | --- |
| `a0` | -4.59511985013459 | 1% probability when all normalized covariates are zero |
| `a1` | 1.0 | perceived-risk direction |
| `a2` | 0.25 | public-signal direction |
| `a3` | 0.5 | observation-synchronicity direction |
| `a4` | 1.0 | strategic-complementarity direction |
| `a5` | 1.0 | first-mover-advantage direction |

These values are deliberately labeled pilot and are not empirical estimates. Formal coefficient ranges, scan design, and seeds are frozen by `chapter5-sim-prereg-v2`.

## Paired decision draw

The binary draw uses the existing counter-based RNG with identity:

```text
(behavior.seed, replicateId, [investorId, fundId],
 module='redemption-decision', tick, purpose='redeem-or-not', ordinal=0)
```

No regime or mechanism label enters the key. Paired counterfactuals therefore consume the same random number, and changing a probability does not shift any later random stream. A later Gate stage may override execution, but it must not skip or redraw this decision slot.

## Tests and interpretation boundary

Tests enforce range, coefficient signs, local monotonicity, unknown-prior preservation, entity matching, stale-observation rejection, convex weights, and paired random draws. No R0-R4 redemption ranking is a test condition. Such rankings are experiment outputs to be reported and analyzed even when they differ from the directional hypothesis.
