# mcp-server — the assembly joins the library, the stdio server becomes the example

## MODIFIED Requirements

### Requirement: Runnable server and SDK interoperability
The repository SHALL provide `examples/mcp-server/main.ts` wiring the library's server assembly onto stdio with that example's compiled-in custom widgets registered (the invoice template among them) — a self-contained demonstration of hosting widgentic with your own widgets, importing only public `widgentic/*` entries — started by `npm run mcp` using devDependencies only. The test suite SHALL verify via the SDK's in-memory transport that `list_widgets` and `render_widget` round-trip through the real protocol against the library assembly, including the `isError` path for an unknown widget.

#### Scenario: Protocol round trip
- **WHEN** an in-memory SDK client calls `render_widget` with `{ widget: "card", data: { title: "T" } }`
- **THEN** the delivered result SHALL contain HTML with `class="wg-card"` and an extractable widgentic payload

#### Scenario: Discovery through the protocol
- **WHEN** an in-memory SDK client calls `list_widgets`
- **THEN** the delivered result SHALL parse to the catalog's descriptor list

#### Scenario: Error result through the protocol
- **WHEN** an in-memory SDK client calls `render_widget` with an unknown widget id
- **THEN** the delivered result SHALL have `isError: true` with the `UNKNOWN_KIND` JSON error

#### Scenario: Dependencies stay dev-only
- **WHEN** `package.json` is inspected after this change
- **THEN** the SDK and tsx SHALL appear only under `devDependencies` — the SDK packages additionally as **optional** `peerDependencies` for the assembly entry — and no `dependencies` section SHALL exist

## ADDED Requirements

### Requirement: Server assembly is a library export
The package SHALL export `createWidgenticServer(options?: { catalog?, themes? })` from a `widgentic/mcp-server/sdk` entry, producing a connectable official-SDK `McpServer` with the full wiring: the tools, the formal Apps declaration, the app-template resource, capability-aware slimming, and image inlining. Its MCP SDK packages SHALL be optional peer dependencies — installed only by hosts importing this entry — and the base `widgentic/mcp-server` entry SHALL remain importable without any SDK present. With no options the assembly SHALL serve exactly the built-in kinds and built-in themes; compiled-in extras are the host's explicit choice via `catalog`.

#### Scenario: One assembly serves every transport
- **WHEN** the HTTP entry, the stdio example, and the in-memory interop tests construct their servers
- **THEN** each SHALL use the library's `createWidgenticServer`, differing only in the catalog/themes they pass and the transport they connect

#### Scenario: The default is the built-ins
- **WHEN** `createWidgenticServer()` is constructed with no options and `list_widgets` is called
- **THEN** the descriptor list SHALL contain exactly the built-in kinds

#### Scenario: The base entry stays SDK-free
- **WHEN** the modules reachable from the `widgentic/mcp-server` entry are inspected
- **THEN** none SHALL import from an MCP SDK package — the SDK surface exists only behind `widgentic/mcp-server/sdk`
