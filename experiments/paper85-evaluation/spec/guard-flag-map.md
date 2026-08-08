# Guard-to-Flag Map

This inventory is frozen against `chapter3-artifact-v1.4.0`. A guard marked
`residual` remains active in every experimental variant. Removing one formal
predicate therefore does not remove unrelated structural, evidence, or
infrastructure safety checks.

## FundToken

| Production guard or modifier | Classification | Scenarios or rationale |
|---|---|---|
| constructor: nonzero admin, fundId, NAV registry | residual | Deployment integrity is outside the five transition predicates |
| `onlyRole(DEFAULT_ADMIN_ROLE)` on eligibility and Gate configuration | `Authorized` / M1 | I01 covers eligibility authority; Gate setup is an environment qualification |
| `onlyRole(SUBSCRIPTION_ROLE)` | `Authorized` / M1 | I03 |
| `onlyRole(REDEMPTION_ROLE)` | `Authorized` / M1 | I04 |
| `onlyRole(PAUSER_ROLE)` | `Authorized` / M1 | Same generated modifier as the covered role checks; pause/resume are not duplicated as invalid cases |
| inherited `grantRole` and `revokeRole` admin check | `Authorized` / M1 | I05; the experimental contract overrides both functions without changing M0 behavior |
| nonzero investor and nonzero `vcHash` | residual | Prevents unusable identities and empty commitment references |
| known subscription/redemption request | residual | Storage-domain existence check; an unknown identifier is not a business-parameter ablation |
| subscription not already accepted | `ParamConsistent` / M5 | I20 |
| current investor eligibility at request/acceptance | `ComplianceValid` / M2 | I06, I07, I09 |
| eligible transfer receiver | `ComplianceValid` / M2 | I08 |
| positive subscription/redemption amount | `ParamConsistent` / M5 | I18, I21 |
| calculated minted shares and redemption cash amount are nonzero | `ParamConsistent` / M5 | I19 covers mint rounding; redemption rounding is excluded with rationale in the coverage matrix |
| redemption not already settled; delay not duplicated | `ParamConsistent` / M5 | I24 covers duplicate settlement |
| nonzero settlement-delay reason | residual | Audit-evidence integrity, not an amount or balance relation |
| paused share-state update | `LifecycleValid` / M4 | I14-I17; request intake intentionally remains available |
| queued shares do not exceed balance; available shares cover operation | `ParamConsistent` / M5 | I22, I23 |
| configured and non-triggered Risk Gate | residual | Fixed fail-closed infrastructure dependency; not one of the five paper predicates |

## NAVRegistry

| Production guard or modifier | Classification | Scenarios or rationale |
|---|---|---|
| constructor: nonzero admin | residual | Deployment integrity |
| `onlyRole(MANAGER_ROLE)` | `Authorized` / M1 | I02 |
| positive initial NAV | `ParamConsistent` / M5 | Covered by the parameter family; omitted from the 24 invalid rows to avoid duplicating calculation guards |
| initial NAV appears once | `NAVValid` / M3 | I12 |
| formula NAV requires initialization | `NAVValid` / M3 | I11 |
| positive net assets, share snapshot, and calculated NAV | `ParamConsistent` / M5 | Structural formula inputs; excluded cells are documented in the coverage matrix |
| nonzero fundId and payload hash | residual | Fund binding and evidence commitment integrity |
| positive, non-future, nondecreasing `asOf` | `NAVValid` / M3 | I13 covers ordering; equal timestamps remain valid corrections |
| latest NAV exists | residual | I10 preregisters `NO_NAV` after M3 removal |
| valuation-haircut range/time/ordering checks | residual | Valuation-haircut submission is outside the eight formal operations in this evaluation |
| NAV and haircut view bounds/existence checks | residual | Read-domain safety; not state-transition predicates |

## RiskRegistry fixture dependency

`RiskRegistry` is not feature-flagged. Both comparison arms deploy the exact
v1.4.0 source at the same nonce position, configure it on `FundToken`, and do
not submit metrics. `isGated(fundId)` is therefore false. Separate environment
qualification tests assert fail-closed behavior when it is missing and the
configured non-gated path used by all redemption scenarios.

## Line-level inventory

Anchors below refer to the source-locked v1.4.0 files.

| Anchor | Guard/error | Mapping |
|---|---|---|
| FundToken:134 | `INVALID_ADMIN` | residual deployment integrity |
| FundToken:135 | `INVALID_FUND_ID` | residual fund binding |
| FundToken:136 | `INVALID_NAV_REGISTRY` | residual dependency binding |
| FundToken:143,147 | `PAUSER_ROLE` | M1 Authorized; representative role path |
| FundToken:151 | `DEFAULT_ADMIN_ROLE` on eligibility | M1 Authorized, I01 |
| FundToken:152 | `INVALID_INVESTOR` | residual identity-domain safety |
| FundToken:153 | `INVALID_VC_HASH` | residual evidence commitment |
| FundToken:158 | `DEFAULT_ADMIN_ROLE` on Gate setup | M1 Authorized; fixture qualification |
| FundToken:159 | `INVALID_RISK_GATE` | residual dependency binding |
| FundToken:170,176 | `SUBSCRIPTION_ROLE` | M1 Authorized, I03 covers acceptance |
| FundToken:178,208 | `UNKNOWN_SUBSCRIPTION_REQUEST` | residual storage-domain existence |
| FundToken:179 | `SUBSCRIPTION_ALREADY_ACCEPTED` | M5 ParamConsistent, I20 |
| FundToken:180 | `NOT_WHITELISTED` at acceptance | M2 ComplianceValid, I07 |
| FundToken:183 | `SUBSCRIPTION_TOO_SMALL` | M5 ParamConsistent, I19 |
| FundToken:218,224,257 | `REDEMPTION_ROLE` | M1 Authorized, I04 covers settlement |
| FundToken:225,349,383-384 | `RISK_GATE_NOT_CONFIGURED`, `REDEMPTION_GATED` | residual fixed infrastructure |
| FundToken:227,259,280 | `UNKNOWN_REDEMPTION_REQUEST` | residual storage-domain existence |
| FundToken:228,260 | `REDEMPTION_ALREADY_SETTLED` | M5 ParamConsistent, I24 |
| FundToken:231 | `REDEMPTION_TOO_SMALL` | M5 family; production regression evidence only |
| FundToken:261 | `SETTLEMENT_ALREADY_DELAYED` | M5 family; production regression evidence only |
| FundToken:262 | `INVALID_REASON_HASH` | residual evidence commitment |
| FundToken:297 | `PAUSED` in `_update` | M4 LifecycleValid, I14-I17 |
| FundToken:300 | `RECEIVER_NOT_WHITELISTED` | M2 ComplianceValid, I08 |
| FundToken:320,346 | `INVALID_INVESTOR` | residual identity-domain safety |
| FundToken:321,347 | `NOT_WHITELISTED` at request | M2 ComplianceValid, I06/I09 |
| FundToken:322 | `INVALID_SUBSCRIPTION_AMOUNT` | M5 ParamConsistent, I18 |
| FundToken:348 | `INVALID_REDEMPTION_AMOUNT` | M5 ParamConsistent, I21 |
| FundToken:378 | `INVALID_QUEUED_BALANCE` | M5 ParamConsistent; invariant/regression evidence |
| FundToken:379 | `INSUFFICIENT_AVAILABLE_SHARES` | M5 ParamConsistent, I22/I23 |
| NAVRegistry:58 | `INVALID_ADMIN` | residual deployment integrity |
| NAVRegistry:65,79,146 | `MANAGER_ROLE` | M1 Authorized, I02 |
| NAVRegistry:68 | `INVALID_NAV` initial | M5 ParamConsistent family |
| NAVRegistry:69 | `NAV_ALREADY_INITIALIZED` | M3 NAVValid, I12 |
| NAVRegistry:81 | `NAV_NOT_INITIALIZED` | M3 NAVValid, I11 |
| NAVRegistry:82-83,86 | `INVALID_NET_ASSET_VALUE`, `INVALID_TOTAL_SHARES`, `INVALID_NAV` | M5 ParamConsistent family |
| NAVRegistry:91 | `INVALID_FUND_ID` | residual fund binding |
| NAVRegistry:92-93 | `INVALID_AS_OF`, `FUTURE_AS_OF` | M3 NAVValid |
| NAVRegistry:94 | `INVALID_PAYLOAD_HASH` | residual evidence commitment |
| NAVRegistry:108 | `AS_OF_BEFORE_LATEST` | M3 NAVValid, I13; equality remains valid |
| NAVRegistry:140 | `NO_NAV` | residual pricing dependency, I10 after M3 removal |
| NAVRegistry:148-156 | `INVALID_FUND_ID`, `BPS_OUT_OF_RANGE`, `INVALID_OCCURRED_AT`, `FUTURE_OCCURRED_AT`, `INVALID_PAYLOAD_HASH`, `OCCURRED_AT_BEFORE_LATEST` | residual; operation outside the eight-row vocabulary |
| NAVRegistry:172,177 | `NO_VALUATION_HAIRCUT`, `NAV_OUT_OF_RANGE` | residual view-domain safety |

Inherited OpenZeppelin checks are source-locked with commit `c64a1edb...`.
`grantRole/revokeRole` admin checks are mapped to M1. ERC20 balance/allowance
checks and Pausable's `_pause/_unpause` status checks remain residual. M4 tests
whether an existing paused state blocks share-state execution; it does not
remove governance transition validity from `_pause/_unpause` themselves.
