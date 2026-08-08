# Operation-by-Predicate Coverage

The 42 rows are mechanism-evaluation scenarios, not exhaustive unit tests.
Cells marked `N/A` are outside the predicate's semantic domain; cells marked
`representative` share an identical generated guard path with a listed case.

| Operation | Authorized | ComplianceValid | NAVValid | LifecycleValid | ParamConsistent |
|---|---|---|---|---|---|
| updateQualification | I01 | N/A | N/A | N/A | Residual identity/commitment checks |
| submitNAV | I02 | N/A | I11-I13 | N/A | Formula-input guards documented but not duplicated in the 24 invalid rows |
| subscribe | I03 | I06-I07 | I10 | I15 | I18-I20 |
| redeem | I04 | I09 | Latest-NAV residual dependency | I16 | I21-I22, I24 |
| transfer | Holder operation, N/A | I08 | N/A | I14, I17 | I23 |
| pause | Representative `onlyRoleIfEnabled` path | N/A | N/A | Valid transition V14 | N/A |
| resume | Same `PAUSER_ROLE` path as pause | N/A | N/A | Valid transition V15 | N/A |
| updateRole | I05 | N/A | N/A | N/A | N/A |

Additional production-only regression tests at the Chapter 3 evidence anchor
cover Gate trigger/release, `REDEMPTION_TOO_SMALL`, invalid NAV formula inputs,
invalid commitment hashes, view bounds, and deployment configuration. They are
not counted as the paper's 42 controlled scenarios.
