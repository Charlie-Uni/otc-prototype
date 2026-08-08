# Result Taxonomy

The runner writes observations to `results/`; it never edits the preregistered
manifest. Every ablation result is compared with the same scenario's M0 run.

| Classification | Definition |
|---|---|
| `expected_accept` | A preregistered valid operation is accepted and its state/event assertions hold |
| `expected_reject` | M0 rejects an invalid operation with the exact preregistered error kind, code, and arguments |
| `invalid_transition_accepted` | The target predicate is disabled and an operation rejected by M0 is accepted |
| `rejected_by_residual_guard` | The target predicate is disabled, but an explicitly preregistered remaining `require` or custom error rejects the operation |
| `runtime_revert` | The target predicate is disabled and execution fails through a preregistered panic or low-level EVM failure rather than a named residual guard |
| `state_divergence` | Acceptance/rejection agrees with M0, but the semantic state projection differs |
| `event_divergence` | Acceptance/rejection and state agree with M0, but the normalized semantic event stream differs |

## Precedence

When more than one observation is possible, assign exactly one primary class
in this order:

1. `runtime_revert`
2. `rejected_by_residual_guard`
3. `invalid_transition_accepted`
4. `state_divergence`
5. `event_divergence`
6. `expected_reject`
7. `expected_accept`

State and event differences remain available as secondary boolean fields even
when a higher-priority class is selected. A transaction that merely reverts
does not pass: the decoded error kind, selector/code, and arguments must match
the preregistered expectation.

## Error matching

- Solidity string errors match the decoded string exactly.
- `AccessControlUnauthorizedAccount` matches its selector and both decoded
  arguments. Actor labels resolve through `manifest.actors`; role labels resolve
  to `keccak256(utf8(roleLabel))`, except `DEFAULT_ADMIN_ROLE`, which is
  `bytes32(0)`.
- Panic errors match the numeric panic code. `Panic(0x11)` means checked
  arithmetic underflow/overflow and is not interchangeable with a named guard.
- Missing, additional, or reordered decoded arguments fail the scenario.
