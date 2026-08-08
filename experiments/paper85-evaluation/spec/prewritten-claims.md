# Chapter 6 Prewritten Claim Inventory

The statements below are hypotheses or placeholders until a completed run is
anchored. They must not be presented as observed results before that point.

| Current paper text | Required evidence | Final action |
|---|---|---|
| 42 scenarios: 18 valid and 24 invalid | Preregistered manifest plus one result row per scenario | Retain only if all 42 preregistered scenarios execute; never substitute regression-test counts |
| STCR reached 100% | Exact baseline verdicts for all scenarios | Replace with measured value and numerator/denominator |
| ARC reached 100% | Closed-input replay record for every accepted operation | Replace with measured value and replay failure count |
| NRI reached 100% | Exact NAV-reference checks for every NAV-dependent operation | Replace with measured value and invalid-reference count |
| PCR reached 100% | Replay/chain projection comparison at every checkpoint | Replace with measured value and divergent checkpoint count |
| Five ablations introduce the stated anomalies | Six variants over the same manifest, with residual failures classified | Replace prose and Figure 10 from experimental-variant evidence |
| Gas cells contain `xxx` | Production v1.4.0 gas snapshot and receipt table | Replace every placeholder with measured gas and environment metadata |
| Constraint checks add `moderate computational overhead` | A valid overhead comparator, not merely absolute gas | Remove this adjective unless a production-relevant comparator is measured; otherwise report descriptive gas only |
| Table X: operationalization | Final state/event/metric mapping | Assign table number and populate from the traceability matrix |
| Table X: overall evaluation | STCR, accepted/rejected counts, exact mismatches | Assign table number after baseline run |
| Table X: ablation | Per-variant anomaly classification and counts | Assign table number after ablation run |
| Table X: gas | Production operation gas with run environment | Assign table number after production gas run |

## Freeze rule

No conclusion sentence may be finalized until its numeric value can be traced
to the run summary, scenario result file, and SHA-256 evidence manifest.
