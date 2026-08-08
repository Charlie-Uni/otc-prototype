# M0 Differential Equivalence Protocol

M0 is admissible only if the all-flags-enabled experimental contracts match
the v1.4.0 production contracts for all 42 preregistered scenarios.

## Deterministic deployment

Each arm starts from the same EVM snapshot with chain ID 31337 and timestamp
1710000000. The same harness account deploys contracts in this order:

1. production `RiskRegistry`;
2. production or experimental `NAVRegistry`;
3. production or experimental `FundToken`.

The snapshot restores the deployer nonce before the second arm, so contract
addresses are identical. This is required because subscription `requestHash`
commits to `address(this)`. Constructor arguments, actor addresses, timestamps,
fund ID, commitments, role assignments, and operation order are identical.

## Semantic state projection

The digest contains:

- holder balances, allowances, and total supply;
- whitelist state;
- subscription count and all referenced subscription records;
- redemption count, all referenced redemption records, holder queues, and
  total queued redemption;
- pause state;
- relevant role assignments;
- fund ID, NAV registry binding, and Risk Gate binding;
- NAV history length and every stored NAV record; and
- the fixed RiskRegistry Gate state for the test fund.

The digest excludes contract bytecode, contract names, constructor signature
shape, and the five experimental immutable flag getters. These are expected
experimental instrumentation differences, not business-state differences.

## Event comparison

Events are read from raw EVM receipts/logs and ordered by block number, log
index, and emission order. The digest includes emitter address, event
signature, indexed and non-indexed arguments, and business timestamps. It
excludes transaction hash, block hash, receipt status, and gas values.

Both arms must have identical deployed addresses. Address normalization is not
used to hide deployment-order mistakes.

## Acceptance gate

For each accepted operation, compare state and events after the operation. For
each rejected operation, compare the exact decoded error and assert that the
pre/post semantic state digest is unchanged. Any mismatch blocks all M1-M5
ablation runs.
