## MODIFIED Requirements

### Requirement: Three public packages with fixed contents
widgentic SHALL be published as four npm packages under the `@widgentic` scope and one NuGet package. `@widgentic/core` SHALL contain the contract, data adapters, mapper, catalog, theming, templates, actions and reactive rendering — definitions, validation and rendering only, with no designer, server or persistence code. `@widgentic/designer` SHALL contain the designer library (widget, theme, schema and action designers and their custom elements). `@widgentic/webmcp` SHALL contain the WebMCP tool layer over the designers (descriptor factories, registration and disposal) and nothing else — no designer UI, no server code — and SHALL state its beta status in its package description and README until its first major version. `@widgentic/mcp` SHALL contain the MCP output convention, the server building blocks and assembly, the runtime-neutral host bundle behind `./host`, the per-principal store and the secrets layer, the authoring surface a host exposes to its own users and the OAuth helpers and authorization surface by which a host signs MCP hosts in, with the store and secrets adapters behind dedicated subpath entries (`./store/sqlite`, `./store/cosmos`, `./secrets/keyvault`) the authoring surface behind `./authoring` and the OAuth helpers and authorization surface behind `./oauth`; an adapter entry that needs no client package SHALL still ship behind its own subpath, so what an entry costs to import stays visible in the import itself. `Widgentic.Mcp` (NuGet) SHALL contain the .NET host — the embedded `@widgentic/mcp` host bundle, its execution on V8, and the C# MCP SDK wiring — with no C# re-implementation of rendering, validation or tool texts and no store or secrets code, and SHALL state its beta status in its package description and README until its first major version. Our own MCP server, web app and deployment SHALL NOT be part of any published package.

#### Scenario: Core installs alone
- **WHEN** a project installs `@widgentic/core`
- **THEN** no designer, server, store or secrets code SHALL be present in `node_modules/@widgentic`, and the install SHALL pull no other widgentic package

#### Scenario: Designer and mcp bring core
- **WHEN** a project installs `@widgentic/designer` or `@widgentic/mcp`
- **THEN** `@widgentic/core` SHALL be installed as their dependency at a compatible version, and nothing else from the scope

#### Scenario: Adapters stay behind their subpaths
- **WHEN** a host imports `@widgentic/mcp`, `@widgentic/mcp/store` and `@widgentic/mcp/store/sqlite` without any Azure client package installed
- **THEN** all three imports SHALL succeed — only `@widgentic/mcp/store/cosmos` and `@widgentic/mcp/secrets/keyvault` require them

#### Scenario: Webmcp brings core and designer
- **WHEN** a project installs `@widgentic/webmcp`
- **THEN** `@widgentic/core` and `@widgentic/designer` SHALL be installed as its dependencies at compatible versions, and nothing else from the scope

#### Scenario: Webmcp declares itself beta
- **WHEN** the `@widgentic/webmcp` manifest and README are inspected before 1.0
- **THEN** both SHALL state that the package is beta and its API may change in minor versions

#### Scenario: The NuGet package is build output only
- **WHEN** the `Widgentic.Mcp` `.nupkg` is inspected
- **THEN** it SHALL contain the compiled assembly (with the host bundle as an embedded resource), its XML documentation, `README.md` and `LICENSE`, and no C#, TypeScript or test source

#### Scenario: The NuGet package declares itself beta
- **WHEN** the `Widgentic.Mcp` package description and README are inspected before 1.0
- **THEN** both SHALL state that the package is beta, render-only, and that its API may change in minor versions

#### Scenario: The authorization surface has its own entry
- **WHEN** a host imports `@widgentic/mcp/oauth` with no MCP SDK and no Azure client package installed
- **THEN** the import SHALL succeed, and importing the base `@widgentic/mcp` entry SHALL NOT load the authorization surface

### Requirement: Capabilities map to packages
Each capability specification SHALL name the distribution unit it ships in, and SHALL name exactly one: `widget-contract`, `data-adapters`, `widget-mapper`, `widget-catalog`, `widget-theming`, `template-widgets`, `widget-actions` and `reactive-rendering` to `@widgentic/core`; `widget-designer` to `@widgentic/designer`; `designer-webmcp` to `@widgentic/webmcp`; `mcp-widget-output`, `mcp-server`, `widget-store`, `widget-secrets`, `authoring-api` and `mcp-authorization` to `@widgentic/mcp`; `dotnet-host` to `Widgentic.Mcp` (NuGet); `widgentic-app` to the private apps. A capability MAY instead map to no published package — `package-distribution`, `docs-site` and `self-host-example` do — in which case it ships by being committed, deployed or built from this repository rather than published, and a change confined to it SHALL NOT cause a package release. A requirement that changes observable behavior SHALL ship in the distribution unit its capability names; when a capability that maps to no package needs a package change to work, that change SHALL be made as a requirement of the capability that owns it, released there, and consumed.

#### Scenario: A store requirement ships in mcp
- **WHEN** a `widget-store` requirement changes
- **THEN** the change SHALL be released in `@widgentic/mcp`, and no other package SHALL need a release for it beyond the linked version bump

#### Scenario: An unpublished capability triggers no release
- **WHEN** a change touches only a capability that maps to no published package
- **THEN** no changeset SHALL be required and no package version SHALL move

#### Scenario: An example's need becomes a package requirement
- **WHEN** `self-host-example` needs behavior that does not exist in the packages
- **THEN** that behavior SHALL be specified as a requirement of the capability that owns it and released from there, never added to the example as a private copy

#### Scenario: A webmcp requirement ships in webmcp
- **WHEN** a `designer-webmcp` requirement changes
- **THEN** the change SHALL be released in `@widgentic/webmcp` alone, and `@widgentic/designer` SHALL need no release for it

#### Scenario: The .NET host's bundle needs go through mcp
- **WHEN** a `dotnet-host` requirement needs behavior the host bundle does not have
- **THEN** that behavior SHALL be specified in `mcp-server`, released in `@widgentic/mcp`, and adopted by bumping the NuGet package's pin — never implemented in C# as a private copy

#### Scenario: An authorization requirement ships in mcp
- **WHEN** an `mcp-authorization` requirement changes
- **THEN** the change SHALL be released in `@widgentic/mcp`, and no other package SHALL need a release for it
