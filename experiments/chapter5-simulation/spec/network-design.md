# Chapter 5 Network And Fund Heterogeneity Design

## Purpose

The baseline contains 10 funds, 200 investor agents, and 5 asset classes, as confirmed by the mentor. It represents four relation families required by Chapter 5: fund-investor holdings, fund-asset exposures, shared managers or service providers, and shared valuation methods.

The generator initializes structural inputs only. It does not assign redemption outcomes, losses, detection lags, or an R0-R4 ordering.

## Fund heterogeneity

Three moderators required for H2 are varied independently:

| Tier | Liquidity mismatch input | Stale-pricing input | Concentration input |
| --- | --- | --- | --- |
| Low | 4500 bps liquid assets | NAV every 1 day | 500 bps top holder |
| Medium | 3000 bps liquid assets | NAV every 7 days | 3000 bps top holder |
| High | 1500 bps liquid assets | NAV every 14 days | 5000 bps top holder |

Expected redemption claims equal 3000 bps of AUM. The resulting initial liquidity-buffer ratios are therefore 15000, 10000, and 5000 bps. Investor concentration is not assigned directly: it is recomputed as HHI from generated holder weights by the vendored Chapter 3 function.

The first nine funds cover every liquidity-mismatch x stale-pricing tier combination. Concentration follows a balanced cyclic assignment across those combinations; the tenth fund is a medium-tier center point. This avoids collapsing all three moderators onto one mechanically ordered risk type.

## Network relations

- Each fund has 20 holders whose weights sum exactly to 10000 bps.
- A 3000 bps shared-core parameter gives six common holder identities per fund. Remaining holder identities are unique in the baseline.
- Each fund has one liquid-asset edge and two illiquid-asset edges. Exposure weights sum exactly to 10000 bps.
- Each fund is linked to exactly one manager, one service provider, and one valuation method. Modular assignment creates observable shared relationships without assigning outcomes.

The `sharedInvestorCoreBps` parameter is a structural design input, not the realized fraction of investors with multiple holdings. The generator reports the realized overlap separately.

The generated relations define the structural network used by T14. They are held fixed within a paired run; lifecycle balances and economic states evolve over that structure. This separation prevents a channel treatment from endogenously changing the treatment graph before its paired counterfactual is evaluated.

## Determinism and validity

Investor identity assignment is derived from the Chapter 5 counter-based random function using `networkSeed`; no mutable random stream is used. Validation rejects duplicate identifiers, dangling relations, duplicate edges, non-positive weights, holdings or exposures that do not sum to 10000 bps, incorrect HHI values, and missing institutional links.
