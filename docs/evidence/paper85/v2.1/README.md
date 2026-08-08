# Paper 8.5 Evaluation Evidence v2.1

Evidence v2.1 closes the measurement chain for Sections 6.1-6.4 of Paper 8.5.
It strengthens the post-preregistration Harness and reporting layer without
changing the sealed 42 scenarios or the production contracts.

## Anchors

- Repository: `Charlie-Uni/otc-prototype`
- Branch: `test/paper85-v21-evidence`
- Measurement implementation commit:
  `d27d99067f4f03f81b6e72ff2cc0744e05316edd`
- Preregistration commit:
  `f3ff71de8fd4634cf37f2c9b980e0c7d92e436a2`
- Scenario manifest SHA-256:
  `97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69`
- Production artifact commit:
  `e5b1e126e5e7ff37f5fe47307d945447724a17d1`
- Evaluation implementation lock SHA-256:
  `758687070f521d83225da36db79867ce612007f07c25fbffe5e642a2f49e0090`
- State-assertion specification SHA-256:
  `9d3a94b32a0481e937be2f4bbc539b692e3dc5748d4191f5242f6defaa258057`

The local evidence runs record `dirty=false` at the implementation commit.
The corresponding GitHub Actions run IDs, artifact IDs, official digests, and
expiry dates are stored in `ci-artifacts.json`. Local and CI semantic files
were compared byte-for-byte.

## Results

- M0 production/experimental equivalence: 42/42 scenarios.
- State-transition consistency: 18 valid and 24 invalid scenarios matched the
  preregistered outcome, yielding STCR = 42/42 = 1.00.
- Five single-predicate ablations: 210/210 classifications matched; the 24
  targeted cases comprise 22 accepted invalid transitions, one residual-guard
  rejection, and one arithmetic runtime revert.
- Typed state claims: 24/24 scenarios and 62/62 field-level checks passed.
- Audit Replay Coverage: ARC = 22/22 accepted lifecycle events = 1.00.
- NAV Reference Integrity: NRI = 2/2 NAV-dependent operations = 1.00. Both
  references were latest at execution and remained recoverable after later NAV
  versions were appended.
- Projection Consistency Rate: PCR = 14/14 post-operation checkpoints = 1.00.

Stable semantic hashes:

- M0: `56e78b202a16f5a8b236f107991b4c5804db54cfe7784b6b1681682b499f1c19`
- M1-M5: `5305b11b2953d28f1fb8ea00fff573aec6e35367e9a521f84cc73815360ae6a5`
- Replay: `22b4025eb3ce32809b32c4060bcaff26b6001078f41060d6e971d4e8cfa4a953`
- Gas table: `920f4022e6eeb8c2295820da59e8a7214c8b17a91336f528da8e97f4afc5ee4f`

## Production Gas

| Lifecycle operation | Average gas | Unit |
|---|---:|---|
| Qualification Update | 50,158 | one transaction |
| NAV Submission | 163,810 | one transaction; initial and formula submissions pooled |
| Subscription | 333,834 | request plus acceptance |
| Redemption | 332,253 | request plus settlement |
| Restricted Transfer | 67,074 | one transaction |
| Pause / Resume | 36,464 | one transaction; pause and resume pooled |
| Role Update | 41,129.5 | one transaction; grant and revoke pooled |

The optional `SettlementDelayed` flag transaction averaged 83,006 gas across
five samples. It is reported separately because it is not present in every
redemption lifecycle.

The table is derived from two identical batches of five fresh deterministic
deployments. It is a description of local-EVM gas consumption, not a production
fee estimate. No unconstrained production comparator was defined, so these
values do not establish a causal "moderate overhead" claim.

## Permanent Evidence

The Release asset `paper85-evaluation-v2.1-d27d990.zip` contains all four local
run directories, the three original Paper 8.5 CI artifact ZIPs, the Chapter 3
regression artifact ZIP, and the governing lock/specification files. Its
SHA-256 is:

`f962fae71e18f64a8ace2e2a3d3621fef9627cc55bcc1747acfff15b76e40f9b`

The compact files in this directory preserve the semantically relevant
observations and summaries directly in Git. `sha256.txt` binds every compact
file. Large raw Forge traces remain in the permanent Release asset.

## Counting Boundary

The 254 Foundry tests equal 42 M0 tests, 210 ablation tests, and two
infrastructure tests. The 24 targeted assertions are executed inside the 210
ablation tests and must not be added again. ARC counts events, while PCR counts
post-operation checkpoints; their denominators are intentionally different.
