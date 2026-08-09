# Formula to Code Map

Formula IDs below are stable implementation IDs. Final thesis equation numbers will be assigned after the model is frozen.

| Formula ID | Thesis concept | Planned implementation | Configuration/input | Unit | Required test |
| --- | --- | --- | --- | --- | --- |
| F-RISK-1 | FundLifecycleRiskScore | `artifact/sensitivity.ts::computeWeightedRiskScoreBps` | six metrics, weightBps | bps | Reproduce 3499 vector |
| F-DETECT-1 | Detection condition | `metrics/detection.ts::isDetected` | score, tau | boolean | Equality at tau detects |
| F-CONTROL-1 | Gate trigger | `controls/gate.ts::shouldTriggerGate` | score, kappa | boolean | Equality at kappa does not trigger |
| F-REDEEM-1 | Individual P(Redeem) | `behavior/redemption.ts::redemptionProbability` | behavior coefficients and beliefs | probability | Range and coefficient signs |
| F-EXPECT-1 | ExpectedOthersRedeem | `behavior/expectations.ts::expectedOthersRedeem` | public signal, synchronicity, lagged pressure | normalized score | Input monotonicity |
| F-SYNC-1 | SignalSynchronicity | `behavior/synchronicity.ts::signalSynchronicity` | realized observation times | normalized score | Schedule-derived, order invariant |
| F-PRESSURE-1 | RedemptionRequestPressure | `metrics/redemption.ts::requestPressure` | requested shares, prior shares | bps | Request-flow artifact consistency |
| F-NET-1 | FundNetworkProximity | `network/proximity.ts::fundNetworkProximity` | asset, investor, provider, valuation weights | normalized score | Component removal |
| F-SPILL-1 | SpilloverRedemption | `metrics/spillover.ts::spilloverRedemption` | network and paired no-channel run | rate difference | Paired subtraction |
| F-FMA-1 | First-mover advantage | `liquidity/fma.ts::firstMoverAdvantage` | remaining liquidity ratio | normalized score | Nonnegative and monotone |
| F-PRICE-1 | PriceImpact | `liquidity/price-impact.ts::priceImpact` | lambda, sale amount, depth, gamma | price fraction | Gamma=1 baseline |
| F-LOSS-1 | LossMagnitude | `metrics/loss.ts::lossMagnitude` | initial and current AUM | rate | Zero and sign boundaries |
| F-LOSS-2 | LossReduction | `metrics/loss.ts::lossReduction` | control/no-control paired loss | absolute and relative | Zero denominator |
| F-GATE-1 | Control attenuation | `controls/gate.ts::controlledOutflow` | phi, requested outflow | amount | Higher phi weakly lowers outflow |
| F-BENEFIT-1 | DetectionBenefit | `metrics/detection.ts::detectionBenefit` | R0 lag, regime lag | seconds/days | Paired difference |
| F-STABILITY-1 | FundNetStabilityBenefit | `metrics/stability.ts::fundNetStabilityBenefit` | component metrics and weights | index | Alternative weight schemes |

Every implementation entry must be updated from `planned` to an actual symbol and test path before formal preregistration.
