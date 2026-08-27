# mcp-server — package-split-readiness delta

## MODIFIED Requirements

### Requirement: Runnable server and SDK interoperability
The repository SHALL provide `examples/mcp-server/main.ts` wiring the library's server assembly onto stdio with that example's compiled-in custom widgets registered (the invoice template among them) — a self-contained demonstration of hosting widgentic with your own widgets, importing only public `@widgentic/*` entries — started by `npm run mcp` using devDependencies only. The test suite SHALL verify via the SDK's in-memory transport that `list_widgets` and `render_widget` round-trip through the real protocol against the library assembly, including the `isError` path for an unknown widget.

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

### Requirement: Server assembly is a library export
The package SHALL export `createWidgenticServer(options?: { catalog?, themes? })` from the `@widgentic/mcp/sdk` entry, producing a connectable official-SDK `McpServer` with the full wiring: the tools, the formal Apps declaration, the app-template resource, capability-aware slimming, and image inlining. Its MCP SDK packages SHALL be optional peer dependencies — installed only by hosts importing this entry — and the base `@widgentic/mcp` entry SHALL remain importable without any SDK present. With no options the assembly SHALL serve exactly the built-in kinds and built-in themes; compiled-in extras are the host's explicit choice via `catalog`.

#### Scenario: One assembly serves every transport
- **WHEN** the HTTP entry, the stdio example, and the in-memory interop tests construct their servers
- **THEN** each SHALL use the library's `createWidgenticServer`, differing only in the catalog/themes they pass and the transport they connect

#### Scenario: The default is the built-ins
- **WHEN** `createWidgenticServer()` is constructed with no options and `list_widgets` is called
- **THEN** the descriptor list SHALL contain exactly the built-in kinds

#### Scenario: The base entry stays SDK-free
- **WHEN** the modules reachable from the `@widgentic/mcp` entry are inspected
- **THEN** none SHALL import from an MCP SDK package — the SDK surface exists only behind `@widgentic/mcp/sdk`

### Requirement: Formal Apps declaration at the wiring layer
The server assembly SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"`. When the assembly is given `resourceDomains` (a list of hostnames the operator trusts the frame to load assets from), the app resource SHALL declare them as `_meta.ui.csp.resourceDomains` (the Apps CSP block) and the same list SHALL govern the inliner's declared-domain skip; with none given, nothing is declared and every external image faces inlining. The list is deployment configuration — stored widgets and render inputs SHALL have no way to extend it. The assembly SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. SDK and host-flavor specifics SHALL live only behind the `@widgentic/mcp/sdk` entry; the base `@widgentic/mcp` entry remains SDK-free (per the server-assembly requirement).

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

#### Scenario: Declared domains reach the resource metadata
- **WHEN** the assembly is created with `resourceDomains: ["cdn.example.com"]` and an SDK client reads the app resource
- **THEN** the resource SHALL carry `_meta.ui.csp.resourceDomains: ["cdn.example.com"]`
- **AND** with no domains configured the key SHALL be absent
