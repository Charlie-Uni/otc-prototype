# Closed-Input Replay Protocol

ARC and PCR use a dedicated raw-log replay implementation. The Chapter 3 API
indexer is not reused because its lifecycle ABI intentionally omits native
OpenZeppelin governance and pause events.

## Permitted inputs

- the frozen genesis/run configuration; and
- ordered raw `eth_getLogs` output from the scenario execution.

The replay implementation must not call contract view functions while
reconstructing state. Views are read only after reconstruction to calculate
PCR.

## Captured event set

FundToken and inherited events:

- `RiskGateConfigured`, `InvestorWhitelisted`;
- `SubscriptionRequested`, `SubscriptionAccepted`;
- `RedemptionRequested`, `RedemptionQueueUpdated`, `RedemptionSettled`,
  `SettlementDelayed`;
- `ShareBalanceUpdated`, `Transfer`, `Approval`;
- `Paused`, `Unpaused`;
- `RoleGranted`, `RoleRevoked`, `RoleAdminChanged`.

NAVRegistry and inherited events:

- `NAVUpdatedEvent`, `ValuationHaircutEvent`;
- `RoleGranted`, `RoleRevoked`, `RoleAdminChanged`.

RiskRegistry fixture events are retained for deployment/configuration evidence,
including its AccessControl events and weight/kappa configuration events. It
does not receive risk metrics in the 42 baseline fixtures.

## Checkpoints and metrics

One replay checkpoint follows each accepted state-changing operation. ARC is
`N_replayed / N_accepted`. PCR is `N_matching_projection / N_projection`, where
the denominator is the same accepted-operation checkpoint set. NRI checks
`navUsed/navAsOf` for subscriptions and
`settlementNav/settlementNavAsOf` for redemptions against the latest preceding
recoverable NAV event.
