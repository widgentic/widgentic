## MODIFIED Requirements

### Requirement: Versions move together and are attested
The three public packages SHALL be released as a **linked** group: every package published in the same release run SHALL carry the same version number, and a package with no change in that run SHALL keep the version it has — so the three published numbers MAY differ. Compatibility across the packages SHALL be carried by their declared dependency ranges, not by matching version numbers: `@widgentic/designer` and `@widgentic/mcp` each declare a range on `@widgentic/core`, so a `@widgentic/core` release SHALL also release both dependents (their ranges are updated in the same run) and only the leaf packages can move ahead of the others. A release run MAY update internal dependency ranges in packages it does not publish — a range declared as a devDependency is rewritten in place without bumping the package that declares it — so a manifest change in a version-packages commit is not evidence that the package will be released. Every release SHALL carry a per-package changelog entry and an npm provenance attestation produced by the repository's release workflow; releases SHALL NOT be published from a developer machine.

#### Scenario: A core minor bump moves the group
- **WHEN** a changeset raises `@widgentic/core` from 0.3.x to 0.4.0
- **THEN** `@widgentic/designer` and `@widgentic/mcp` SHALL also release as 0.4.0, each with its own changelog entry, because both declare a dependency range on `@widgentic/core`

#### Scenario: A leaf package releases alone
- **WHEN** a release run carries a changeset for `@widgentic/designer` only
- **THEN** `@widgentic/designer` SHALL be published at its new version while `@widgentic/core` and `@widgentic/mcp` keep theirs, and the published `@widgentic/designer` SHALL declare a `@widgentic/core` range that the unchanged `@widgentic/core` satisfies

#### Scenario: Co-released packages take the highest version
- **WHEN** one release run carries a patch-level changeset for one package and a minor-level changeset for another
- **THEN** both SHALL publish at the same version — the highest of the computed versions — so a patch-level change MAY land on a minor number

#### Scenario: A manifest is updated without a release
- **WHEN** a release run publishes a package that another package declares only as a devDependency
- **THEN** the declaring package's range SHALL be updated in the same run while its own version stays unchanged, and the copy already on the registry SHALL keep the range it was published with

#### Scenario: Provenance is present
- **WHEN** a published version is inspected on the registry
- **THEN** it SHALL show a provenance attestation linking it to the release workflow run
