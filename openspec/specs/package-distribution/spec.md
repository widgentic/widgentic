# package-distribution Specification

## Purpose
What the published widgentic packages guarantee to the people who install them: which code lives in which package, that the boundaries hold, that the artifacts install and type-check, where each runs, what they depend on, how versions move — and how this repository's own apps and examples consume them.

## Requirements

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

### Requirement: Package boundaries are enforced at the source
Every import that crosses a package boundary SHALL use the target package's specifier — its root or a declared subpath entry — never a relative path or a path into another package's internals. The dependency direction SHALL be: `@widgentic/core` depends on no widgentic package; `@widgentic/designer` and `@widgentic/mcp` depend only on `@widgentic/core`; examples depend only on published entries; the private apps may depend on anything. The repository SHALL verify these rules in its default test gate, and the check SHALL fail on a specifier that no `exports` entry resolves.

#### Scenario: A deep import is rejected
- **WHEN** a source file in `@widgentic/designer` imports `../../core/src/theming/registry.js` or `@widgentic/core/src/theming/registry.js`
- **THEN** the boundary check SHALL fail naming the file and the specifier

#### Scenario: A reverse edge is rejected
- **WHEN** a source file in `@widgentic/core` imports from `@widgentic/designer` or `@widgentic/mcp`
- **THEN** the boundary check SHALL fail

#### Scenario: Only declared entries resolve
- **WHEN** a file imports `@widgentic/mcp/handlers` and the mcp manifest declares no such entry
- **THEN** the boundary check SHALL fail before any consumer discovers it at install time

### Requirement: Published artifacts are consumable
Each public package SHALL publish compiled ES modules with TypeScript declarations and source maps under `dist`, an `exports` map whose every documented entry resolves for both the `types` and the default import condition, `files` limited to the build output and package documents, `sideEffects: false`, an `engines.node` range, a `license`, and a `repository` field. No TypeScript source, test, or fixture SHALL be part of the tarball. The declarations SHALL type-check for consumers using Node16/bundler module resolution.

#### Scenario: The tarball is build output only
- **WHEN** `npm pack --dry-run` runs for a public package
- **THEN** the file list SHALL contain `dist/**`, `package.json`, `README.md` and `LICENSE`, and nothing under `src` or `__tests__`

#### Scenario: Every entry resolves with types
- **WHEN** a TypeScript project installs the packed tarball and imports each documented entry
- **THEN** every import SHALL resolve at runtime and carry types (no implicit `any`), with the publint and are-the-types-wrong checks passing

### Requirement: Runtime targets are explicit
`@widgentic/core` and `@widgentic/designer` SHALL run in browsers and in Node without Node-only modules: no `node:` import, no `Buffer`, no `process` in their sources. `@widgentic/mcp` SHALL declare and require Node 22 or later (it relies on `net.BlockList`, `AbortSignal.timeout` and the global `fetch`).

#### Scenario: Core and designer load in a browser context
- **WHEN** `@widgentic/core` and `@widgentic/designer` are imported in a DOM-only environment with no Node module resolution
- **THEN** the imports SHALL succeed and rendering plus designer mounting SHALL work

#### Scenario: A Node-only import in core fails the gate
- **WHEN** a source file under `@widgentic/core` or `@widgentic/designer` imports a `node:` module
- **THEN** the boundary check SHALL fail

### Requirement: Dependencies are declared honestly
`@widgentic/core` SHALL declare no runtime dependencies. `@widgentic/designer` and `@widgentic/mcp` SHALL declare `@widgentic/core` as a dependency with a compatible range. `@widgentic/mcp` SHALL declare the MCP SDK packages and `zod` as optional peer dependencies — needed only by hosts importing the `./sdk` entry — and the Azure client packages as optional peer dependencies needed only by the Cosmos and Key Vault subpaths. The root entry of every package SHALL be importable with only its declared non-optional dependencies installed.

#### Scenario: Core carries nothing
- **WHEN** the `@widgentic/core` manifest is inspected
- **THEN** it SHALL have no `dependencies` and no `peerDependencies`

#### Scenario: The SDK is a host's choice
- **WHEN** a host imports `@widgentic/mcp` without `@modelcontextprotocol/sdk` installed
- **THEN** the import SHALL succeed, and only importing `@widgentic/mcp/sdk` SHALL require the SDK

### Requirement: The designer ships a browser bundle
`@widgentic/designer` SHALL additionally publish a single-file ES module bundle (core inlined) that registers the designer custom elements when loaded, so a page without a bundler can host the designers from a `<script type="module">` tag. The module build SHALL remain the primary entry for bundler users.

#### Scenario: Script-tag hosting
- **WHEN** a static page loads the bundle from a module script and places `<widgentic-designer>` in its body
- **THEN** the widget designer SHALL mount without any other network request for widgentic code

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
