# Paper 8.5 Evaluation v3: Pre-registration

Status: pre-registered before any v3 execution. Execution results go to
`results/v3/` and are never written back into this directory.

v3 restructures the Section 5 evaluation around five evaluation questions and
adds the stronger comparators, scale tests and case-based validation requested
in review. Sealed inputs are reused unchanged:

- 42-scenario manifest `spec/scenarios.v1.json`
  (SHA-256 `97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69`).
- Production contracts `contracts/src` at `chapter3-artifact-v1.4.0`
  (`e5b1e126e5e7ff37f5fe47307d945447724a17d1`), byte-identical in this branch.
- v2.1 results (STCR, M0, M1-M5, ARC/NRI/PCR, gas table) are cited from
  `docs/evidence/paper85/v2.1/` and were reproduced locally before v3 began
  (semantic hashes M0 `56e78b20…`, M1-M5 `5305b11b…`, replay `22b4025e…`,
  gas table `920f4022…`).

## Evaluation questions

| EQ | Question | Evidence |
|---|---|---|
| EQ1 | Does the artifact enforce lifecycle validity under representative valid/invalid conditions? | v2.1 42-scenario functional/mechanism validation + M0 equivalence (cited). |
| EQ2 | Which constraints are necessary to prevent invalid lifecycle states? | v2.1 M1-M5 single-predicate ablation (cited) + **new** comparators B1/B2 (this plan, part A). |
| EQ3 | Does the semantic event model support independent process-level reconstruction? | v2.1 ARC/NRI/PCR (cited) + **new** comparator recoverability (part A2) + **new** reconstruction at scale (part B). |
| EQ4 | What execution/storage overhead do lifecycle-aware controls add? | v2.1 production gas (cited) + **new** comparator gas (part A3) + **new** scale/stress runs (part B). |
| EQ5 | Are design objectives and lifecycle mappings relevant and complete against real-world rules? | **new** real-world-grounded case (part C). No expert panel was available; the result is case-based validation, not expert validation and not a production deployment. |

## Part A: stronger comparators (EQ2, EQ3, EQ4)

A1. Scenario comparison. Each of the 42 sealed scenarios is mapped to its
business-equivalent action on B1 (token-balance-only) and B2 (permissioned
token with allowlist and pause), as fixed in `baseline-mapping.v3.json`
together with the expected classification of every row. The runner executes
every representable row on a fresh deterministic Anvil chain, observes the
receipt status and the balance/supply/allowlist/pause/role state before and
after the action, classifies the observation, and reports
`expected == observed` per row. Pre-registered totals:

- B1: valid represented 3/18; invalid blocked 3, accepted with state change 12,
  accepted without state change 3, not representable 6 (sum 24).
- B2: valid represented 9/18; invalid blocked 13, accepted with state change 4,
  accepted without state change 3, not representable 4 (sum 24).

A2. Recoverability. The canonical 14-operation trajectory of the v2.1 replay
fixture is executed on B1 and B2 (operations without a counterpart are
skipped) and on the production contracts. Each comparator's event log is
replayed from the trusted genesis state and compared, component by component,
with the production projection at each of the 14 post-operation checkpoints.
Components: balances and total supply; eligibility; NAV version history;
operating status; execution-role assignment; request records (subscription and
redemption requests with NAV references and delay flags). Expected: balances
recoverable 14/14 for B1 and B2; eligibility, operating status and
execution-role assignment recoverable 14/14 for B2 and not recorded in B1; NAV
history, request records and NAV references not recorded in either comparator,
so the complete projection matches 0/14 and NRI is undefined (0 of 2 NAV
references recorded).

A3. Gas comparator. Each comparator's counterpart operations in the canonical
trajectory are measured from receipts over 5 fresh deterministic deployments
(identical compiler settings: solc 0.8.30, Foundry defaults). Reported side by
side with the v2.1 production gas table, with the explicit note that the
production subscription and redemption are two-transaction workflows
(request + acceptance/settlement) whereas the comparators issue one mint or
burn. No threshold hypothesis; descriptive.

## Part B: scale and stress (EQ3, EQ4)

Workload. Production contracts, 24 investor accounts, deterministic
seeded generator (seeds 1, 2, 3). Operation mix by weight, drawn only among
operations valid in the current state: subscription request 14, subscription
acceptance 14, restricted transfer 18, redemption request 12, redemption
settlement 12, settlement-delay flag 2, NAV submission 10, eligibility update 8,
pause/resume pair 4, role grant/revoke pair 2 (pending requests are drained
before a pause). One operation per block; block time advances 60 s per
operation; NAV `asOf` equals the block timestamp. Generation stops at the first
operation boundary at which the number of accepted lifecycle events reaches the
target of 100, 1,000 or 10,000 events.

Measurements per run:

- transactions, accepted lifecycle events by type, total gas, gas per
  transaction and per event, gas by operation type (mean, SD);
- storage: non-zero storage slots per contract at the end of the run from an
  Anvil state dump, and slot growth per operation;
- event index: raw log payload bytes (32 bytes per topic plus data bytes), log
  count, and size of the normalized JSONL index produced by the decoder;
- log retrieval latency (`eth_getLogs`, 2,000-block pages; 5 repetitions);
- replay latency of the pure replay engine over the full ordered log
  (1 warm-up + 10 timed repetitions; mean, SD);
- correctness at scale: ARC, NRI and PCR over 10 evenly spaced checkpoints
  plus the final block.

Pre-registered correctness expectation: ARC = NRI = PCR = 1 in all nine runs.
Size and latency are descriptive; growth is expected to be approximately
linear in the number of operations. Latency depends on hardware, which is
reported.

## Part C: real-world-grounded case (EQ5)

A stylised open-ended fund administered under four public rule sources:

- FATF Recommendation 10: customer due diligence before the relationship,
  ongoing due diligence, and no transactions / termination when CDD cannot be
  completed.
- SEC Rule 22c-1(a): forward pricing at the NAV next computed after receipt of
  the order.
- UCITS Directive 2009/65/EC Art. 84(2)(a) and (3): temporary suspension of
  dealing in exceptional cases, with notification of the competent authority.
- CSSF Circular 24/856: NAV calculation error correction and remediation of
  subscriptions and redemptions processed at the erroneous NAV.

The case is executed on the production contracts as a fixed script
(`scripts/v3/run-case.mjs`): onboarding of three investors; initial-offer
subscription priced at the issue NAV; a forward-priced subscription; one
subscription deliberately accepted before the next NAV (backward-priced
exception); a forward-priced redemption settled at a NAV later found
erroneous; a restricted transfer; a failed periodic CDD review and revocation;
a redemption attempt by the revoked holder; a board suspension with a
redemption request received during suspension and a settlement attempt
rejected during suspension; a same-`asOf` NAV correction; resumption; a
delay-flagged settlement after resumption; and a late correction probe of an
earlier NAV after a newer NAV exists.

Audit queries are answered from the replayed event log and genesis state
only (contract views disabled until replay completes). Pre-registered
answers:

- Q1 forward-pricing check (`navAsOf > requestedAt` for every acceptance and
  settlement): 4 of 5 compliant; the exception is investor C's subscription.
  The contract accepts it; the audit detects it.
- Q2 NAV-error impact: exactly one processed request referenced the
  superseded erroneous version (investor A's redemption).
- Q3 eligibility at the time of every share movement: all recorded share
  movements involve accounts eligible at that time.
- Q4 suspension window: zero share movements; one redemption request
  received; two NAV versions recorded.
- Q5 NAV provenance: five versions, each with submitter and payload hash; one
  same-`asOf` correction.
- Q6 projection consistency: every post-operation checkpoint matches.
- Q7 settlement delay: one delayed redemption with a reason hash; the
  settlement lag is recoverable.

Pre-registered rule-fit gaps the case is designed to expose (expected
on-chain outcome in brackets): revoked holder cannot exit [redemption rejected
`NOT_WHITELISTED`; the model's ControlledExit disposition is not implemented];
backward-priced acceptance is not prevented [accepted; detection only ex post];
correction of an older NAV once a newer NAV exists [rejected
`AS_OF_BEFORE_LATEST`]; investor compensation for NAV errors and regulator
notification of suspension have no on-chain representation; rejected attempts
leave no lifecycle event and are visible only as failed transactions.

## Integrity rules

1. This plan and `baseline-mapping.v3.json` are committed before any v3 run;
   their SHA-256 values are recorded in every v3 run summary.
2. Every v3 number placed in the paper must trace to a `results/v3/` summary
   with its SHA-256 listed in the v3 evidence manifest.
3. Mismatches between expected and observed values are reported, not edited
   away.
