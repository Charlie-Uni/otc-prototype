# Paper and Artifact Semantic Alignment

## 1. Eligibility state

The paper's formal state allows `Normal`, `Frozen`, `ExitOnly`, and
`UnderReview`. The v1.4.0 artifact exposes a boolean whitelist. The evaluation
therefore tests eligible versus ineligible participation only. It must not
claim that the four disposition modes are implemented.

## 2. NAV validity

The artifact stores an authorized, fund-scoped, append-only NAV sequence. It
enforces initialization, positive inputs, non-future `asOf`, and monotone
`asOf`. Subscription acceptance and redemption settlement consume the latest
NAV. Subscription records `navUsed/navAsOf`; redemption records
`settlementNav/settlementNavAsOf`.

The artifact does not store Approved/Revoked flags and does not accept a
caller-selected NAV version. NRI is consequently defined against the latest
preceding recoverable NAV, not against a separate approval registry.

## 3. Pause semantics

`requestSubscription` and `requestRedemption` are request-intake operations and
remain available while paused. `acceptSubscription`, `settleRedemption`, and
transfers reach `_update` and are blocked with `PAUSED`. Chapter 6 must describe
the implemented boundary as blocking executable share-state changes, not all
request intake. `flagSettlementDelayed` records evidence without changing share
state and therefore also remains available while paused.

## 4. Governance and authorization

Authorization is enforced by AccessControl. The evaluation includes grant and
revoke operations and records native `RoleGranted` and `RoleRevoked` events for
replay. Independent runtime accounts demonstrate role separation, while the
admin remains a governance trust root.

The M1 experimental variant overrides `grantRole` and `revokeRole` only to make
their inherited admin check feature-switchable. With the Authorized flag on,
the override performs the same `_checkRole` and `_grantRole`/`_revokeRole`
sequence as OpenZeppelin AccessControl.

## 5. Replay closure

Replay may consume only:

- the genesis configuration recorded in the run config; and
- the ordered event stream emitted during the run.

It must not query contract views while reconstructing state. Contract views
are read only after replay to calculate PCR.

Replay reads raw EVM logs rather than the Chapter 3 API indexer because the
research indexer does not index native `Paused`, `Unpaused`, `RoleGranted`, or
`RoleRevoked` events.

## 6. Error matching

An invalid scenario passes only when the expected error is exact:

- string domain errors such as `NOT_WHITELISTED`, `PAUSED`, or `NO_NAV`;
- OpenZeppelin custom errors such as `AccessControlUnauthorizedAccount`;
- an explicitly preregistered panic code for a residual arithmetic guard.

Any other revert is a mismatch, even when the transaction did not modify
state.

## 7. Ablation interpretation

Removing a target predicate can produce:

- an invalid transition that becomes accepted;
- rejection by a remaining guard;
- a runtime revert;
- state divergence; or
- event divergence.

Only the first outcome demonstrates direct admission of the prohibited state
transition. Residual rejection and runtime failure are reported separately and
must not be rewritten as successful enforcement by the removed predicate.

## 8. Evidence source labels

- Chapter 3 implementation claims: `b5fe1c8` evidence anchor.
- Chapter 6 baseline behavior and gas: v1.4.0 production contracts.
- Figure 10 and ablation table: generated feature-flagged experimental
  contracts.
- Chinese thesis Chapters 5 and 6: independent dynamic simulation runner.

## 9. Risk Gate dependency

The production token rejects redemption when the Risk Gate is missing or
active. Every comparison arm deploys the source-locked production
`RiskRegistry`, configures it at the same nonce position, and submits no risk
metrics, so the fixture is deterministically non-gated. Gate activation is not
one of the five predicates in this paper's ablation; its production behavior
is evidenced by the frozen Chapter 3 tests.

## 10. NAV time ordering

The NAV `asOf` sequence is monotone nondecreasing. Equal timestamps are allowed
as append-only corrections; only an `asOf` earlier than the latest record is
invalid.
