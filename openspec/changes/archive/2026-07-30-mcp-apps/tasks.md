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
- [x] 3.11 Template error state: tool-result without structuredContent (isError) replaces the placeholder with the error message (found live in basic-host — stale "Rendering…" on UNKNOWN_KIND)

## 4. Documentation and acceptance

- [x] 4.1 README: "Inline widgets in Apps-capable hosts" section (Claude Desktop registration, what to expect) alongside the existing non-aware-host workflows
- [x] 4.2 Manual acceptance gate: confirm inline display in an Apps-capable host — CLOSED with visual verification in the official `basic-host` (ext-apps v1.7.5 reference host)
  - Evidence (2026-07-29): Claude Code 2.1.220 (non-Apps host) — three-block composition intact, HTML as text (expected graceful degradation). Incidental fix: invoice `<h2>` gated by `when: "$meta.title"`.
  - Evidence (2026-07-31): full 7-input sweep in `basic-host` (served via Caddy over Tailscale; sandbox URL + referrer allowlist patched in the example host — same-machine assumptions, not widgentic issues). All five kinds mounted inline in the sandboxed iframe via the declared template + `structuredContent`: card (dark theme, server-side `fieldFormat`: `$9.99`, `2.56 / 5`), table (`columns` hint order/selection), tree (`expandDepth: 1` visually collapsed via `data-expanded` CSS, zero JS), invoice (template kind: `$meta` heading, `each` lines, registered `.wg-invoice` styles via `structuredContent.css`, `when`-gated consistent total), custom (raw JSON). No-theme render adopted the host's look via the host-variable→`--wg-*` bridge and re-themed LIVE on the host's theme switcher (`host-context-changed` path verified). Error sweep found one template bug — stale "Rendering…" placeholder on `isError` results (no `structuredContent`) — fixed (task 3.11) and re-verified: error notice renders with the structured message. Wire error contract confirmed in-host (`UNKNOWN_KIND`, `path: "widget"`, available kinds listed).
  - Evidence (2026-07-31): VS Code Copilot Chat (production Apps host #2, HTTP transport over Tailscale) — agent-driven end-to-end with the only steer being "Use widgentic, render it all in dark mode": all five kinds mounted inline via the declared template. Agent discovered kinds and the dark preset unprompted (`list_widgets` + `list_theme_tokens`), mapped all five data shapes correctly, generalized `fieldFormat` beyond documented examples (`"{value} / 5 ★"`, `"{value} in stock"`), and computed a consistent-basis invoice total from line totals — descriptor guidance steering a third independent agent cold. Acceptance gate satisfied on two independent Apps hosts.

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Regenerate the briefing scenario with `format: "app"` through the live server and confirm every block validates
