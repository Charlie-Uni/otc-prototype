# Analysis Plan Draft

Status: historical foundation draft. The executable candidate is now
`formal-preregistration.md` plus the strict JSON plan and experiment matrix.

This document records the analysis structure before model implementation. Pilot runs may calibrate numerical behavior ranges and estimate Monte Carlo standard errors. Pilot observations are excluded from formal thesis results.

Before formal execution, a separate commit and annotated tag `chapter5-sim-prereg-v2` will freeze:

- seven statistical families (H1-H3, H4a, H4b, H5, and H6) without using expected directions as model pass/fail gates;
- primary and supplementary metrics;
- paired counterfactual definitions;
- censoring, pending, exclusion, and failure rules;
- baseline and one-dimension sensitivity configurations;
- behavior coefficient ranges and sampling design;
- Oracle latency and execution-failure treatments;
- random seeds and required replication counts;
- confidence interval and multiple-comparison procedures;
- planned tables and figures.

Formal replication count is `max(500, count implied by the pilot confidence-interval half-width target)`. Key robustness cells use at least 1000 replications.

Chapter 5 final prose begins after preregistration. Chapter 6 results prose begins only after formal outputs and figures pass evidence checks.
