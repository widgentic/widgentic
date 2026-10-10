## MODIFIED Requirements

### Requirement: Dependencies are declared honestly
`@widgentic/core` SHALL declare no runtime dependencies. `@widgentic/designer` and `@widgentic/mcp` SHALL declare `@widgentic/core` as a dependency with a compatible range. `@widgentic/webmcp` SHALL declare `@widgentic/core` and `@widgentic/designer` as dependencies with compatible ranges and nothing else. `@widgentic/mcp` SHALL declare the MCP TypeScript SDK 2.x server package (`@modelcontextprotocol/server`), `@modelcontextprotocol/ext-apps` 2.x and `zod` 4.2 or later as optional peer dependencies — needed only by hosts importing the `./sdk` entry, and never the superseded `@modelcontextprotocol/sdk` — and the Azure client packages as optional peer dependencies needed only by the Cosmos and Key Vault subpaths. The URL implementation inlined into the `./host` artifact SHALL be an exact-pinned devDependency of `@widgentic/mcp`, never a runtime or peer dependency. `Widgentic.Mcp` SHALL declare exactly `ModelContextProtocol`, `ModelContextProtocol.Extensions.Apps` and the ClearScript V8 packages as dependencies. The root entry of every package SHALL be importable with only its declared non-optional dependencies installed.

#### Scenario: Core carries nothing
- **WHEN** the `@widgentic/core` manifest is inspected
- **THEN** it SHALL have no `dependencies` and no `peerDependencies`

#### Scenario: The SDK is a host's choice
- **WHEN** a host imports `@widgentic/mcp` with no `@modelcontextprotocol/*` package installed
- **THEN** the import SHALL succeed, and only importing `@widgentic/mcp/sdk` SHALL require the SDK
- **AND** the manifest's optional peers SHALL be `@modelcontextprotocol/server` `^2.3.0`, `@modelcontextprotocol/ext-apps` `^2` and `zod` `^4.2.0`, with no `@modelcontextprotocol/sdk` entry

#### Scenario: Webmcp carries exactly two
- **WHEN** the `@widgentic/webmcp` manifest is inspected
- **THEN** its `dependencies` SHALL be exactly `@widgentic/core` and `@widgentic/designer`, and it SHALL have no `peerDependencies`

#### Scenario: The bundled URL implementation is build-time only
- **WHEN** the `@widgentic/mcp` manifest is inspected
- **THEN** the URL implementation SHALL appear only under `devDependencies`, with an exact version

#### Scenario: The NuGet package carries exactly its declared dependencies
- **WHEN** the `Widgentic.Mcp` nuspec is inspected
- **THEN** its `net10.0` dependency group SHALL list exactly `ModelContextProtocol`, `ModelContextProtocol.Extensions.Apps` and the ClearScript V8 packages
