## 1. App format (src, SDK-free)

- [x] 1.1 Add `WIDGENTIC_UI_URI_PREFIX` constant; extend the format union with `"app"` in `handleRenderWidget` and compose the three-block app result (text fallback naming the widget, `text/html` `ui://widgentic/page/<kind>` resource via `composePage`, widgentic payload block)
- [x] 1.2 Update `RENDER_WIDGET_TOOL` format enum + description ("Apps hosts use the html resource; native hosts the payload block") and the zod mirrors (example server + interop test)

## 2. Apps declaration (wiring layer)

- [x] 2.1 Inspect the installed SDK for the Apps surface (resource registration, tool `_meta` UI linkage, mime flavor); record findings as comments in `examples/mcp-server/main.ts`
- [x] 2.2 Wire the declaration best-effort: register the page resource + tool `_meta` per the verified API, with graceful degradation (stderr note) when unsupported

## 3. Tests

- [x] 3.1 Handler tests: app content shape (three blocks, order, extractable payload), themed + styled document in the resource, script-free/reference-free page, deterministic URI across renders, `format: "app"` accepted by the input guard
- [x] 3.2 SDK interop: `format: "app"` round trip through the in-memory transport (blocks survive, html resource parses as the page)
- [x] 3.3 Live stdio check via the python driver: real server returns the app composition

## 3b. Formal ext-apps adoption (post-review revision)

- [x] 3.4 Pin `@modelcontextprotocol/ext-apps` (exact); update embedded block + preview resource to `text/html;profile=mcp-app` (`WIDGENTIC_APP_MIME_TYPE` exported)
- [x] 3.5 Add `structuredContent: { html, css, payload }` to every successful `render_widget` result (SDK-free, in handlers)
- [x] 3.6 Author the app template with the hand-rolled inline bridge (initialize handshake, initialized, ping responder, tool-result → render structuredContent, size-changed); no external references
- [x] 3.7 Rewire `main.ts`: `registerAppTool` for `render_widget` (`_meta.ui.resourceUri`), `registerAppResource` for the template, `getUiCapability` detection note on stderr
- [x] 3.8 Update tests (mime profile, structuredContent, `_meta.ui` over the protocol) and the live driver (Apps capability in initialize, template read, structuredContent assertions)

## 3c. Plugin guideline review (mcp-apps skill)

- [x] 3.9 Template compliance per official guidance: host context integration (theme/`data-theme`, host style variables → `--wg-*` token bridge, safe-area insets), `tool-input` placeholder, teardown responder, ResizeObserver-driven size notifications
- [x] 3.10 Local Apps acceptance path: `@types/node` + `mcp:http` entry (stateless Streamable HTTP, permissive CORS for local testing) + official `basic-host` example running against it

## 4. Documentation and acceptance

- [x] 4.1 README: "Inline widgets in Apps-capable hosts" section (Claude Desktop registration, what to expect) alongside the existing non-aware-host workflows
- [ ] 4.2 Manual acceptance gate: connect Claude Desktop (or another Apps-capable host) to the server, run a `format: "app"` render, and confirm inline display — record the outcome in the change before archiving
  - Evidence so far (2026-07-29): Claude Code 2.1.220 (VS Code extension, non-Apps host) ran all five kinds with `format: "app"` + dark preset — three-block composition arrived intact, dark tokens serialized in every document, HTML displayed as text (expected graceful degradation). Incidental finding fixed: demo invoice emitted an empty `<h2>` when `meta.title` was absent; heading now gated by a `when: "$meta.title"` node. Awaiting an Apps-capable host run for inline confirmation.

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Regenerate the briefing scenario with `format: "app"` through the live server and confirm every block validates
