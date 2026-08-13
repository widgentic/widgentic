# mcp-server — the server moves to apps/, the template joins the library

## MODIFIED Requirements

### Requirement: Runnable server and SDK interoperability
The repository SHALL provide `apps/mcp-server/main.ts` wiring the definitions and handlers onto an official-SDK MCP server over stdio (with the invoice template registered), started by `npm run mcp` using devDependencies only. The test suite SHALL verify via the SDK's in-memory transport that `list_widgets` and `render_widget` round-trip through the real protocol, including the `isError` path for an unknown widget.

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
- **THEN** the SDK and tsx SHALL appear only under `devDependencies` and no `dependencies` section SHALL exist

## ADDED Requirements

### Requirement: App template builder is a library export
The `./mcp-server` entry SHALL export `buildAppTemplate(): string`, producing the app template document (`ui://widgentic/app.html`) described by the app template loader requirement. The builder SHALL depend only on other widgentic public entries — no MCP SDK, no deployment code — so any host can serve the loader without copying files out of a deployment.

#### Scenario: The export produces the served template
- **WHEN** `buildAppTemplate()` is called and an SDK client reads `ui://widgentic/app.html` from the runnable server
- **THEN** the resource contents SHALL equal the builder's output

#### Scenario: The builder stays dependency-free
- **WHEN** the module providing `buildAppTemplate` is inspected
- **THEN** it SHALL import only from widgentic public entries and SHALL NOT import from an MCP SDK or from `apps/`
