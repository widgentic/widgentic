## 1. Dependencies and scaffolding

- [x] 1.1 Install devDependencies (`@modelcontextprotocol/sdk`, `tsx`; `zod` only if the installed SDK's tool registration requires it) and verify the SDK's actual API surface (registerTool, InMemoryTransport, stdio transports)
- [x] 1.2 Create `src/mcp-server/` with `index.ts`, `definitions.ts` (tool data), `handlers.ts`; add `./mcp-server` to `package.json` `exports` and the `mcp` script

## 2. Catalog metadata (modified capability)

- [x] 2.1 Add `WidgetDescriptor` type; extend `register(kind, renderer, descriptor?)` to store descriptors (kind filled in, minimal descriptor generated when omitted)
- [x] 2.2 Implement `describe(kind)` and `list()` (fresh array) on `WidgetCatalog`
- [x] 2.3 Write honest descriptors with `dataExample` for the four built-ins
- [x] 2.4 Extend `registerTemplate(catalog, kind, template, descriptor?)` to pass the descriptor through

## 3. MCP server logic

- [x] 3.1 Implement `definitions.ts`: `LIST_WIDGETS_TOOL` and `RENDER_WIDGET_TOOL` as plain data with JSON-Schema input schemas (`render_widget` requires `widget` + `data`)
- [x] 3.2 Implement `handleListWidgets(catalog)`: descriptor list as JSON text result
- [x] 3.3 Implement `handleRenderWidget(catalog, input)`: input-shape checks → payload assembly → `catalog.render` → dual-format success result (HTML text block + widgentic resource block); `isError` results with contract-vocabulary JSON errors; total over garbage input

## 3b. Data marshalling fix (from live testing)

- [x] 3.4 Type `data` in `RENDER_WIDGET_TOOL.inputSchema` (`type: ["array","object","string","number","boolean","null"]`) and mirror it as a zod union in the SDK wiring
- [x] 3.5 Coerce string-encoded JSON objects/arrays in `handleRenderWidget` before payload assembly; leave non-structured strings literal

## 4. Runnable server

- [x] 4.1 Implement `examples/mcp-server/main.ts`: SDK `McpServer` over stdio, invoice template + descriptor registered, definitions/handlers wired onto `registerTool`

## 5. Tests

- [x] 5.1 Catalog metadata tests: built-in descriptors present and honest (each `dataExample` renders ok), minimal descriptor generation, `list()` freshness, descriptor storage via `register`/`registerTemplate`
- [x] 5.2 Handler tests (pure, no SDK): listing reflects catalog incl. template kind; render success dual-format (HTML + extractable payload, hints/meta passthrough); error contract (`UNKNOWN_KIND`, `MISSING_FIELD` with path, garbage totality)
- [x] 5.3 SDK interop tests (`InMemoryTransport` linked pair): `list_widgets` and `render_widget` round trips, `isError` path for unknown widget
- [x] 5.4 Type tests: `WidgetDescriptor`, extended `WidgetCatalog`, handler signatures, tool definition types
- [x] 5.5 Marshalling tests: string-encoded array renders identically to the array (regression for the live-testing report), literal/non-JSON strings unchanged, SDK interop test sending `data` as a JSON string

## 6. Verification

- [x] 6.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 6.2 Smoke-run the stdio server locally (`npm run mcp` responds to an initialize/list_tools exchange or the host-side driver) and confirm `widgentic/mcp-server` resolves via package exports
