# Formula to Code Map

Formula IDs below are stable implementation IDs. Final thesis equation numbers will be assigned after the model is frozen.

| Formula ID | Thesis concept | Planned implementation | Configuration/input | Unit | Required test |
| --- | --- | --- | --- | --- | --- |
| F-RISK-1 | FundLifecycleRiskScore | `risk/metrics.ts::deriveRiskSubmission` using `artifact/sensitivity.ts::computeWeightedRiskScoreBps` | six metrics, weightBps | bps | `risk/metrics.test.ts`; reproduce 3499 vector |
| F-CONC-INIT | Initial InvestorConcentration | `artifact/risk/calc.ts::computeInvestorConcentrationBps` via `network/generator.ts::generateNetworkModel` | generated holder share bps | bps HHI | Recompute every fund from holdings |
| F-LBR-INIT | Initial LiquidityBufferRatio | `network/generator.ts::generateNetworkModel` | liquid-asset share / expected-redemption-claims share | bps | Ordered 15000/10000/5000 tier values |
| F-SHOCK-1 | Valuation shock loss | `shocks/valuation.ts::applyValuationShock` | pre-shock economic AUM, navDropBps | integer value | 10/20/30% loss monotonicity and exact accounting |
| F-DETECT-1 | Detection condition | `risk/metrics.ts::evaluateRiskThresholds` | raw score, tau | boolean | `risk/metrics.test.ts`: equality at tau detects |
| F-CONTROL-1 | Gate trigger indication | `risk/metrics.ts::evaluateRiskThresholds` | raw score, kappa | boolean | `risk/metrics.test.ts`: equality at kappa does not trigger |
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
