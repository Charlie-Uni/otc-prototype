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
| F-REDEEM-1 | Individual P(Redeem) | `behavior/redemption.ts::redemptionProbability` and `evaluateInvestorRedemption` | normalized behavior inputs and configurable `a0`-`a5` | probability | `behavior/redemption.test.ts`: range, coefficient signs, prior wiring, paired draw |
| F-EXPECT-1 | ExpectedOthersRedeem | `behavior/expectations.ts::expectedOthersRedeemBps` | public signal, synchronicity, lagged request pressure, convex weights | bps | `behavior/expectations.test.ts`: exact value, range, input monotonicity |
| F-SYNC-1 | SignalSynchronicity | `observation/schedule.ts::computeSignalSynchronicityBps` | realized observation times, bucket anchor and width | bps HHI | `observation/schedule.test.ts`: schedule-derived and order invariant |
| F-PRESSURE-1 | Redemption pressure, investor and share-flow definitions | `metrics/redemption.ts::redemptionDecisionPressureBps`; `redemptionRequestPressureBps` | redeeming/eligible investors; requested/pre-request shares | bps | `metrics/redemption.test.ts`; queue integration in `redemption/lifecycle.test.ts` |
| F-NET-1 | FundNetworkProximity | `network/proximity.ts::fundNetworkProximityComponents`; `fundNetworkProximityBps` | asset, investor, provider/manager, valuation weights and chi | bps | `network/proximity.test.ts`: symmetry, exact chi weighting, component removal |
| F-SPILL-1 | Signal-driven SpilloverRedemption | `metrics/spillover.ts::spilloverRedemptionBps`; `network/propagation.ts::propagateNetworkEffects` | public signal, network proximity, rho | bps | `metrics/spillover.test.ts`; `network/propagation.test.ts` |
| F-SPILL-2 | Paired channel-attributable SpilloverRedemption | `metrics/spillover.ts::pairedSpilloverRedemptionBps` | network scenario and same-seed disabled-channel run | signed bps difference | `metrics/spillover.test.ts` |
| F-LOSS-NET-1 | Shared-asset loss transmission | `network/propagation.ts::propagateNetworkEffects` | target asset value, source sale price impact, pass-through | integer value | `network/propagation.test.ts`: asset/AUM reconciliation and channel removal |
| F-FMA-1 | First-mover advantage | `liquidity/fma.ts::firstMoverAdvantageBps` | runtime liquidity-buffer ratio | bps | `liquidity/fma.test.ts`; runtime tiers in `liquidity/buffer.test.ts` |
| F-PRICE-1 | PriceImpact and sale proceeds | `liquidity/price-impact.ts::priceImpactBps`; `discountedSaleProceeds` | lambda, sale amount, depth, gamma | bps/value | `liquidity/price-impact.test.ts`; settlement integration in `redemption/lifecycle.test.ts` |
| F-LOSS-1 | LossMagnitude | `metrics/loss.ts::lossMagnitude` | initial and current AUM | rate | Zero and sign boundaries |
| F-LOSS-2 | LossReduction | `metrics/loss.ts::lossReduction` | control/no-control paired loss | absolute and relative | Zero denominator |
| F-GATE-1 | Control attenuation and whole-request admission | `controls/gate.ts::controlledOutflow`; `redemptionBlockedByGate` | phi, requested outflow, paired request identity | amount/boolean | `controls/gate.test.ts`; actual settlement monotonicity in `controls/lifecycle.test.ts` |
| F-BENEFIT-1 | DetectionBenefit | `metrics/detection.ts::detectionBenefit` | R0 lag, regime lag | seconds/days | Paired difference |
| F-STABILITY-1 | FundNetStabilityBenefit | `metrics/stability.ts::fundNetStabilityBenefit` | component metrics and weights | index | Alternative weight schemes |

Every implementation entry must be updated from `planned` to an actual symbol and test path before formal preregistration.
