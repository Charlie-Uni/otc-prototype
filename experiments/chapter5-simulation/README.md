# Chapter 5 Simulation

This workspace implements the dynamic OTC fund simulation specified in Chapters 5 and 6. It is isolated from the frozen Chapter 3 production artifact and from `experiments/paper85-evaluation`.

The foundation phase provides:

- requirement, formula, robustness, and time-semantics specifications;
- a deterministic one-day tick pipeline;
- counter-based random draws keyed by replicate, entity, module, tick, purpose, and ordinal;
- a hash-locked snapshot of the Chapter 3 disclosure and risk-calculation semantics;
- golden tests that reproduce the Chapter 3 score, threshold, disclosure, and observation results.

`calc.ts`, `regimes.ts`, and `sensitivity.ts` are byte-identical copies from `chapter3-artifact-v1.4.0`. The observation helper is the pure scheduling subset of `detection.ts`; the complete source file is hash-locked and its observable behavior is covered by golden tests, avoiding unrelated ABI and indexer code in the simulation package.

Commands:

```bash
pnpm --filter @ots/chapter5-simulation test
pnpm --filter @ots/chapter5-simulation typecheck
pnpm --filter @ots/chapter5-simulation lock:check
```

Pilot results are calibration evidence only. Formal results may be generated only after the analysis plan and parameters are committed and tagged separately.
