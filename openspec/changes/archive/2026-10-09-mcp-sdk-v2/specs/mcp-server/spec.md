## MODIFIED Requirements

### Requirement: Capability-aware default output
`handleRenderWidget` SHALL accept `options.slim: boolean` (default false). In slim mode, the default-format result's `content` SHALL be a one-line text block — naming the rendered kind, stating that the visual is already displayed to the user, and instructing that the data not be restated as text — followed by the widgentic payload block; the full-HTML text block SHALL be omitted. Explicit `format` values (`html`, `widget`, `page`, `app`) SHALL keep their exact non-slim contracts regardless of `options.slim`, and `structuredContent` SHALL be identical between slim and full modes. The server assembly SHALL resolve the slim signal per call. It checks three sources in order:
1. The UI capability the session negotiated at `initialize`, when the connection ran one (either direction).
2. Otherwise, the capabilities the request carries in `_meta["io.modelcontextprotocol/clientCapabilities"]`, as every protocol revision 2026-07-28 request does (either direction).
3. Otherwise, the `WIDGENTIC_ASSUME_UI` environment default (`1`/`true` enables).

A call that reveals none of these gets full output. A client "has the UI capability" when its capabilities advertise the MCP Apps extension with the app MIME type, `text/html;profile=mcp-app`.

#### Scenario: Slim default output for Apps hosts
- **WHEN** `handleRenderWidget(catalog, { widget: "card", data: { a: 1 } }, { slim: true })` runs
- **THEN** the content SHALL be exactly one short text block (naming `card`, and stating the data must not be restated) plus the widgentic payload block
- **AND** no content block SHALL contain the rendered HTML
- **AND** `structuredContent` SHALL deep-equal the non-slim render's `structuredContent`

#### Scenario: Explicit formats are never slimmed
- **WHEN** the same call adds `format: "html"` (or `page`, `app`, `widget`)
- **THEN** the output SHALL match the existing format contract exactly, `options.slim` notwithstanding

#### Scenario: Default resolution preserves current behavior
- **WHEN** no UI capability was negotiated and `WIDGENTIC_ASSUME_UI` is unset
- **THEN** the served default-format output SHALL carry the full-HTML text block as today

#### Scenario: A 2026-07-28 request's own capabilities decide
- **WHEN** a client on protocol revision 2026-07-28 that advertises the UI capability calls `render_widget` with default format through the HTTP serving entry, with `WIDGENTIC_ASSUME_UI` unset
- **THEN** the result SHALL be the slim output
- **AND** the same call from a 2026-07-28 client without the UI capability SHALL return the full output even with `WIDGENTIC_ASSUME_UI=1`

#### Scenario: Requests revealing no capabilities follow WIDGENTIC_ASSUME_UI
- **WHEN** a 2025-era request reaches a server instance that never saw `initialize` (stateless HTTP), with `WIDGENTIC_ASSUME_UI=1`
- **THEN** `render_widget` with default format SHALL return the slim output

### Requirement: Server assembly is a library export
The package SHALL export `createWidgenticServer(options?: { catalog?, themes? })` from the `@widgentic/mcp/sdk` entry, producing a connectable `McpServer` from the official MCP TypeScript SDK 2.x (`@modelcontextprotocol/server`) with the full wiring: the tools, the formal Apps declaration, the app-template resource, capability-aware slimming, and image inlining. The same assembly SHALL serve both protocol eras: the 2025-era revisions, and revision 2026-07-28. It does so through the SDK's serving entries (`createMcpHandler` over HTTP, `serveStdio` over stdio) and through a directly connected transport. Its MCP SDK packages SHALL be optional peer dependencies — installed only by hosts importing this entry — and the base `@widgentic/mcp` entry SHALL remain importable without any SDK present. No workspace source SHALL import the superseded 1.x SDK package `@modelcontextprotocol/sdk`. With no options the assembly SHALL serve exactly the built-in kinds and built-in themes; compiled-in extras are the host's explicit choice via `catalog`.

#### Scenario: One assembly serves every transport
- **WHEN** the HTTP entry, the stdio example, and the in-memory interop tests construct their servers
- **THEN** each SHALL use the library's `createWidgenticServer`, differing only in the catalog/themes they pass and the transport they connect

#### Scenario: The default is the built-ins
- **WHEN** `createWidgenticServer()` is constructed with no options and `list_widgets` is called
- **THEN** the descriptor list SHALL contain exactly the built-in kinds

#### Scenario: The base entry stays SDK-free
- **WHEN** the modules reachable from the `@widgentic/mcp` entry are inspected
- **THEN** none SHALL import from an MCP SDK package — the SDK surface exists only behind `@widgentic/mcp/sdk`

#### Scenario: Both protocol eras through one assembly
- **WHEN** a 2026-07-28 client reaches `createWidgenticServer()` through `createMcpHandler`, and a 2025-era client reaches it through the in-memory transport
- **THEN** both SHALL list the same tools and receive the same `structuredContent` from `render_widget` for the same arguments

#### Scenario: The 1.x SDK is never imported
- **WHEN** the workspace's TypeScript sources are scanned
- **THEN** none SHALL import from `@modelcontextprotocol/sdk`, and the boundary check SHALL fail naming any file that does

### Requirement: Runnable server and SDK interoperability
The repository SHALL provide `examples/mcp-server/main.ts` serving the library's server assembly over stdio through the SDK's `serveStdio` entry (both protocol eras) with that example's compiled-in custom widgets registered (the invoice template among them) — a self-contained demonstration of hosting widgentic with your own widgets, importing only public `@widgentic/*` entries — started by `npm run mcp` using devDependencies only. The test suite SHALL verify via the SDK's in-memory transport that `list_widgets` and `render_widget` round-trip through the real protocol against the library assembly, including the `isError` path for an unknown widget.

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
- **WHEN** the `@widgentic/mcp` manifest is inspected
- **THEN** the MCP SDK packages SHALL appear only as optional `peerDependencies` (for the `./sdk` entry), `@widgentic/core` as its sole `dependencies` entry, and tsx only under the workspace's `devDependencies`
