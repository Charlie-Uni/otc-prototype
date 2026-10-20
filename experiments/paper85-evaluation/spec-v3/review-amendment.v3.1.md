# Post-review amendment v3.1 (2026-10-20)

This is an amendment written after inspection of the original v3 outcomes. It
is not an original preregistration. The original plan and baseline mapping at
4ce5d24 and the archived v3 evidence remain unchanged. Production sources stay
byte-identical to chapter3-artifact-v1.4.0. EQ1–EQ5 and the 42-scenario corpus
remain the evaluation structure.

## Changes fixed before the revised full run

1. Q1 audits the next **applicable regular NAV**, not merely `asOf > requestedAt`.
   The case explicitly treats approval `storedAt` as the simulated computation
   time, separates the D2 historical correction from regular dealing NAVs, and
   queues orders received during suspension for the D4 17:00 resumption NAV
   (execution resumes at 17:10). This is a disclosed case policy, not a legal
   applicability engine or independent verification of actual computation.
   The original 26-step fixture remains unchanged: four of five processed
   orders should match this policy, with C's early acceptance flagged. Keep the
   original proxy result alongside the revised result. Add a separate on-chain
   counterexample: order, NAV1, NAV2, acceptance at NAV2; the original proxy
   should pass and the revised audit should flag `skipped-next-NAV`.
2. Classify only positively identified EVM execution reverts as rejections.
   Encoding, transport, timeout, invalid RPC and receipt failures abort a run.
   Rejections are **simulated eth_call attempts**, not mined failed transactions.
3. Each suite gets a fresh immutable run directory. Archive calls, simulated
   rejection records, mined envelopes/receipts/block timestamps, raw logs,
   genesis, ABIs, normalized index, checkpoint views, final projection, storage
   slot maps and all fetch/replay timing samples. Summaries aggregate persisted
   per-run records. Seal only after offline verification; incomplete directories
   are never publication evidence. File hashes detect corruption, not external
   attestation or proof that the institution's input was truthful.
4. Reject uncommitted governed inputs (including runners, replay engine, specs,
   source, build configuration and dependency manifests). Rebuild with solc
   0.8.30 / Osaka / optimizer off / 200 runs / IPFS metadata. Archive literal
   compiler inputs/outputs and artifacts, independently recompile and compare
   creation/runtime bytecode; verify deployed runtime modulo immutable slots.
   Record actual host, versions, source commit and dependency-source hashes.
5. Correct scale NAV `asOf` to the upcoming assigned block timestamp, rather
   than the prior block timestamp. Original v3 used a 60-second lag, a third
   deviation omitted from its manuscript. Preserve original evidence and rerun
   all nine target×seed combinations; assert `asOf == storedAt`. Any changed
   gas, index size and timing comes from these new runs. No selective timing
   replacement; the host is not guaranteed exclusive. Call this a sequential
   scale/growth experiment, not a concurrency or production stress benchmark.

## Analysis and gates

Rerun comparison A (84 classifications), canonical production/B1/B2 replay,
five fresh canonical gas deployments per implementation, all scale targets
100/1,000/10,000 × seeds 1/2/3, case C, revoked-holder probe D, and the new
next-NAV probe E. Preserve the old functional/mechanism and ablation evidence.
All classification expectations, ARC/NRI/PCR equalities and case expectations
must pass; any infrastructure error or evidence mismatch fails the suite.
Report sample SD (n−1) across seed means, separately from within-run timing SD.
Replay latency times the pure replay loop (one warm-up, ten samples), excluding
fetch, decoding, final reference checks and evidence I/O. Fetch uses five samples
of 2,000-block pages. State growth counts nonzero slots, not physical disk size.

Manuscript claims link to result-file JSON paths, with hashes in the run
manifest; older results keep their original provenance. New measurements do
not replace the original preregistration or become retrospective preregistered
claims. Expert review and a centralized B3 comparator remain future work.

## Source grounding

Rule 22c-1(a) requires the NAV next computed after receipt, while (b)/(d) address
the computation schedule. Source checked 2026-10-20:
https://www.ecfr.gov/current/title-17/chapter-II/part-270/section-270.22c-1 .
The mixed FATF/US/EU/Luxembourg case illustrates selected operational concerns;
it is not a single jurisdiction's complete legal compliance test or production
deployment. The event record cannot establish external CDD quality, actual
valuation computation, board decisions, notifications or cash compensation.
