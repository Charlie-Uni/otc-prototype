# Paper 8.5 Evaluation Evidence v3

v3 supports the restructured Section 5 (EQ1–EQ5). It adds comparators,
scale/stress runs and a real-world-grounded case to the sealed v2.1 evidence,
which is cited unchanged for EQ1, the M1–M5 ablation, the canonical replay and
the production gas table.

## Anchors

- Pre-registration commit: `4ce5d24f4df5e842851ba2600f5c50e84cf44af3`
  (`spec-v3/evaluation-plan.v3.md` SHA-256 `6a886b38…f8479ff`,
  `spec-v3/baseline-mapping.v3.json` SHA-256 `3276991c…08b506b0b7`).
- Execution commit for all three summaries: `cdc0af5`, governed inputs clean
  (`spec-v3`, `baselines/src`, `contracts/src`).
- Production contracts: byte-identical to `chapter3-artifact-v1.4.0`
  (`e5b1e126e5e7ff37f5fe47307d945447724a17d1`).
- v2.1 reproduction before v3: M0 `56e78b20…`, M1–M5 `5305b11b…`, replay
  `22b4025e…`, gas table `920f4022…` all matched byte-for-byte.
- Toolchain: solc 0.8.30, Foundry/Anvil 1.7.1, OpenZeppelin 5.4.0,
  Node.js 22.22.0, viem 2.55.10; Intel Xeon 2.1 GHz, 2 vCPU, 7 GB, Ubuntu 24.04.

## Results

- Part A (`A-summary.json`, `A-scenario-rows.json`): 84/84 comparator
  observations matched the pre-registered classification. Invalid scenarios
  (blocked / accepted with balance change / accepted without balance change /
  not representable): B1 3/12/3/6, B2 13/4/3/4. Valid scenarios representable:
  B1 3/18, B2 9/18. Recoverability on the canonical trajectory: balances 14/14
  for both comparators; eligibility, operating status and execution roles
  14/14 for B2 and not recorded by B1; NAV history, request records and NAV
  references not recorded by either; complete projection 0/14 for both
  (2/14 for B2 under value equality).
- Part B (`B-scale-*.json`): 9 runs (100/1,000/10,000 events × seeds 1–3).
  ARC, NRI and PCR equal 1 in every run. Deterministic quantities (gas,
  storage slots, log bytes) were identical across two complete executions.
  The first execution overlapped with another workload and its latency values
  were discarded; the archived run was executed on an otherwise idle machine.
- Part C (`C-case-summary.json`): 26/26 scripted steps and Q1–Q7 matched the
  pre-registered outcomes.

## Interpretation boundaries

- Comparator mappings are researcher judgements fixed before execution; they
  are not claims about any specific commercial token standard.
- Scale latency is hardware-specific and single-node; gas is local-EVM gas,
  not a fee estimate.
- PCR checkpoints at scale are the first operations at which cumulative events
  reach each tenth of the target plus the final operation; views are read live
  because Anvil does not retain old historical state.
- Part C is case-based validation against public rules. It is neither expert
  validation nor a production deployment.

`sha256.txt` binds every JSON file in this directory.
