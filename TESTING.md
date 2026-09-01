# Widgentic — testing & operations runbook

Package-level testing for the public monorepo: the runnable entries, the
protocol smokes worth running against any server built on `@widgentic/mcp`,
and host registration snippets for the sample server. Nothing here is about
our deployments — those live in the private `widgentic/apps` repository.

## Layout: what lives here and what moved

This repository is the public monorepo: `packages/core`, `packages/designer`,
`packages/mcp` and the sample hosts under `examples/*`. Our own hosts — the
production MCP server, the widgentic.dev app, the Azure infrastructure and the
deployment runbook with its verification log — live in the private repository
`widgentic/apps` (`RUNBOOK.md` there). This file covers package testing: the
suites under `packages/*/src/**/__tests__`, the boundary and export-snapshot
checks under `tools/` and `npm run pack:check`. The basic-host inline check and
the per-principal store rig start our HTTP server entry, so they moved to the
runbook as well; `examples/mcp-server` (stdio) and `examples/designer` are the
runnable hosts here.

## Entries

| Command | Transport | Use for |
|--|--|--|
| `npm run mcp` | stdio | Claude Desktop, Claude Code, any stdio client |
| `npm run designer` | HTTP on `:8082` | The designers in a demo host (widget + theme + action tabs); `/standalone.html` uses the published browser bundle |

Quick checks without any host:

```bash
npx @modelcontextprotocol/inspector npx tsx examples/mcp-server/main.ts   # interactive UI
npm test                                                                  # incl. SDK interop suite
npm run build                                                             # packaging + declarations
```

Two protocol-level smokes worth running against any server built on
`@widgentic/mcp` (set `URL` to yours), because neither shows up in a normal
render check:

```bash
# 1. The authoring guide is DERIVED from the live validators, so this is
#    the cheapest proof a deploy carries the current rules.
curl -s -X POST "$URL/mcp" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_authoring_guide","arguments":{}}}'

# 2. render_widget's FIELD DESCRIPTIONS must survive onto the wire. They
#    are built from definitions.ts at registration; when that wiring broke,
#    agents saw a bare anyOf for `theme` and no test noticed — only
#    tools/list shows it.
curl -s -X POST "$URL/mcp" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' |
  grep -o 'pass the NAME'   # non-empty = the steering is live
```

The listing carries EIGHT tools: `list_widgets`, `list_schemas`,
`list_actions`, `list_themes`, `list_theme_tokens`, `get_authoring_guide`,
`render_widget` and `execute_action` (app-only — the SDK lists it; Apps
hosts hide it from the model).

```sh
# 3. list_actions serves the CONTRACT, never the transport. Against a key
#    whose principal owns an http action: FIRST the positive (the action is
#    named — an unwired sharedActions source lists [] and would pass any
#    absence check vacuously), THEN the absence of that action's OWN
#    transport values (its hostname, a fixed header/query value — schema
#    keywords like "$schema": "https://…" are legitimate content, so a
#    blanket https:// grep can false-positive).
curl -s -X POST "$URL/mcp" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -H "x-api-key: $KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_actions","arguments":{}}}' \
  > /tmp/actions.json
grep -c '"<the action name>"' /tmp/actions.json      # 1+ = the source is wired
grep -c '<the action's hostname>' /tmp/actions.json  # 0 = the transport stayed on the server
```

## Designer chrome: computed-value check

The designers' chrome is painted through the 28 `--wgd-*` tokens
(`CHROME_TOKENS`); unit tests pin the token blocks, gate the palettes for
contrast and audit the stylesheet structurally, but only a browser cascades
`var()`. `tools/probe-computed.mjs` loads a URL in headless Chrome over the
DevTools Protocol (no dependency — Node's `fetch` + `WebSocket`) and prints the
JSON result of an expression:

```bash
npm run designer &                     # the demo host on :8082 — its "Host chrome" button hands the designers a chrome map
node tools/probe-computed.mjs http://localhost:8082/ probe.js
```

with `probe.js` reading `getComputedStyle()` of `.wgd-root`, an input, a
`.wgd-node .wgd-tag`, `.wgd-section`, `.wgd-chevron` and the JSON pane's
`.wgd-hl-k` before and after `document.getElementById("chrome-toggle").click()`.

**Since `@widgentic/designer` 0.3.0 the built-in defaults are the widgentic
palette** — a regression report that says "the designers changed colour" is
expected behaviour, not a bug. Without `chrome`, expect on the root
`--wgd-bg: #f6fafc`, `--wgd-panel: #ffffff`, `--wgd-border: #6e95a6`,
`--wgd-accent: #1e6f92`, `--wgd-text: #0b1b26`, `system-ui, sans-serif` at
13px, a 16px gap and 6px radii on inputs and buttons — and the demo page's own
`body` background computing to the same `rgb(246, 250, 252)` as the root,
because the page paints itself from `chromeCss(CHROME_DEFAULTS, { prefix:
"--host" })` rather than a copied palette. Verified 2026-08-30 on this rig.

The toggle switches the page to Dracula (`html[data-host-chrome="dracula"]`,
written out in `index.html` — the package ships one default and no second
palette) and passes a map covering all 28 tokens (colours as `var(--host-*)`,
typefaces with fallback stacks, sizes one step up), so afterwards page and
designers match again in that look — `--wgd-bg: #282a36`, `--wgd-border:
#6272a4`, `--wgd-accent: #bd93f9`, monospace at 14px, 4px radii — in BOTH
schemes, because Dracula is a dark theme, while the preview's widget colours
(`--wg-*`) stay put. Seven pairs in that mapping measure below the thresholds
the built-in palette is gated on; that is the theme's own trade and the demo
says so.

## Self-host example: compose smoke (`examples/docker`)

The unit gate covers the SQLite adapter (the store contract plus restart,
two-connection and whole-or-nothing cases), the authoring surface (the ported
546-line suite) and the example's identity rules; CI builds the image. What
only a running stack proves — two containers over one volume — is this smoke:

```sh
cd examples/docker
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > kek.txt && chmod 600 kek.txt
docker compose up --build -d
```

1. Open http://localhost:8080/ — save a widget under a custom kind; under
   Keys mint one (shown once). Exercise one refusal: save a schema, reference
   it from a widget, delete the schema → `SCHEMA_IN_USE` naming the widget.
2. `curl -s -X POST http://localhost:8081/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "x-api-key: <key>" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_widgets","arguments":{}}}'`
   → the widget is in the response, with no restart of either service. The
   same call WITHOUT the key lists only built-ins.
3. `docker compose down && docker compose up -d` → everything still resolves
   (the volume owns the state).
4. Restart the stack with a different `kek.txt` → widgets still serve;
   resolving a stored secret fails with a structured error, records intact.

Verified 2026-08-31 on this rig, containerized end to end (the published
`@widgentic/mcp` predates `./authoring`, so the smoke image installed the
packed local tarball — the documented pre-release path): both services
healthy over one volume; save-in-app → visible on `/mcp` next call with no
restart; anonymous degrades to built-ins; `SCHEMA_IN_USE` names the widget;
a pasted API key gets `401 KEY_NOT_A_SESSION`; secrets list carries no
value; both containers recreated → key, widget and secret record all
resolve; a wrong KEK refuses resolution with `DECRYPTION_FAILED` and leaves
the record intact (also pinned as a unit test).

## Documentation site (`docs/`)

The Mintlify site at `docs.widgentic.dev` builds from `docs/` on `main`
(Mintlify GitHub App, "docs are in a subdirectory" → `/docs`). The Reference
tab is generated, never hand-edited:

```bash
npm run docs:generate     # tools/docs-generate.ts → docs/reference/**  (22 pages, deterministic)
npm run docs:dev          # local preview (mint dev in docs/)
npm run docs:check        # CI gate: generate --check, navigation test, mint validate,
                          #          mint broken-links --check-anchors, mint a11y
```

`docs:generate --check` fails when a committed page differs from a fresh
generation (or a stale page lingers); `tools/docs-nav.test.ts` fails when a
page is missing from `docs.json` navigation (or a navigation entry has no
page) — `mint validate` does not flag orphans. `mint` downloads its client
binary from `releases.mintlify.com` on first run.

Operator steps (generic; the live values live in the apps runbook): connect
the repository in the Mintlify dashboard (Git settings → subdirectory
`/docs`, GitHub App with access to this repository only); add the custom
domain, create its two verification TXT records (`_acme-challenge.<host>`,
`_cf-custom-hostname.<host>`) FIRST, then the DNS-only CNAME to
`cname.mintlify.builders` once both show verified; on Cloudflare keep the
record grey-cloud, SSL/TLS Full (strict), "Always Use HTTPS" off. TLS is
provisioned by Mintlify within hours of propagation.

## Host registration snippets

**VS Code Copilot** (`.vscode/mcp.json`) — an MCP Apps host; widgets mount inline.
Point `url` at a Streamable HTTP server built with `createWidgenticServer()`
(`@widgentic/mcp/sdk`); add the `x-api-key` header if that server resolves
principals from a store:

```json
{ "servers": { "widgentic": { "type": "http", "url": "http://localhost:3001/mcp", "headers": { "x-api-key": "<api-key>" } } } }
```

**claude.ai / Claude Desktop custom connectors** — Settings → Connectors →
Add custom connector; connectors accept only a URL, so a per-principal server
takes the key as a query parameter:

```
https://<your-server>/mcp?key=<api-key>
```

**Claude Code** (tool results are text; Claude Code does not mount MCP Apps UI):

```bash
claude mcp add widgentic -- npx tsx /path/to/widgentic/examples/mcp-server/main.ts
```

**Claude Desktop** (`claude_desktop_config.json`, absolute paths):

```json
{ "mcpServers": { "widgentic": { "command": "npx", "args": ["tsx", "/path/to/widgentic/examples/mcp-server/main.ts"] } } }
```

## Verification log

Deployment entries (every vNN, production checks, claude.ai/Copilot legs against the hosted server) moved to `widgentic/apps` RUNBOOK.md on 2026-08-27; package-level entries stay here.

- **Array projection and value formats (2026-09-01, change `array-projection-and-formats`)** — three gaps one live authoring session against a currency ticker surfaced, closed together. (1) **Root-array completion**: `collectPaths` bailed on any non-object root, so the shape most REST endpoints return yielded ZERO candidates and every path input degraded to free text; it now descends a ROOT array into its item's properties, and `itemScope` collapses into `schemaAt(scope, eachPath) + .items` so `each: "."` scopes like any other each. Scoped deliberately to the root (design D8): mirroring `schemaAt` literally would have offered `lines.qty` in the outer scope, and NEITHER reader that matters resolves it — verified against the compiled renderer, `lines.qty` renders empty while `lines.0.qty` renders `2`, and the projection's `getAtPath` is the same. A nested array stays offered for `each`, its item properties arriving through that each. (2) **Per-item projection**: `applyOutput`'s `map` resolved only at the response root, so `getAtPath(array, "ask")` was `undefined` and a list response could only be `replace`d raw; entries now resolve per ITEM when the response is an array, which is backward-safe precisely because the old behavior was useless. The sole-entry `"."` target still addresses the root by index, and `merge` still refuses arrays. (3) **The `format` bind transform**: `{ bind, format }` on text binds and attr values, `number`/`currency`/`date`, render-time only — the payload keeps the typed value. Determinism is the hard requirement (server render, designer preview and in-frame re-render must agree byte for byte or the patcher sees phantom text changes): locale fixed at `en-US`, unzoned ISO read as UTC and formatted in UTC via our own token engine rather than `new Date()` — this VM's TZ is UTC, which would have hidden the bug, so the engine was checked under `TZ=UTC`, `America/Bogota` and `Asia/Tokyo` and gives `01-09-2026 02:04` in all three. Two facts worth keeping: Intl separates a currency CODE from the number with a NO-BREAK SPACE (U+00A0), so `COP\u00A03,207` — a plain-space assertion fails invisibly; and `Date.parse` is not required to accept the ticker's nine fractional digits, so the engine truncates to three. Owner decision (design D7): `currencyDisplay` is exposed, defaulting to `narrowSymbol`, because Intl's default `symbol` gives `COP 3,207` while the change's stated goal was `$3,207`. Acceptance rig on the user's real response, asserting the SERVED bytes of `handleRenderWidget`: root-array schema completing (`ask,when,book`), `each: "."` scoping to the item, template + store validation, per-item projection dropping `bid`, and `<ul><li>usdc_cop $3,207 @ 01-09-2026 02:04</li><li>usdt_cop $4,103 @ 01-09-2026 02:05</li></ul>` — with the ten-decimal string ABSENT from the render and PRESENT in the payload, and the tree and html projections byte-identical. Also confirmed the same enumerator fix repairs the action input mapping, the `$root.` helpers and the widget-level `load` (they share `allPaths`), and that two array sides of an output map are now compared by their ITEM types instead of passing every `array`-vs-`array` pair. Two defects the user found by driving the RUNNING designer were fixed in the same change (design D9). (a) `map`/`prefix` on a TEXT bind validated `ok` and were then ignored by the renderer — verified: `{ bind: "book", map: { usdc_cop: "X" } }` rendered `usdc_cop`, not `X`; both are now refused with a dotted path, `format` staying valid in both positions. (b) The `map` button was present but PERMANENTLY invisible on every attribute row: it lives in a `.wgd-node-icons` group hidden until its row is hovered, and the only reveal rules were `.wgd-node-row:hover > …` / `.wgd-st-row:hover > …` — child combinators that never match inside `.wgd-attr-row`. Confirmed by COMPUTED VALUE in headless Chrome against the live designer, not by a stylesheet regex: `visibility` `hidden` before focus → `visible` after, the button 35x17 with `checkVisibility()` true, inside the row's own width, and `elementFromPoint` at its centre returning the button itself; the row was also overflowing (`scrollWidth 334 > clientWidth 325`) so it now wraps. Gates: typecheck, 1028 tests, build, pack:check green; the export snapshot gained the format engine and its constants. **Review closure (8 angles, design D10) — three of the statements above were REVERSED by the review and are recorded here rather than rewritten:** (i) the text-bind `map`/`prefix` refusal was reverted — stores re-validate on read, so a stored widget carrying one dead key would have vanished from every host, against "nothing is ever saved but vanished"; they stay accepted and ignored, and the designer's text rows simply never offer them. (ii) the enumerator no longer descends a root array — that descent lived in the SHARED collector and advertised item properties at the template ROOT, in `load` input mappings and in `$root.` helpers, all of which resolve against the ARRAY and render nothing; the collector is context-free again, each item-scoped consumer (`each`, both output-map columns) asks for `itemSchema(...)`, an array scope offers only `"."`, and `schemaAt` steps into arrays by INDEX only, as the resolvers do (the "same fix repairs input mapping / `$root.` / `load`" claim above was the defect, not the feature — the binding test that pinned it now asserts the truth). (iii) per-item projection had hijacked INDEX-addressed sources: `{ latest: "0.ask" }` was a valid, working binding that resolved at the root and would have started projecting `undefined` per item — a source starting with an index now keeps root semantics. Also hardened: a date pattern must carry a token and no stray letter (`d/M/yy` rendered a constant), epoch numbers are seconds below 1e11 and milliseconds above (`1756694687` had formatted as 1970), a locale must be one the runtime knows, numeric output normalizes ICU's no-break spaces so engines agree byte for byte, the default `merge` over a per-item projection is flagged in the editor, `Intl.NumberFormat` and the tokenized pattern are built once per spec object (`compileFormat`) rather than per cell, the guide renders its example outputs through the engine, and one `:is()` rule reveals the icon group on every hosting row type. One finder claim was refuted by probe: prompt-text segments carrying `format` are already refused. **Then two backlog items were pulled into scope by owner decision (design D11):** a `"."` map target now SELECTS first — alone it is the projection as before, beside other entries it names the value they map — so an enveloped list (`{ data: [...] }`) projects per item without touching the output schema (the shape was forbidden until now, so nothing stored changes meaning; the output-map editor completes the `"."` row from the response root and the rows after it from the selection's items); and `map` WORKS on a text bind (the value selects an authored label, `default` on miss), while `prefix` stays attribute-only and inert in a text position — the designer's text rows offer `format` and `map`, never `prefix`. Live use of that build then surfaced three small designer findings, fixed in place (design D12): the `"."` selection row is an on-schema target; the widget designer's Export section lost its stray theme-JSON button and its entry button is `Export widget entry` like the other designers; the styles legend is `(.wg- selectors only)`.
- **Native tree widgets (2026-09-01, change `native-widgets-refresh`)** — tree branches became native `details.wg-tree-branch` / `summary.wg-tree-label` disclosures, so expand/collapse works with ZERO script wherever the HTML lands; `hints.expandDepth` now selects the INITIAL state through the `open` attribute and `data-expanded` is gone. Confirmed in a REAL browser (headless Chrome, CDP driver in the shape of `tools/probe-computed.mjs` plus `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` — synthetic events cannot exercise the platform's activation), inside a `sandbox="allow-scripts"` iframe serving the real `buildAppTemplate()` bytes with the tool-result posted in as a host would. With `expandDepth: 0`: branch 20px tall, children `checkVisibility()` false, the leaf's text still in the DOM (presentational collapse); trusted click → open, 49px, children visible; click again → closed; focus lands on the summary; Enter → open, Space → closed. `cursor: pointer`, one chevron at `rgb(107, 114, 128)` (`--wg-muted` default) with the platform marker suppressed, the emoji icon rendering before the label (`📁root`). Note for a future run: Chrome hides a closed disclosure with `content-visibility` on `::details-content`, so `getClientRects()` still returns boxes — use `checkVisibility({ contentVisibilityAuto: true })`; and the sandboxed frame is a separate process by default, so either pass `--disable-features=IsolateSandboxedIframes,IsolateOrigins,site-per-process` and pick the execution context whose `auxData.frameId` differs from `Page.getFrameTree`'s main frame, or attach to the frame target with flattened `Target.setAutoAttach`. Toggle survival is pinned by tests at both layers (core `mountWidget` and the `bootTemplate()` bridge): the patchers diff the PREVIOUS render tree, never the live DOM, so an unchanged branch is never rewritten and a newly appended branch mounts with its computed state. Nodes also gained an optional `icon` — a safe image source through card/table's own `looksLikeImageUrl` gate renders as `img.wg-img.wg-img-icon` with an empty alt, anything else as `span.wg-tree-icon` text, and `icon` joins `children` in the JSON-fallback exclusion. The `custom` kind was REMOVED: `createCatalog().kinds()` is exactly `card, table, tree, group`, `checkStoredWidget` now ACCEPTS `custom` as a user's own stored kind, and the guide's `reservedKinds` and `list_widgets` followed automatically. Two current specs the drafted deltas had not covered were reconciled during apply (design D8): `widget-theming` — `.wg-custom` renamed to the neutral `.wg-code` monospace utility rather than deleted, because `--wg-font-mono` is consumed only there and dropping the token would refuse live stored themes that set it with `UNKNOWN_TOKEN`; and `reactive-rendering` — the patch scenario renamed to `open` with the prev-vs-next guarantee promoted to stated behavior. Gates re-run after review: typecheck, full suite, build, pack:check green. An 8-angle review then hardened it: the fallback label's icon/children-only boundary (both renderers), negative `expandDepth` clamped to 0 instead of flipping fully open, a depth-64 totality bound in the core renderer (the header said \"never throws\"; a 5000-deep nesting proved otherwise), the preview's depth cap bounding recursion rather than SHAPE, the designer's tree seed moved off dead `data-expanded` markup, the render-only `icon` shape split into `RenderImageShape`, the two sanctioned preview divergences pinned BY NAME, and the toggle-survival claim qualified as positional — an unkeyed diff re-pairs states when siblings reorder (keyed diff queued in the backlog with the inliner's occurrence-amplification).
- **Agent-visible shared actions (2026-08-31, change `agent-visible-actions`)** — `list_actions` joins the discovery tools (eighth overall) and the authoring guide gains the `sharedAction` section, closing the gap found live on v70: the template DSL bound `{ "ref": "<name>" }` while nothing told an agent what the referenced entry was, what arguments it took, or where a person imports one. The listing is the action's CONTRACT — `name`, `label?`, `description?`, `kind`, and for http the `method` and the input/output schemas — and deliberately withholds `url`, `headers` and `query`: a binding needs none of them, and a read-only key travels into prompt-injectable hosts where an author's literal header or query value (a bare token, for an author who did not know better) would otherwise be readable. The projection lives in the handler, not at each host's wiring, so no deployment can leak by forgetting; the protocol test asserts the ABSENCE of the URL, the header name and value, and the secret's name from the serialized result. Also derived rather than restated: the guide quotes `ACTION_NAME` (`^[a-z][a-z0-9-]{0,63}$`), which is STRICTER than the `SAFE_IDENTIFIER` widgets, themes and schemas use — a guide that had restated the wrong one would have taught names the store then refuses. Two adjacent gaps closed: the guide's `limits` published four caps but neither `maxSchemas` nor `maxActions`, and the Node authoring adapter awaited the host's `resolveContext` outside its try/catch, so a host whose store was unreachable got an escaped rejection (a bodyless 500 at best) instead of the surface's own structured `INTERNAL` with the trace on the log sink. Gates: typecheck clean, full suite green, build and pack:check green; the export snapshot gained exactly `LIST_ACTIONS_TOOL` and `handleListActions`. An 8-angle review on the diff then hardened it: a prompt entry carries `binds` (its text's data paths — a prompt ref takes NO input mapping, and every steering text now says so), the adapter's containment keeps a store rejection's mapped status/code instead of flattening it to 500 (the production resolver IS `ensurePrincipal`), one malformed source entry is dropped rather than failing the whole listing, and the smoke above asserts the action's PRESENCE before the absence of its own transport values — an unwired source would pass a blanket absence check vacuously, and `"$schema"` URLs false-positive a bare `https://` grep.
- **First npm publish (2026-08-27, `@widgentic/core|designer|mcp@0.1.0`, Release workflow)** — repository transferred to the `widgentic` GitHub organization (`widgentic/widgentic`, public); the Release workflow opened and merged the Version Packages PR (0.0.0 → 0.1.0 for the linked group) and published with a bootstrap `NPM_TOKEN`. Verified from an anonymous client: all three at 0.1.0 with npm **provenance attestations**, MIT, `repository` → `widgentic/widgentic`, core with no dependencies, designer/mcp depending on core, mcp's SDK/zod/Azure clients as optional peers; `npm install @widgentic/core @widgentic/designer @widgentic/mcp` in a clean project resolves and every entry imports. Two operational lessons: the `NPM_PUBLISH` gate must be a repository **variable** (a secret of the same name reads empty and the workflow silently falls back to `pack:check` — green, but no publish); and a freshly published package can 404 from the registry document endpoint for several minutes while the search index already lists it — wait, do not assume restricted access.
- **Claude Code 2.1.220** — graceful degradation confirmed (text results, no UI mounting by design).
- **Linked-group release semantics (2026-08-29, change `linked-release-versions`)** — the first release after 0.1.0 carried a designer-only changeset and published `@widgentic/designer@0.2.0` while core and mcp stayed at 0.1.0; both published dependents declare `@widgentic/core: ^0.1.0`, which the unchanged core satisfies (verified on the registry). The same run rewrote `packages/mcp/package.json`'s devDependency on designer to `^0.2.0` without bumping mcp, so the published `@widgentic/mcp@0.1.0` keeps the older devDependency range — harmless, consumers never install devDeps. `package-distribution`'s "Versions move together and are attested" now records the linked semantics, the range guarantee, the highest-version rule and this manifest-without-release case; the release configuration was deliberately left alone (`linked`, not `fixed`).
- **Docs site live (2026-08-29, change `docs-site`, commit `89b8d46`)** — `docs/` (47 MDX pages: 25 hand-written, 22 generated) deployed by Mintlify from `main` (GitHub App, subdirectory `/docs`) and served at `https://docs.widgentic.dev` over TLS. Gates green before the push: `docs:generate --check` 22 pages current, navigation test (no orphans, every entry resolves), `mint validate` (strict), `mint broken-links --check-anchors` clean, `mint a11y` clean over 47 files; repo gate typecheck / 862 tests / build / pack:check. Verified from served bytes after the build: a page from every tab answers 200 with its own title (`/get-started/what-is-widgentic`, `/design/widget-designer`, `/how-it-works/trust-model`, `/develop/packages`, `/reference/theme-tokens`, `/reference/api/core`, `/reference/api/mcp-secrets-keyvault`). Two lessons: the CDN served the previous build's root for minutes after the new pages were live (a cache-buster showed the correct home page — check a deep path, not `/`, to judge a deploy); and `mint a11y` measures `colors.primary` against the light background, where widget blue `#40A0C8` fails 3:1, so the docs primary is link blue `#1E6F92`.
- **Designer chrome tokens (2026-08-28, change `designer-chrome-tokens`, `@widgentic/designer` → 0.2.0 pending release)** — headless Chrome 151 via `tools/probe-computed.mjs` against the demo host. Without `chrome`: root `system-ui, sans-serif` 13px gap 16px, inputs/buttons 13px radius 4px, compact inputs 12px, tags `ui-monospace, monospace` 11px radius 3px colour `rgb(37, 99, 235)`, sections radius 6px, chevron 10px, JSON pane mono 13px, preview `rgb(255, 255, 255)` — identical to the literals the tokens replaced. After "Host chrome" (`bg/panel/border/line/text/muted/hover/accent` → `var(--host-*)`, `font: var(--host-font, system-ui, sans-serif)`, `font-size` 14px, `font-size-sm` 13px, `radius` 8px, `radius-lg` 12px): root and buttons Georgia 14px radius 8px, compact inputs 13px, sections 12px, tag colour `rgb(64, 160, 200)`; tags stayed 11px/3px and the chevron 10px (unmapped `font-size-xs`/`radius-sm`), the preview background stayed white (widget `--wg-*` tokens untouched). The root carried the map as inline custom properties and nothing else.
- **Designer chrome tokens, full map (2026-08-29)** — the demo host's "Host chrome" button switches the page's own `--host-*` palette to the brand look (light and dark) and passes a map covering all 28 tokens, so page and designers match in both states (the header stays `system-ui` with the built-in palette while the toggle is off). Probe before → after the toggle: root `system-ui` 13px gap 16px `rgb(255,255,255)`/`rgb(31,36,48)` → Georgia 14px gap 24px `rgb(246,250,252)`/`rgb(11,27,38)`; inputs and buttons 13px radius 4px → 14px radius 8px, border `rgb(213,219,227)` → `rgb(211,224,232)`; compact inputs 12px → 13px; tags `ui-monospace` 11px radius 3px `rgb(37,99,235)` on `rgb(232,238,249)` → `"Courier New"` 12px radius 4px `rgb(30,111,146)` on `rgb(227,241,247)`; sections radius 6px → 12px; chevron 10px → 11px; JSON pane mono 13px → Courier 14px, `hl-key` `rgb(11,95,165)` → `rgb(30,111,146)`, `hl-str` `rgb(10,122,61)` → `rgb(46,125,91)`; the root's inline custom properties 0 → 28; the preview background stayed `rgb(255,255,255)` (widget tokens untouched).
