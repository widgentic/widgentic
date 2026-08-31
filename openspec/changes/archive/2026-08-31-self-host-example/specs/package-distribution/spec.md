## MODIFIED Requirements

### Requirement: Three public packages with fixed contents
widgentic SHALL be published as three npm packages under the `@widgentic` scope. `@widgentic/core` SHALL contain the contract, data adapters, mapper, catalog, theming, templates, actions and reactive rendering — definitions, validation and rendering only, with no designer, server or persistence code. `@widgentic/designer` SHALL contain the designer library (widget, theme, schema and action designers and their custom elements). `@widgentic/mcp` SHALL contain the MCP output convention, the server building blocks and assembly, the per-principal store and the secrets layer, the authoring surface a host exposes to its own users, with the store and secrets adapters behind dedicated subpath entries (`./store/sqlite`, `./store/cosmos`, `./secrets/keyvault`) and the authoring surface behind `./authoring`; an adapter entry that needs no client package SHALL still ship behind its own subpath, so what an entry costs to import stays visible in the import itself. Our own MCP server, web app and deployment SHALL NOT be part of any published package.

#### Scenario: Core installs alone
- **WHEN** a project installs `@widgentic/core`
- **THEN** no designer, server, store or secrets code SHALL be present in `node_modules/@widgentic`, and the install SHALL pull no other widgentic package

#### Scenario: Designer and mcp bring core
- **WHEN** a project installs `@widgentic/designer` or `@widgentic/mcp`
- **THEN** `@widgentic/core` SHALL be installed as their dependency at a compatible version, and nothing else from the scope

#### Scenario: Adapters stay behind their subpaths
- **WHEN** a host imports `@widgentic/mcp`, `@widgentic/mcp/store` and `@widgentic/mcp/store/sqlite` without any Azure client package installed
- **THEN** all three imports SHALL succeed — only `@widgentic/mcp/store/cosmos` and `@widgentic/mcp/secrets/keyvault` require them

### Requirement: Apps and examples consume the public entries
The examples in this repository SHALL import widgentic only through the published package specifiers, never through source paths, and during development the repository SHALL resolve those specifiers to the package sources without a build step (typecheck, tests and the runnable examples), with the packed packages behaving identically. The examples are a maintained guide for people building their own hosts, so host wiring that more than one example needs — the mount/dispose discipline a designer requires, and the client for the authoring routes — SHALL live in one shared example module that the examples import, never in divergent copies; a page's palette SHALL be derived from the designer package's exported default rather than copied, so no palette lives in any example; each example SHALL still show its own designer construction and its own persistence at its own call sites, because that is what a reader came to read. Every example SHALL be typechecked in the default gate, so a host-facing API change cannot leave an example demonstrating a superseded pattern. Our own apps SHALL NOT live in this repository: they SHALL be maintained in a separate private repository that depends on published `@widgentic/*` versions from the registry, so a package change reaches the apps only through a release and a dependency bump.

#### Scenario: An app reaches into sources
- **WHEN** a file under `examples/` imports a path under `packages/*/src`
- **THEN** the boundary check SHALL fail

#### Scenario: Development needs no publish
- **WHEN** a developer changes a core module and runs the test suite or the designer example
- **THEN** the change SHALL be visible immediately, without building or publishing any package

#### Scenario: The apps pin published versions
- **WHEN** the private apps repository installs its dependencies
- **THEN** `@widgentic/core`, `@widgentic/designer` and `@widgentic/mcp` SHALL resolve from the npm registry at the declared versions, and no path into this repository's sources SHALL be referenced

#### Scenario: Shared host wiring has one home
- **WHEN** a second example needs the designer mount discipline or the authoring client that another example already has
- **THEN** it SHALL import the shared example module, and no example SHALL carry its own copy of that wiring — and a page palette SHALL come from the exported default, never from a copied block

#### Scenario: An API change cannot leave an example behind
- **WHEN** a designer- or server-facing API changes in a way an example uses
- **THEN** the workspace typecheck SHALL fail until every example is updated in the same change

### Requirement: Capabilities map to packages
Each capability specification SHALL name the distribution unit it ships in, and SHALL name exactly one: `widget-contract`, `data-adapters`, `widget-mapper`, `widget-catalog`, `widget-theming`, `template-widgets`, `widget-actions` and `reactive-rendering` to `@widgentic/core`; `widget-designer` to `@widgentic/designer`; `mcp-widget-output`, `mcp-server`, `widget-store`, `widget-secrets` and `authoring-api` to `@widgentic/mcp`; `widgentic-app` to the private apps. A capability MAY instead map to no published package — `package-distribution`, `docs-site` and `self-host-example` do — in which case it ships by being committed, deployed or built from this repository rather than published, and a change confined to it SHALL NOT cause a package release. A requirement that changes observable behavior SHALL ship in the distribution unit its capability names; when a capability that maps to no package needs a package change to work, that change SHALL be made as a requirement of the capability that owns it, released there, and consumed.

#### Scenario: A store requirement ships in mcp
- **WHEN** a `widget-store` requirement changes
- **THEN** the change SHALL be released in `@widgentic/mcp`, and no other package SHALL need a release for it beyond the linked version bump

#### Scenario: An unpublished capability triggers no release
- **WHEN** a change touches only a capability that maps to no published package
- **THEN** no changeset SHALL be required and no package version SHALL move

#### Scenario: An example's need becomes a package requirement
- **WHEN** `self-host-example` needs behavior that does not exist in the packages
- **THEN** that behavior SHALL be specified as a requirement of the capability that owns it and released from there, never added to the example as a private copy
