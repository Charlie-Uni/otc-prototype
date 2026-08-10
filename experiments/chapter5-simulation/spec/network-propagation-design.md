# Network Propagation Design

## Scope and formulas

This stage implements the thesis Section 5.4 real-transmission and signal-analogy mechanisms. For distinct funds `i` and `m`:

```text
FundNetworkProximity(i,m)
  = chi1 * SharedIlliquidAsset(i,m)
  + chi2 * InvestorOverlap(i,m)
  + chi3 * CommonServiceOrManager(i,m)
  + chi4 * ValuationMethodSimilarity(i,m)

SpilloverRedemption(m,t+1)
  = rho * PublicRiskOrControlSignal(i,t) * FundNetworkProximity(i,m)
```

All terms use integer basis points. The four chi weights must sum to 10000. The pilot uses equal weights and full transmission coefficients only as neutral operational values; formal values are frozen after pilot diagnostics.

## Proximity components

- Shared illiquid assets use weighted Jaccard overlap of seeded illiquid-asset exposure weights.
- Investor overlap uses weighted Jaccard overlap of seeded fund-investor share weights.
- A common manager contributes 5000 bps and a common service provider contributes 5000 bps to the combined component.
- Equal valuation-method identifiers contribute 10000 bps.

Structural relation weights remain fixed within a run. Dynamic lifecycle state evolves over this graph. This is an experimental-identification choice: A4 and A5 can remove one edge family without allowing treatment-induced redemptions to redefine the treatment graph.

## Real transmission

T12 records each forced illiquid-asset sale and its realized `priceImpactBps`. T14 applies that mark-down to the same asset class in every other exposed fund:

```text
TransmittedLoss
  = floor(TargetAssetValue * PriceImpactBps * PassThroughBps / 10000^2)
```

The loss reduces the target asset position and economic AUM. Reported AUM and NAV remain unchanged until the target fund's next successful Oracle valuation, preserving stale-pricing semantics. Turning off `sharedIlliquidAssets` sets the effective pass-through to zero and changes no other channel.

Investor-overlap transmission converts the source fund's redemption-request pressure into next-period target demand using the overlap component. Turning off `investorOverlap` removes only this path and its contribution to full proximity.

The thesis reduced-form loss coefficient `lambda(i,m,t)` is therefore implemented as a mechanism decomposition rather than one immediate write-down using all four components. Shared assets create direct mark-to-market loss; investor overlap creates demand that may later cause settlement and forced-sale loss; service, manager, and valuation similarity create signal inputs but no direct accounting loss. This preserves the thesis distinction between real transmission and signal analogy and prevents public information alone from manufacturing AUM loss.

## Signal analogy and control disclosure

Public risk and control signals use full effective network proximity. The signal-analogy ablation zeros only common service/manager and valuation-method components; shared-asset and investor similarity remain available. A public control signal is binary at 10000 bps. A private, delayed-before-release, or otherwise unavailable control event is omitted from the propagation input rather than encoded as zero-risk evidence.

Each propagation record stores the source identity and time, raw and effective components, chi weights, effective transmission coefficient, target, spillover input, and transmitted loss. Every source produces exactly one record for every other fund, including zero-effect records. Duplicate processing fails closed.

## Boundaries

- T14 supplies next-period spillover-redemption inputs; the formal runner performs their final combination with base investor behavior.
- The model does not claim empirical calibration or point prediction.
- Signal propagation does not manufacture asset losses. Shared-asset price impact is the only T14 path that directly mutates economic AUM.
- `SpilloverRedemption` in final results is the mentor-confirmed paired difference between a network scenario and the same-seed run with the relevant channel disabled.
