# Paper 8.5 Evidence Provenance Corrections

This record supplements the immutable v1 and v2 evidence directories. Where a
legacy README or manifest describes an archive hash ambiguously, this file is
the controlling provenance statement.

## GitHub Actions artifacts

All runs below belong to `Charlie-Uni/otc-prototype` on the
`experiment/paper85-evaluation` branch.

| Evidence | Workflow run | Artifact ID | GitHub artifact digest |
|---|---:|---:|---|
| v1 M0, HEAD-compatible | 31241819034 | 9017263201 | `40e2a5b147701254684503ff8e21206270d7b00ef140c6972139cf46b1c9b3f5` |
| v1 M0 plus M1-M5 | 31241819079 | 9017264497 | `015bd8d2a6f0236a1a142cb4ed89380d43e4ac822c8400e1783c56587c1f45f8` |
| v2 M0 plus M1-M5 | 31246245332 | 9018581250 | `19c51cbfeb8c88cc0df0148ded7b91a42bb6673c5ea041c746cbb0d01e6d9115` |

The v1 value
`4ccde6ec6a95da71ff8e5e2239fa4eca7a855142e6ad9225b677720fbf5e5606`
is the SHA-256 of a locally reassembled archive, not GitHub's official
artifact digest. Its contents were compared byte-for-byte with the canonical
evidence files, so the content verification remains valid; the archive origin
label in the legacy v1 text was imprecise.

## Preregistration history

The failed preregistration workflow used commit
`baa52845866199677584586c7bd0b01f981096e5`. Before any M0 or ablation result
was run, that commit was amended and force-updated to the formal seal
`f3ff71de8fd4634cf37f2c9b980e0c7d92e436a2`. The sealed scenario manifest was
byte-identical at SHA-256
`97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69`;
the amend corrected workflow and generated-source verification. The annotated
tag `paper85-prereg-v1` points to the latter commit.

## Interpretation constraints

- The total of 254 Foundry tests already includes 42 M0 tests, 210 ablation
  tests, and two infrastructure tests. The 24 targeted state assertions are
  executed inside the 210 ablation tests and must not be added again.
- I10/M3 is an inert ablation on that path: both arms retain the structural
  `NO_NAV` dependency and produce no state divergence.
- M0 evidence cited for v1 must come from the HEAD-compatible rerun in workflow
  31241819034 or 31241819079, not the earlier historical M0-only execution.
- Production gas comes from `chapter3-artifact-v1.4.0`; feature-flagged
  experimental variants are excluded.
