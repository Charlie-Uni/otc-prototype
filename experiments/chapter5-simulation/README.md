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
- paired whole-request control strength plus rule-based simulation release after consecutive low-risk periods.
- four-component fund-network proximity with independent real-channel and analogy-channel ablations;
- shared-asset mark-down transmission plus next-period overlap, public-risk, and public-control spillover inputs.
- a deterministic full-replicate runner that composes the frozen ten-stage tick pipeline;
- machine-checked paired-treatment differences, complete tick evidence, and canonical semantic digests.

`calc.ts`, `regimes.ts`, and `sensitivity.ts` are byte-identical copies from `chapter3-artifact-v1.4.0`. The observation helper is the pure scheduling subset of `detection.ts`; the complete source file is hash-locked and its observable behavior is covered by golden tests, avoiding unrelated ABI and indexer code in the simulation package.

The network generator creates model inputs only. It does not encode redemption outcomes, losses, or a preferred transparency-regime ranking.

Commands:

```bash
pnpm --filter @ots/chapter5-simulation test
pnpm --filter @ots/chapter5-simulation typecheck
pnpm --filter @ots/chapter5-simulation lock:check
```

Pilot results are calibration evidence only. Formal results may be generated only after the analysis plan and parameters are committed and tagged separately.
