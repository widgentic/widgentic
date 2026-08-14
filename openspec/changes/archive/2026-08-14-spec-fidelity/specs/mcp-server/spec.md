# mcp-server — retire the split's leftover wording

## MODIFIED Requirements

### Requirement: Formal Apps declaration at the wiring layer
The server assembly SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"`. The assembly SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. SDK and host-flavor specifics SHALL live only behind the `widgentic/mcp-server/sdk` entry; the base `widgentic/mcp-server` entry remains SDK-free (per the server-assembly requirement).

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

### Requirement: Per-request principal resolution
When a store is configured, the runnable server SHALL resolve the caller's principal from the presented API key **before** constructing the request's server, and SHALL serve that principal's composed catalog and theme registry for the whole request. `createWidgenticServer(options?)` SHALL accept the composed `catalog` and `themes` rather than building its own, so the composition (and therefore the trust decision) happens at the transport edge where the key is read. A key that resolves to no principal SHALL fall back to the anonymous catalog — built-ins plus any entries the deployment supplies — never an error, and the server SHALL note the unresolved-key event on stderr **without** logging the key. With no store configured, the server SHALL serve the assembly's catalog to every caller — the library default (built-ins only) unless the host passes its own composed catalog, as the compiled-in example deployment does.

#### Scenario: Two keys see two catalogs
- **WHEN** a request presents principal A's key and another presents principal B's key
- **THEN** `list_widgets` SHALL return A's kinds for the first and B's for the second
- **AND** neither listing SHALL contain the other's kinds
- **AND** both SHALL contain every built-in kind

#### Scenario: A principal's widget renders only for that principal
- **WHEN** principal A owns kind `report` and principal B calls `render_widget` with `widget: "report"`
- **THEN** B's result SHALL be `isError: true` with `code: "UNKNOWN_KIND"` and `report` absent from the available-kinds list

#### Scenario: Themes are resolved per principal too
- **WHEN** principal A owns a `brand` theme
- **THEN** `list_themes` SHALL include it for A and omit it for B
- **AND** `render_widget` with `theme: "brand"` SHALL resolve for A and return `UNKNOWN_THEME` for B

#### Scenario: Unknown keys degrade to anonymous, not to failure
- **WHEN** a request presents a key no principal owns
- **THEN** the tools SHALL still work over the anonymous catalog
- **AND** the key SHALL NOT appear in any log line

#### Scenario: No store configured preserves today's behavior
- **WHEN** the server runs without a store
- **THEN** every caller SHALL see the same catalog: the built-ins, plus exactly the extras the host compiled into the catalog it passed (none, in the hosted deployment; the example's own widgets, in the stdio example)
