# Paper 8.5 Evaluation Traceability

This matrix separates the English paper's formal claims from the production
artifact, the experimental ablation variant, and the evidence that Chapter 6
must report.

| Paper requirement | Production representation | Evaluation evidence | Boundary |
|---|---|---|---|
| Lifecycle state `X_t=(B_t,Q_t,N_t,G_t,L_t)` | FundToken balances and queue state, whitelist eligibility, fund-scoped NAV history, AccessControl roles, Pausable state | State digest at every accepted state-changing operation | Eligibility is boolean; the production artifact does not implement `Frozen`, `ExitOnly`, or `UnderReview` modes |
| Authorized predicate | OpenZeppelin AccessControl roles on eligibility, NAV, subscription, redemption, pause/resume, and role updates | I01-I05 exact custom-error rejection plus M1 authorization ablation | Pause/resume share one role-check implementation; admin remains a governance trust root |
| ComplianceValid predicate | `whitelist` checks on requests, subscription acceptance, and transfer receiver | Exact `NOT_WHITELISTED` or `RECEIVER_NOT_WHITELISTED` rejection plus compliance ablation | `vcHash` is a commitment reference, not a zero-knowledge eligibility proof |
| NAVValid predicate | Fund-scoped append-only NAV history, initialization, time ordering, and latest-NAV reads | NAV rejection scenarios, NRI, and NAV-validity ablation | No Approved/Revoked status and no caller-selected `navVersion`; operations bind to latest NAV |
| LifecycleValid predicate | Pausable blocks ERC20 share-state updates | I14-I17 plus M4 lifecycle ablation | Request intake and settlement-delay evidence remain allowed while paused |
| ParamConsistent predicate | Positive amounts, nonzero calculated values, duplicate guards, balance and queued-share checks | Exact domain-error scenarios plus parameter ablation | Some removed guards still fail through arithmetic or downstream contract guards; these are reported separately |
| Deterministic transition | Contract state and emitted lifecycle events | Production/M0 differential state and event digests | M0 must pass before any ablation result is admissible |
| 42 controlled scenarios | Preregistered 18 valid and 24 invalid scenarios | Manifest, raw scenario rows, and verdict summary | Scenario counts are paper evaluation cases, not the 88 Foundry or 99 API regression tests |
| STCR | Accepted/rejected transition conforms to preregistered baseline expectation | `N_consistent / N_total` | A revert counts as correct only when the exact expected domain/custom error matches |
| ARC | Accepted lifecycle operations consumed by closed-input event replay | `N_replayed / N_accepted` | Replay may consume only genesis configuration and event stream |
| NRI | NAV-dependent accepted operations reference the latest preceding recoverable NAV | `N_valid / N_reference` | Subscriptions use `navUsed/navAsOf`; redemptions use `settlementNav/settlementNavAsOf`; initial NAV uses `isInitial` semantics |
| PCR | Replayed projection equals production projection at defined checkpoints | `N_consistent / N_projection` | Checkpoint follows every accepted state-changing operation; one operation per block |
| Five-predicate ablation | Generated feature-flagged experimental FundToken/NAVRegistry variants | M0 plus five single-predicate-removal runs | Ablation evidence is not production behavior and must be labelled accordingly |
| Execution cost | v1.4.0 production contracts only | Forge gas snapshot and transaction receipts | No gas values from feature-flagged contracts; values are descriptive, not production fee forecasts |

## Evidence destinations

| Requirement | Source-locked code anchor | Scenario IDs | Paper consumer | Planned result path |
|---|---|---|---|---|
| Authorized | FundToken:143-176, 218-257; NAVRegistry:63-79; OZ AccessControl grant/revoke | I01-I05 | Figure 10, ablation table | `results/ablation/M1.jsonl` |
| ComplianceValid | FundToken:180, 300, 321, 347 | I06-I09 | Figure 10, ablation table | `results/ablation/M2.jsonl` |
| NAVValid | NAVRegistry:69, 81, 92-93, 108; FundToken latest-NAV dependency | I10-I13 | NRI table, Figure 10 | `results/ablation/M3.jsonl` |
| LifecycleValid | FundToken:297 | I14-I17 | Figure 10, ablation table | `results/ablation/M4.jsonl` |
| ParamConsistent | FundToken:179, 183, 228, 231, 260-261, 322, 348, 378-379; NAVRegistry:68, 82-86 | I18-I24 | Figure 10, ablation table | `results/ablation/M5.jsonl` |
| M0 equivalence | All state-changing paths above | V01-V18, I01-I24 | Evaluation-method validity gate | `results/m0/differential.jsonl` |
| STCR | Exact acceptance and decoded errors | All 42 | Overall evaluation table | `results/metrics.json` |
| ARC/PCR | Raw event replay and checkpoint projections | Accepted baseline operations | Reconstruction table | `results/replay/checkpoints.jsonl` |
| NRI | NAV events plus accepted subscription/redemption records | NAV-dependent accepted operations | NAV-reference table | `results/replay/nav-references.jsonl` |
| Gas | v1.4.0 production contract receipts/snapshot | Production baseline only | Gas table | `results/gas/production-gas.csv` |

## Required Chapter 6 replacements

The final paper must replace the preregistered counts, four `Table X`
placeholders, all metric percentages, five ablation conclusions, gas `xxx`
cells, and the phrase `moderate computational overhead` with measured,
traceable results.
