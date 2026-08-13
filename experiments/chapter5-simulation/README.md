# Chapter 5 Simulation

This workspace implements the dynamic OTC fund simulation specified in Chapters 5 and 6. It is isolated from the frozen Chapter 3 production artifact and from `experiments/paper85-evaluation`.

The foundation phase provides:

- requirement, formula, robustness, and time-semantics specifications;
- a deterministic one-day tick pipeline;
- counter-based random draws keyed by replicate, entity, module, tick, purpose, and ordinal;
- a hash-locked snapshot of the Chapter 3 disclosure and risk-calculation semantics;
- golden tests that reproduce the Chapter 3 score, threshold, disclosure, and observation results.
- a deterministic 10-fund, 200-investor, 5-asset initial network with conserved holdings and exposures;
- independently varied liquidity-mismatch, stale-pricing, and investor-concentration fund tiers.
- paired single-fund valuation shocks at 10%, 20%, and 30%, sampled at second resolution within R0;
- separate economic and Oracle-reported state so shock visibility follows the frozen tick pipeline.
- six-metric risk derivation and equal-weight scoring through vendored Chapter 3 functions;
- heterogeneous 1/7/14-day NAV reporting cadence with raw and normalized stale-pricing evidence;
- deterministic paired Oracle latency, execution-failure, and bounded-retry treatments;
- runtime share registration with a holder-balance-to-total-supply conservation invariant.
- R0-R4 public/regulator disclosure events produced by the vendored policy engine;
- paired heterogeneous investor polling schedules and observation-derived signal synchronicity.
- prior-preserving investor beliefs and a monotone `ExpectedOthersRedeem` coordination signal;
- configurable Logistic redemption probabilities with paired counter-based decision draws.
- dual investor-count and share-flow redemption-pressure measures;
- FIFO whole-request settlement with share locking, cash-first liquidity use, and explicit pending states;
- continuous first-mover advantage and deterministic price-impact asset sales with reconciled discount loss.
- Oracle-driven Gate transitions with strict kappa boundaries and auditable source provenance;
- deterministic FIFO whole-request control budgets plus rule-based simulation release after qualifying low-risk evidence periods.
- four-component fund-network proximity with independent real-channel and analogy-channel ablations;
- shared-asset mark-down transmission plus next-period overlap, public-risk, and public-control spillover inputs.
- a deterministic full-replicate runner that composes the frozen ten-stage tick pipeline;
- machine-checked paired-treatment differences, complete tick evidence, and canonical semantic digests.
- mechanism-local pilot sanity gates separated from non-gating R0-R4 calibration diagnostics.
- deterministic single-run and paired-counterfactual outcome metrics for Chapter 6 analysis.
- non-gating behavior/demand-transmission calibration and paired Monte Carlo precision planning before preregistration.
- explicit pilot diagnosis of global detection-threshold coverage, with no automatic fallback when no candidate is identifiable.
- a strict formal-analysis candidate with a paired shock-linked detection anchor, 144 deterministic cells, contamination checks, and a separate preregistration hash lock.
- an explicit compiler for all 144 locked cells, including atomic dependent parameters and A1-A6 experiment-only mechanism switches;
- valuation, liquidity, and redemption shock injectors with recomputable evidence and paired target/time coordinates;
- a fail-closed formal executor that requires the preregistration tag, byte-identical lock, clean Chapter 5 worktree, and result provenance agreement.
- deterministic pair-level shard planning for all 43,000 paired replicates without gaps or overlaps;
- compact 30/60/90-day arm measurements and paired observations derived immediately after each run;
- immutable shard evidence publication with digest validation, idempotent replay, conflict rejection, and separate failure records.
- bounded parallel execution with validated shard files as the only resume checkpoint;
- pre-result H1-H6 effect-direction mapping, censoring counts, supplementary robustness summaries, and within-hypothesis Holm adjustment.

`calc.ts`, `regimes.ts`, and `sensitivity.ts` are byte-identical copies from `chapter3-artifact-v1.4.0`. The observation helper is the pure scheduling subset of `detection.ts`; the complete source file is hash-locked and its observable behavior is covered by golden tests, avoiding unrelated ABI and indexer code in the simulation package.

The network generator creates model inputs only. It does not encode redemption outcomes, losses, or a preferred transparency-regime ranking.

Commands:

```bash
pnpm --filter @ots/chapter5-simulation test
pnpm --filter @ots/chapter5-simulation typecheck
pnpm --filter @ots/chapter5-simulation lock:check
pnpm --filter @ots/chapter5-simulation pilot:sanity
pnpm --filter @ots/chapter5-simulation pilot:calibrate
pnpm --filter @ots/chapter5-simulation pilot:control-threshold
pnpm --filter @ots/chapter5-simulation prereg:check
pnpm --filter @ots/chapter5-simulation exec tsx scripts/formal-shard-plan.ts 50 results/formal-shard-plan.json
pnpm --filter @ots/chapter5-simulation exec tsx scripts/run-formal-shard.ts results/formal-shard-plan.json '<shard-id>' results/formal-shards
pnpm --filter @ots/chapter5-simulation exec tsx scripts/run-formal-experiment.ts results/formal-shard-plan.json results/formal-shards 4
pnpm --filter @ots/chapter5-simulation exec tsx scripts/build-formal-report.ts results/formal-shard-plan.json results/formal-shards results/formal-report.json
```

Pilot results are calibration evidence only. Formal results may be generated only after the analysis plan and parameters are committed, pass CI, and are tagged `chapter5-sim-prereg-v1`. The committed matrix is a design artifact, not an experimental result.

`spec/formal-execution-semantics.md` records post-preregistration implementation semantics only. It does not alter any locked hypothesis, parameter, cell, expected direction, replication count, or exclusion rule.

The two formal commands are execution infrastructure, not an instruction to run the full experiment
from a dirty worktree. The shard runner enforces the preregistration tag, lock, ancestry, and
clean-worktree gates before accepting any observation.

The shard plan, shard results, and final report are non-replacing evidence files. Repeating the same
content is idempotent; a different digest at an existing path is rejected. The plan file must be kept
outside the shard directory because the complete-set validator accepts only expected shard and failure
records. Analysis starts only after all workers stop and rejects any remaining `.partial-*` file.
