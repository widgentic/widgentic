## Why

Agents currently need a widgentic-aware host to see widgets; the emit/extract convention only pays off once such hosts exist. A **Widgentic MCP server** inverts that: any MCP client can discover the available widgets and ask widgentic to validate and render for it — making widgentic immediately usable from any agent today, and giving agents the metadata they need to *choose* a widget. This also supersedes the planned demo change: the server is the demo, but as a real product surface.

## What Changes

- **Widget metadata in the catalog** (modifies `widget-catalog`):
  - `WidgetDescriptor`: `{ kind, description, dataShape, dataExample?, hints? }` — agent-facing documentation of purpose, expected `data` input, and supported hints.
  - `register(kind, renderer, descriptor?)` (backward-compatible optional third argument); built-ins ship descriptors; `registerTemplate` gains the same optional descriptor.
  - `catalog.describe(kind)` and `catalog.list()` (fresh array of descriptors) so tooling can reflect over a catalog.
- **MCP server logic** (new capability `mcp-server`, in `src/mcp-server/`, exported as `./mcp-server`, zero dependencies):
  - Tool definitions as plain data (`name`, `description`, JSON-Schema input schemas) for two tools:
    - `list_widgets` — no input; returns the catalog's descriptors as structured JSON so agents can pick a widget and shape their data.
    - `render_widget` — input `{ widget, data, hints?, meta? }`; validates the widget id against the catalog, assembles and contract-validates the payload, renders, and returns the result.
  - Pure handlers (`handleListWidgets(catalog)`, `handleRenderWidget(catalog, input)`) returning MCP-shaped tool results:
    - success: rendered HTML as a text block **plus** the widgentic resource block (widgentic-aware hosts can still mount/patch natively — graceful degradation both directions),
    - failure: `isError: true` with the structured error (`UNKNOWN_KIND`, `MISSING_FIELD`, `INVALID_TYPE`, ...) as JSON, so agents can correct their input.
  - Handlers never throw on input — total, like every other data path in the codebase.
- **Runnable server**: `examples/mcp-server/main.ts` wires the handlers onto an official-SDK `McpServer` over stdio (invoice template registered as the custom-widget showcase); `npm run mcp` starts it via `tsx`.
- **Local testing**: SDK `InMemoryTransport` interop tests — list/render round trips through the real protocol, error results for unknown widgets and invalid data — plus pure handler and catalog-metadata unit tests.
- New devDependencies only: `@modelcontextprotocol/sdk`, `tsx` (and `zod` if the SDK's tool registration requires it). **Runtime dependencies stay zero** — the SDK touches only `examples/`.

## Capabilities

### New Capabilities
- `mcp-server`: The Widgentic MCP server surface — tool definitions as data, `list_widgets`/`render_widget` handler behavior, validation and error contract, dual-format render results, and SDK interoperability.

### Modified Capabilities
- `widget-catalog`: registration accepts an optional `WidgetDescriptor`; new metadata requirements (`describe`, `list`, built-in descriptors). Existing rendering behavior is unchanged.

## Impact

- New code: `src/mcp-server/` (+ `__tests__/`), `examples/mcp-server/main.ts`; catalog gains descriptor support in `src/catalog/registry.ts` (+ built-in descriptors).
- `package.json`: `./mcp-server` entry, `mcp` script, devDependencies.
- Templates: `registerTemplate` signature gains an optional descriptor parameter (backward-compatible).
- Downstream: any MCP client can render widgets today; the widget designer later publishes templates + descriptors to the same catalog; `list_widgets` metadata is the seed of agent-facing widget documentation.
