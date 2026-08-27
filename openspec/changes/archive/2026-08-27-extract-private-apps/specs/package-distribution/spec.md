# package-distribution — extract-private-apps delta

## MODIFIED Requirements

### Requirement: Apps and examples consume the public entries
The examples in this repository SHALL import widgentic only through the published package specifiers, never through source paths, and during development the repository SHALL resolve those specifiers to the package sources without a build step (typecheck, tests and the runnable examples), with the packed packages behaving identically. Our own apps SHALL NOT live in this repository: they SHALL be maintained in a separate private repository that depends on published `@widgentic/*` versions from the registry, so a package change reaches the apps only through a release and a dependency bump.

#### Scenario: An app reaches into sources
- **WHEN** a file under `examples/` imports a path under `packages/*/src`
- **THEN** the boundary check SHALL fail

#### Scenario: Development needs no publish
- **WHEN** a developer changes a core module and runs the test suite or the designer example
- **THEN** the change SHALL be visible immediately, without building or publishing any package

#### Scenario: The apps pin published versions
- **WHEN** the private apps repository installs its dependencies
- **THEN** `@widgentic/core`, `@widgentic/designer` and `@widgentic/mcp` SHALL resolve from the npm registry at the declared versions, and no path into this repository's sources SHALL be referenced
