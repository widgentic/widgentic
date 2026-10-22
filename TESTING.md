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
| `dotnet run --project dotnet/samples/Widgentic.Sample.Stdio --launch-profile stdio` | stdio | The docker demo seed's widgets, themes and shared schemas from a .NET server (`Widgentic.Mcp`), plus a host tool that renders its own data (`team_roster`); needs `npm run build` first |
| `dotnet run --project dotnet/samples/Widgentic.Sample.Stdio` | HTTP on `localhost:3002/mcp` | The .NET sample's default launch profile (`http`, also what F5 runs), for hosts that connect to a URL, where widgets mount: VS Code Copilot on localhost; Claude and ChatGPT through a tunnel. Verified in all three |
| `npm run designer` | HTTP on `:8082` | The designers in a demo host (widget + theme + schema + action tabs) with their WebMCP tools registered (the header says `WebMCP tools are available in this browser` in an agent-capable browser, nothing otherwise); `/standalone.html` uses the published browser bundle |

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

The listing carries NINE tools: `list_widgets`, `list_schemas`,
`list_actions`, `list_themes`, `list_theme_tokens`, `get_authoring_guide`,
`render_widget`, and the app-only `execute_action` and `preview_widget` (the
SDK lists them; Apps hosts hide them from the model). These requests carry no
protocol envelope, so the server answers them as 2025-era requests. A server
on the SDK's HTTP entry answers those with a single-event SSE stream
(`event: message` / `data: {…}`); the greps read either form.

```sh
# 4. Protocol revision 2026-07-28: the request carries the client's
#    capabilities in its own _meta (no initialize ever runs), and an MCP Apps
#    client must get the SLIM output. Proves the per-request slimming path.
UI='{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}'
curl -s -X POST "$URL/mcp" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: render_widget' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_widget","arguments":{"widget":"card","data":{"title":"T"}},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":'"$UI"'}}}' \
  > /tmp/modern.json
grep -c 'do not restate' /tmp/modern.json   # 1 = slimmed from the request's own capabilities
```

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

## WebMCP: real-Chrome check

`@widgentic/webmcp` is unit-tested against a fake model context; whether a REAL
browser exposes the tools is a different question, and the only browsers that
answer it are ChatGPT Desktop's and a Chrome/Edge with WebMCP enabled. The
repo carries a driver for the latter:

```sh
npm run designer &                      # or the docker example's web service
CHROME_ARGS="--enable-features=WebMCPTesting,DevToolsWebMCPSupport" \
  node tools/probe-computed.mjs http://localhost:8082/ tools/probe-webmcp.js
```

`probe-computed.mjs` launches the local Chrome with the flags from `CHROME_ARGS`
(`SCREENSHOT=<file.png>` captures the page after the expression ran, `VIEWPORT=WxH`
sizes it — the expression may drive the UI first, so a screenshot can show the result
of a click);
the expression file reads the page's `#agent-status`, lists the registered tools
through `navigator.modelContextTesting.getTools()`, executes
`widgentic_widget_draft_load` with a small definition and reports what the
DESIGNER shows afterwards (the kind input's value, the preview's heading) — a
tool that "succeeded" without the designer changing is a failure. Two Chrome facts
the probe encodes: the testing surface lists with `listTools()` and executes with
`executeTool(name, jsonString)`, and the SPEC surface's `document.modelContext.executeTool(tool, input)`
wants the input as a JSON STRING too (an object fails with "Failed to parse input
arguments"). With an origin-trial token on the page the same probe runs on a Chrome
WITHOUT any flag (`CHROME_ARGS` unset): `navigator.modelContextTesting` is absent and
the spec surface does everything. Expect twelve tools, five of them `readOnlyHint`. The testing surface
is version-dependent (Chrome 149+; its `executeTool` signature has moved), so
the script prints what it found rather than asserting; read it. In ChatGPT
Desktop the equivalent check is the address bar's **Available site tools**
listing the twelve, then asking for a widget and watching the designer.

## App template: real-browser probe

`./node_modules/.bin/tsx tools/probe-template.ts` measures the served template and drives it
in headless Chrome through a minimal fake host (a same-origin `srcdoc` frame answering the
handshake). It prints the template's raw and gzipped (level 9) byte size — the measure
`app-template-size.test.ts` budgets — whether the handshake completed (a parse-level failure
in the inline script, which jsdom cannot see, shows up as `handshake: false`), the median
mount time of a 200-row table and a 200-node tree, whether a reversed keyed table kept every
row element, whether a stored kind's streaming input produced a `preview_widget` call
whose answer mounted, and the computed boxes of streaming image places (`imagePlaces`: a tree
icon place and a pending card hero in a 480 px frame, `[width, height]` in px, both non-zero).
Mount medians move by several milliseconds from run to run; compare
them only for large shifts.

## Self-host example: the README loop, as a judge would run it

The README's three commands are the whole setup — a KEK file, `docker compose up
--build`, author at `:8080` — and the deployed demo runs the SAME image with only the
environment variables the README documents (`WIDGENTIC_MCP_UPSTREAM`, `WIDGENTIC_KEK`,
`WIDGENTIC_DB`, `WIDGENTIC_ORIGIN_TRIAL_TOKEN`). To prove the loop locally:

```sh
cd examples/docker && docker compose up --build -d
curl -s -X POST http://localhost:8080/api/keys -H 'Content-Type: application/json' \
  -d '{"name":"laptop"}' -o key.json            # single-principal mode: same-origin/non-browser writes pass
CHROME_ARGS="--enable-features=WebMCPTesting,DevToolsWebMCPSupport" SCREENSHOT=loop.png \
  node ../../tools/probe-computed.mjs http://localhost:8080/ <expression that calls widgentic_widget_draft_load, then clicks #widget-save>
# then, with the key from key.json:
#   tools/call list_widgets  → the saved kind is listed WITH the key and absent WITHOUT it
#   tools/call render_widget { widget: "<kind>", data: {...}, format: "page" } → a page carrying the data
docker compose down -v
```

`render_widget` takes `widget` (the kind), `data` (any JSON) and `format`; a `kind`
argument is refused with `-32602`.

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

## .NET host (`dotnet/`)

`Widgentic.Mcp` embeds the `@widgentic/mcp/host` bundle built in this workspace,
so the npm build comes first. The test runner opt-in lives in
`dotnet/global.json`, so run `dotnet test` from `dotnet/`:

```bash
npm ci && npm run build                      # builds packages/mcp/dist/host/widgentic-host.js
cd dotnet && dotnet test --solution Widgentic.slnx -c Release
```

The suite covers:
- **Conformance.** Every case of `packages/mcp/src/host/__tests__/conformance.json`
  on V8 must equal the Node output byte for byte; that file is regenerated by
  `npm run conformance:generate` and checked for staleness by `npm test`.
- **The real protocol.** A C# SDK client checks tool texts and annotations, `_meta.ui`, slimming,
  resources and CSP, and a host tool.
- **Tool selection.** All 64 flag combinations.
- **Configuration refusals.**
- **The engine pool.** Concurrency, a runaway call, nothing leaking between
  callers, and the bundle's identity.
- **Per-principal catalogs.** Merge and Replace and the per-catalog override,
  refusals logged without contents, a failing source, the global surfaces, two
  principals concurrently on one pool, and nothing kept between calls.
- **Default themes from settings.** Startup defaults, a refused startup setting,
  a caller's section replacing the startup one in Merge, Replace, refused caller
  settings logged, and previews and pages following the caller. The corpus's
  named settings configurations run on V8 too.
- **Render-only.** No HTTP request, and prompt actions live while http actions
  render disabled.
- **The `.nupkg` shape.**
- **The sample**, launched as a process over stdio and HTTP, including its two
  demo principals keyed by header and by URL.

The same corpus runs in a bare V8 realm on the Node side
(`packages/mcp/src/host/__tests__/bare-realm.test.ts`). A change that alters a
render fails both suites until the corpus is regenerated, and then the .NET
suite proves V8 agrees.

Measured on a Windows 11 developer machine (.NET 10.0.401, ClearScript 7.5.1.1),
2026-10-08:

| What | Value |
|--|--|
| Engine start, first runtime | about 480 ms (native V8 load and JIT) |
| Each further runtime | about 20 ms (a pool of 4 costs about as much as 1) |
| Private memory, first runtime | +23 MB (native V8, ICU data, one isolate) |
| Private memory, each further idle runtime | about +4 MB |
| Render, warm (probe, table) | about 0.2 ms |
| Host bundle | 180 KB minified, 60 KB gzipped (after the rendering-app-template merge) |

The release gate `node tools/verify-host-pin.mjs <version> packages/mcp/dist/host/widgentic-host.js`
compares the workspace bundle with the pinned registry tarball's. It answers
"not on the registry" or "predates the host bundle" for versions that cannot
match.

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

**VS Code, the .NET sample over HTTP** (`.vscode/mcp.json`; start it with `dotnet run`, whose default profile is `http`):

```json
{ "servers": { "widgentic-dotnet": { "type": "http", "url": "http://localhost:3002/mcp" } } }
```

**Claude (claude.ai or Desktop custom connector), the .NET sample over HTTP.** Connectors take a
public HTTPS URL, so tunnel the loopback port, for example
`devtunnel host -p 3002 --allow-anonymous` or `cloudflared tunnel --url http://localhost:3002`.
Then add `https://<tunnel-host>/mcp` under Settings → Connectors → Add custom connector. The
sample's keys select a catalog and gate nothing, so keep the tunnel up only while testing.

**The .NET sample's demo principals.** Start the sample with both keys configured (see
`dotnet/README.md`), then add one connection per principal, the key in the URL:

```
http://localhost:3002/mcp?key=<merge-demo-key>        # VS Code; the seed with its own inbox and theme
https://<tunnel-host>/mcp?key=<replace-demo-key>      # a connector; the built-ins and release-notes-widget
```

A connection without a key gets the seed. Hosts cache `ui://` per chat, so test each principal
in a fresh conversation.

**Claude Desktop, the .NET sample over stdio** (`claude_desktop_config.json`; build the npm
workspace and the sample first, then point at the built DLL):

```json
{ "mcpServers": { "widgentic-dotnet": { "command": "dotnet", "args": ["/path/to/widgentic/dotnet/samples/Widgentic.Sample.Stdio/bin/Release/net10.0/Widgentic.Sample.Stdio.dll"] } } }
```

**Claude Desktop** (`claude_desktop_config.json`, absolute paths):

```json
{ "mcpServers": { "widgentic": { "command": "npx", "args": ["tsx", "/path/to/widgentic/examples/mcp-server/main.ts"] } } }
```

## Verification log

- **Widget themes (2026-10-22, change `widget-themes`, on `feature/widget-themes`; core, designer and mcp minor and a webmcp patch pending release)**: a widget names its own light and dark themes, ahead of the Settings defaults.
  - **Core** (`widget-themes.test.ts`, 3 tests). `descriptor.themes` registers and lists unchanged. `checkWidgetThemes` accepts a single mode or a built-in, and refuses a number, an unknown mode, an empty name, a name with a space, and a non-object, each naming `descriptor.themes`.
  - **Store** (the shared contract on memory, SQLite and the Cosmos fake; the file store is read-only).
    - `putWidget` refuses an unknown name with `UNKNOWN_THEME`, naming the mode and the theme. It stores a saved theme or a built-in, and refuses malformed shapes with `INVALID_SHAPE`.
    - `removeTheme` answers `THEME_IN_USE` while widgets name the theme, with one message naming widgets and defaults ("default light theme and is named by widgets promo, report"). It succeeds once no widget names the theme.
    - SQLite raw entries: a widget the validator refuses today still protects its theme, and a malformed `themes` is skipped on read with a diagnostic.
  - **Rendering** (`widget-themes.test.ts` in mcp, 11 tests).
    - Precedence: per mode, a widget naming one mode keeps the other default, a built-in opts out, one theme for both modes equals an explicit theme, and an explicit `theme` wins.
    - Previews, an action re-render (through `handleExecuteAction`) and page documents follow the widget.
    - Groups: agreeing items lend their theme with no note. Disagreeing items give the default and a `Theme notes:` line naming the items, in the default and `html` texts and never in a page document.
    - A missing name falls back with a note.
    - `list_widgets` shows `themes`, and the `theme` field steers.
    - Widgets without themes render as before, and the corpus for existing cases did not change.
  - **Corpus** (`widget themes` configuration). It covers both modes, light only, a built-in opt-out, explicit wins, a page, a preview, agreeing and disagreeing groups, a missing name, the listing and a widget page. The .NET suite runs it (240 tests).
  - **Designer** (`widget-themes.test.ts`, 4 tests). Selects edit `descriptor.themes`, and choosing a supplied light theme also selects it as the preview theme, with its styles. Settings default omits the mode, a missing name is kept and marked, the export carries `themes`, and import refuses a malformed field.
  - **Owner finding on staging (design D10).** Opening a widget that names its themes still previewed it in the Settings default, because the app passed that default as the person's pick. The designer now has `defaultPreviewTheme` (one name or per scheme). On open, the person's pick comes first, then the widget's own theme for the designer's scheme, then the fallback, and `loadWidget` switches to a definition's own theme. Tests: 3 more in the designer's `widget-themes.test.ts`. The app's `app-widget-themes.test.ts` checks that the person card opens on `acme`, a plain widget on the Google default, and a pick survives a remount.
  - **Demo seed** (13 entries).
    - A new Acme Outfitters pair, `acme` (light, with a `.wg-card` accent rule) and `acme-night`, which the person card names.
    - The project status names the built-ins, opting out of the Google defaults.
    - The person card gains an email, an optional title, an optional company block (name, industry, website) and optional tags (owner request). A name-only card renders just the header.
  - **Production scan** (read-only, counts only): 25 stored widgets, none with a `themes` key.
  - **Staging** (`widget-themes-1597397`, revision `--0000038`), keyed renders of the seed:
    - the person card wears `acme`/`acme-night`, and the inbox the Google defaults;
    - the project status carries no token declarations (built-ins);
    - a person card plus inbox group wears `acme` with no note;
    - a person card plus project status group wears the defaults, with one note per mode;
    - `list_widgets` shows `themes`.

    The first staged build joined two notes as `one.; group dark`, so notes now end without a period, as hint notes do. After the designer finding, staging runs `widget-themes-34e1813` (revision `--0000039`), and its served `/app.bundle.js` carries the new preview selection.
  - **Gates.** Typecheck, 2,048 tests, build, `pack:check`, `docs:check`, OpenSpec strict and specs, and `dotnet test` (240) all pass.

- **Date time zones (2026-10-21, change `date-time-zones`, on `feature/date-time-zones`; core, designer and mcp minor and a webmcp patch pending release)**: the date format's `zone` shows UTC (the default), the value's own offset, or, in MCP Apps frames, the viewer's zone.
  - **The format** (`date-zones.test.ts`, 8 tests).
    - `value` reads `Z`, `±HH:MM`, `±HHMM`, fractions, unzoned values, date-only values and epochs. `2026-10-21T09:30:00-07:00` with `HH:mm` gives `09:30` under `value` and `16:30` under `utc`.
    - `viewer` emits `<time datetime="2026-10-21T16:30:00.000Z" data-wg-date="dd-MM HH:mm">21-10 16:30</time>`, whose text equals the UTC rendering. `soon` stays plain text.
    - An epoch beyond the Date range (`1e300`, `±8.64e15 ± 1`, a nanosecond `1.7e18`) renders its plain value in every zone, where it previously rendered `NaN` digits. `8.64e15` itself renders `275760-09-13`.
    - Validation refuses an unknown zone, and refuses `viewer` on an attribute value with `INVALID_TEMPLATE_NODE`, naming `format.zone` and the two zones that work there.
  - **The frame** (`app-template-zones.test.ts`, 8 tests through `bootTemplate()`).
    - With the viewer's zone set to UTC, the frame's localized text equals the renderer's UTC text. This covers 8 patterns, including every token alone, over midnight and the years 999, 1, 10209 and 275760.
    - The host's `Asia/Tokyo` gives `01:30`, and every token reads a 24-hour clock (`America/New_York` → `2026-10-21 12:30:00`).
    - With no host zone, `Mars/Base`, `""` or a number, the frame's own zone applies. The test sets the process zone to `Asia/Kolkata` (`22:00`), so the case is not vacuous.
    - A `host-context-changed` to New York re-renders `12:30` in the same `time` node, and a theme-only change leaves the zone.
    - A server preview localizes. A repeated result patches with node and text identity kept. A renderer-built tree localizes, and an unreadable instant keeps its UTC text.
  - **Host probe** (staging `date-time-zones-probe-e4d7b28`, a never-merged branch). claude.ai sends `timeZone="America/Bogota"` (locale `es-419`). ChatGPT sends `America/Bogota` (locale `en-US`). VS Code Copilot sends no zone (locale `en-us`). Every frame's own zone is `America/Bogota` (GMT-0500), so the host value and the fallback both give the viewer's zone.
  - **Budget.** The raw budget rises to 46,080. The template measures 46,069 raw (11 B left) and 12,207 of 13,312 gzipped.
  - **Steering and the designer.** `DATE_ZONES`, `DATE_ZONE_RULE` and `isDateZone` are exported (exports snapshot). Both guides' `FORMAT` line derives from the rule, and each guide's test checks it. The designer's zone select offers `viewer` on text rows only and omits `zone` for UTC (`editors.test.ts`).
  - **Corpus** (`corpus-dates`). It covers an offset, an unzoned value, an epoch and `soon` across the three zones and a `value`-zone `title`, plus a `page` render showing the viewer zone's UTC text. The .NET suite runs it (229 tests).
  - **Demo seed.** The agenda's `startsAt`/`endsAt` use `viewer`, and the inbox's `receivedAt` uses `value`. Their examples carry `-05:00`.
  - **Gates.** Typecheck, 1,996 tests, build, `pack:check`, `docs:check`, OpenSpec strict and specs, and `dotnet test` (229) all pass.
  - **Staging** (`date-time-zones-a853bb4`, revision `--0000036`).
    - A keyed agenda render carries 4 `time` elements: `09:15-05:00` becomes `datetime="2026-09-03T14:15:30.000Z"` over the UTC text `2026-09-03 14:15`.
    - The inbox renders `09:15` and `08:30` as written.
    - The served template carries the zone walker, and the probe is gone.
  - **Owner host check (2026-10-22).** In fresh chats in claude.ai, ChatGPT and VS Code Copilot, and in the staging designer, everything worked as specified:
    - the agenda showed its times in the viewer's local time (Bogota);
    - the inbox showed the times as written;
    - the designer's island preview showed local times.

- **Encoded prefix values (2026-10-21, change `encode-prefixed-url-values`, on `bug/encode-prefixed-url-values`, core/designer/mcp/webmcp patch pending release)**: a value composed behind an author's URL prefix is percent-encoded, so data cannot restructure the URL.
  - **The report, reproduced on 0.14.0.** A `src` with prefix `https://api.dicebear.com/9.x/initials/svg?seed=` over `Ada & Lin?x=1#y` rendered the value raw, so the service received `seed=Ada `. A `hints.links` prefix and the app template's streamed preview did the same. Whole URLs bound with no prefix were already correct.
  - **The rule** (`url-values.test.ts`, 7 tests). A query or path prefix encodes one component. A bare `mailto:`/`tel:`/`sms:` keeps the address and encodes `% ? # & [ ]` and spaces. `http:`/`https:`, with or without `//`, keeps the URL's delimiters and escapes. A `data:` prefix keeps its value. `https:///` and `ftp:` are classified as component and address prefixes. Non-ASCII is UTF-8, an astral character encodes whole, and a lone surrogate becomes `%EF%BF%BD`.
  - **The renderers.**
    - Template: 7 new scenario tests in `compile.test.ts`. They include a scheme-less prefix that can no longer assemble `javascript:` (its `:` becomes `%3A`), an `https://` prefix that keeps `example.com/a/b?c=1`, and a base64 value behind `data:image/png;base64,` that stays an image source, where `<svg onload=x>` is dropped.
    - Built-ins: 2 new tests in `chrome-links.test.ts` (card and table `hints.links`). The analyzer checks the encoded href.
    - Existing tests updated: a phone with spaces now links `tel:+1%20250-555-0163`.
  - **The preview** (`app-template-links.test.ts`, 3 tests). Card fields and table cells streamed through `bootTemplate()` link exactly the hrefs the renderer builds over 16 cases (12 linked). The prefixes vary as well: `MAILTO:`, `HTTPS:`, `https://`, `ftp:` and `data:`. A streamed table links `?q=a%26b%20c`. Template 44,992 / 45,056 raw (64 B left), 11,774 / 13,312 gzipped.
  - **Steering.** The new core constant `PREFIX_ENCODING_RULE` states the rule. Every surface derives from it: the `ATTR PREFIX` guide line (server and webmcp, each pinned by its guide test), the card and table `links` descriptors, and the designer's prefix field. The exports snapshot gains the constant. The corpus gained 4 prefix cases, the `corpus-prefixes` widget covering `https://` and `data:` too.
  - **PR review (#63) revision.** An `https://` prefix and a `data:` prefix were regressions compared with raw concatenation, and both are now cases of the rule. The guarantee is scoped per case in code comments, docs and the rule text. The bridge agreement test varies the prefixes.
  - **Stored data** (read-only production scan, counts only). 11 `prefix` transforms in 7 of 25 widgets: 5 `mailto:` and 5 `tel:` on `href`, 1 `https:` on `src`. Emails and the `https:` remainder render byte for byte as before. Spaces in phone numbers become `%20`.
  - **The demo seed** gains `person-card-widget` (11 entries written).
    - Avatar: a DiceBear initials `src` behind a query prefix.
    - Phone: a `tel:` address.
    - Address: a Google Maps query prefix.
    - Website: a whole URL with no prefix.

    Its example renders `seed=Zo%C3%AB%20O'Brien`, `tel:+1%20(555)%20010-0199`, `query=12%20Main%20St%20%26%205th%20Ave%2C%20Apt%20%234%2C%20Springfield`, and the website with `&amp;` in the HTML. On staging (`encode-prefixed-url-values-ac3df97`, revision `--0000034`), a keyed render of `Ada & Lin` carries the encoded URLs. The server-inlined DiceBear SVG reads `AL`, where the raw seed would have stopped at `Ada `.
  - **Owner host check (2026-10-21).** The owner rendered `person-card-widget` in a fresh chat on staging and reports it working as expected: the avatar shows both initials, the address link opens Maps on the whole address, the phone link dials, and the website link opens with its full query.
  - **Gates.** Typecheck, 1,969 tests, build, `pack:check`, `docs:check`, OpenSpec strict and specs, and `dotnet test` (224) all pass.

- **Stylesheet resources (2026-10-15, change `stylesheet-resources`, on `feature/stylesheet-resources`, core/designer/mcp minor pending release with the island)**: a person's stylesheets load in every frame of their widgets, behind their resource domains.
  - **The rule** (`resources.test.ts`, 8 tests).
    - Accepted: `https://` addresses, host lowercased, path, query and fragment kept.
    - Refused, each with its reason: `http:`, userinfo, a port, IPv4 and IPv6, `localhost`, a wildcard host, `javascript:`, a quote, a space, `<`, non-ASCII, over 2,048 characters, a bad integrity, `script`, an unknown key and a non-object.
    - Lists keep their order and drop repeats by address.
    - Coverage: exact, a wildcard over its subdomains (not its apex), and a refused domain covers nothing.
  - **The store** (shared adapter suite, memory, file, SQLite and Cosmos).
    - Stored in order and canonical.
    - Each refused form gives `INVALID_RESOURCE` with the record unchanged. Shape and limit give `INVALID_SHAPE` (9 refused, 8 accepted).
    - An uncovered host gives `UNDECLARED_DOMAIN`, and is accepted when its domain comes in the same write.
    - Removing a domain a stylesheet needs is refused, whether by a narrower list, `null` or `[]`.
    - A wildcard covers subdomains, never the apex. An empty list removes the section.
    - Composition yields only the caller's list.
    - Old-shape records (defaults and domains only) read back unchanged, and a write naming neither section never checks coverage.
    - Out-of-band records drop a `script` entry and an uncovered one, with diagnostics naming each, in all three persistent adapters. Unreadable settings yield none.
  - **The authoring route.** `PUT /settings` answers `422 UNDECLARED_DOMAIN` naming `fonts.googleapis.com`, and `422 INVALID_RESOURCE` for a script. The same stylesheet saves with its two domains in one body.
  - **Delivery** (`stylesheet-delivery.test.ts`, `execute-action.test.ts`).
    - Through the SDK: render and preview carry the covered stylesheets in order, and `list_themes` lists them with its explanatory sentence. An uncovered or refused entry is never delivered.
    - Without stylesheets, `both`, `page`, `html` and `app` outputs are identical to a server without the option.
    - `page` and `app` documents link each stylesheet before `<style>`, with `&` escaped and integrity carrying `crossorigin`. The `html`, `widget` and payload never mention one.
    - The action re-render carries them, and structured content never shares an object with the caller's list.
  - **The frame** (`app-template-resources.test.ts`, `bootTemplate()` harness).
    - Links go before `#wg-dynamic-css`, in order; integrity and `crossorigin` appear only on the pinned one.
    - A listed link keeps its element. An unlisted one is removed, and a result without the key removes all. A reorder moves elements rather than recreating them, and a repeat is linked once.
    - `script`, `http:`, `javascript:`, a string and an entry without an address are ignored.
    - A server preview links them before the result, and the result keeps the same element.
    - The template has no `https://` literal: the check is a regex. It is 44,631 bytes raw and 11,602 gzipped, inside both budgets.
  - **The host bundle and .NET.**
    - The host links the covered stylesheet in render, preview, listing and widget page. `problems()` reports `INVALID_RESOURCE` and `UNDECLARED_DOMAIN` under `settings`.
    - The corpus gains six "stylesheets from settings" cases; only the app template case changed.
    - `dotnet test`: 219, including startup delivery, a principal covered by the operator's domains (design D10, revised: `Compose` now carries `ResourceDomains`), Replace isolation under a pool of 4, and an uncovered stylesheet skipped and logged.
  - **The designers.**
    - The island sends only the rule's entries with every revision, and the in-page preview adds no link.
    - The settings designer's Stylesheets subsection records entries canonically. It marks an uncovered host with the domain to add, and the mark clears when the domain is listed. It keeps an invalid entry as typed with its reason, records and checks integrity, and disables adding at 8. It refuses a malformed list on load, carries an emptied list, is inert when read-only, and states the form, limit, fonts domain and trust.
  - **The example.**
    - The endpoint delivers a saved stylesheet on the next render, only to its principal.
    - The app saves domains and a stylesheet through Settings, and the remounted widget designer's preview carries it.
    - The seed (10 entries written) adds the two font domains, the Material Icons stylesheet, and `event` and `mail` icons in the agenda and inbox headers.
  - **Chrome 151 against the example**, local and seeded.
    - The island's head is `meta, title, style, link (Material Icons), style#wg-dynamic-css`.
    - The `mail` span renders in `"Material Icons"` at 22×22 with `document.fonts.check` true, so it shows as a glyph, not text. An edit keeps the same link element.
    - In Settings, a stylesheet on `cdn.example.org` is marked "Add cdn.example.org under Resource domains, or chat hosts block it.", and the mark clears when that domain is added.
    - Removing `fonts.googleapis.com` and saving answers `UNDECLARED_DOMAIN: the stylesheet '…Material+Icons' needs fonts.googleapis.com in your resource domains.`
  - **Revisions during apply.**
    - D6: `list_themes` explains `resources` in its result's `rules`, not its description, so `tools/list` is unchanged.
    - D7: no budget change was needed.
    - D10: `.NET` per-principal composition now carries the operator's domains.
  - **Gates.** Typecheck, `npm test` (1942 passed, 1 skipped), build, `pack:check`, docs check, `openspec validate --strict` and `--specs` (19), and `dotnet test` (219). Verify added a theme-designer island assertion for `resources`. The rerun at archive passed: 1942 tests, 19 specs.
  - **Staging (`stylesheet-resources-40be27a`, ACR run `cj3v`, revision `widgentic-selfhost--0000032`, replacing the island build).** Each response was saved to a file and then read. The deployment key went from Key Vault into a header file only, and was shredded.
    - `GET /api/settings` holds the seeded stylesheet and the four domains.
    - `/api/preview-frame` grants the font domains in `style-src` and `font-src`, and its 44,626-byte template carries `applyResources`.
    - A keyed 2026-07-28 `render_widget` carries `structuredContent.resources` with Material Icons, and the keyed `page` document links it before `<style>`. The keyed `html` fragment never mentions it, and the keyed `list_themes` lists it.
    - A keyless render carries no `resources`.
  - **The owner's host check on staging.** All passed, Copilot included this time.
    - In fresh conversations, the inbox and agenda widgets rendered the mail and calendar icons from the settings stylesheet in claude.ai, ChatGPT and VS Code Copilot Chat, in dark mode.
    - Removing `fonts.googleapis.com` in Settings was refused with `UNDECLARED_DOMAIN`, naming the stylesheet.
    - The designer's preview showed the agenda's calendar icon.
  - **PR #58 review follow-ups**, all low or nits.
    - The store port's `putSettings` doc names `INVALID_RESOURCE` and `UNDECLARED_DOMAIN`. The `resources` server option says it drops silently and names where refusals are reported. `readResources` says its limit is a write-side rule.
    - `.NET` treats a JSON-`null` caller record as no record, with a test: `dotnet test` 220.
    - Docs: the preview frame "connects nowhere" instead of "reaches no network", and the stylesheet delivery bullet explains why the operator's list only widens delivery.
    - A consistency sweep fixed the Resource domains intro (images, stylesheets and fonts), the trust model's exceptions, the `page` format rows, `CLAUDE.md`'s iframe invariant and the settings designer's own domain note.
    - The re-check confirmed all six fixes. Its two wording nits are fixed: `CLAUDE.md` names the stylesheets' fonts, and the settings designer's note scopes "when the server does not copy them inline" to images.

- **Designer preview island (2026-10-15, change `designer-preview-island`, on `feature/designer-preview-island`, designer/mcp minor pending release)**: the widget and theme designers can preview in the app template, framed, with the designer as a minimal MCP Apps host.
  - **The frame route** (`preview-frame.test.ts`, 7 tests).
    - `GET /preview-frame` serves `buildAppTemplate()` byte for byte.
    - The policy lists the operator's domains, then the principal's, deduplicated, in `img-src`, `style-src`, `font-src` and `media-src`.
    - `script-src` holds one hash per inline script, each recomputed from the body.
    - Anonymous: the operator's domains alone, and a bare `font-src 'none'` with none. A failing settings read degrades the same way and is logged.
    - API keys get 401; POST gets 404, or 401 when anonymous.
    - The Node adapter sends the core's status, headers and body, and no cookie.
  - **The island** (`preview-island.test.ts`, 17 tests, with a fake frame window).
    - `ping` is answered, and a method it does not host is refused with -32601.
    - Results are held until `initialized`; tree and CSS order match the in-page pipeline; one more result per edit through the same frame; nothing for an invalid draft.
    - `tools/call` is refused with no fetch, and `ui/message` composes nothing. Links: `https` opens with `noopener`, `javascript:` is refused.
    - The frame's height follows `size-changed`, and messages from a stranger window are ignored.
    - The scheme follows a pinned `appearance`, else the page, with the built-in palette as host variables.
    - Styles go only to the frame; dispose removes the frame and its listener; there is no frame without the option; the theme designer and the element attribute work.
  - **Parity** (`preview-island-parity.test.ts`). For the same widget and theme, the island's tree equals `render_widget`'s `structuredContent.tree`, and its CSS is the render's CSS byte for byte plus the badge rule. The island supplies exactly the host variables the template's bridge reads, with the built-in dark values.
  - **Chrome 151 against the example** (`examples/docker` web on a scratch SQLite, seeded). A probe widget had a styled title, a `api.dicebear.com` image, a `picsum.photos` image and 12 rows. The page added `.wg-title { text-decoration: underline wavy; letter-spacing: 7px }` and its own `h2.wg-title`.
    - **Isolation.** The frame's sandbox is `allow-scripts` and its origin `null`, and `window.parent.document` throws. The title is `rgb(4, 5, 6)` with no decoration and normal letter spacing. The page's `h2.wg-title` keeps the page color, and no page stylesheet carries the draft's rule.
    - **Images.** The declared image loads (`naturalWidth` 150). The undeclared one is blocked by `img-src`, as the console reports.
    - **Height.** The iframe is 331 px, the frame document's `scrollHeight`.
    - **Color scheme.** A dark page first gave `data-theme="dark"` on a white background. The template bridges eight tokens to host variables, and a host must supply them (design D7, revised). With the palette sent, the built-in preview turned `#0f131c` on `#e5e9f0`. A picked theme (google-light) stays light in both modes, as an explicit render theme does.
    - **Edits.** They patch the same frame.
  - **The example** (D9, revised). Its MCP endpoint declares only each person's domains, so the web service passes no operator list. `app.test.ts` checks the frames on `/api/preview-frame` for widgets and themes, and a person's policy carrying their domain.
  - **Tests.** Every happy-dom suite now sets `disableIframePageLoading`, so a mounted island never reaches the network.
  - **Gates.** Typecheck, `npm test` (1861 passed, 1 skipped), build, `pack:check`, docs check, `openspec validate --strict` and `--specs` (19), and `dotnet test` (209). Rerun after the cleanups, the docs review and verify's `ping` test: `npm test` 1863 passed (1 skipped), with the other gates green. `dotnet test` was not rerun, because the host bundle is untouched.
  - **Docs review before merge.** Two statements had gone stale and were fixed: the designers' "no network I/O" (they now cause the frame load) and the widget designer's "mounted through `mountWidget`" (in the app, the bridge mounts the preview). Also updated: the theme designer's page, the authoring module headers, `CLAUDE.md`'s layout line, design D1/D7, the stylesheet sentence in the widget-designer delta and the designer changeset.
  - **Staging (`designer-preview-island-764ca55`, ACR run `cj3s`, revision `widgentic-selfhost--0000029`, replacing the stylesheet probe).** Each response was saved to a file and then read.
    - The first request after the cutover still reached the old revision and returned `NOT_FOUND`. After that, the revision FQDN and `demo.widgentic.dev` both answer `/api/preview-frame` with 200.
    - The frame is 43,653 bytes. Its CSP carries the seeded `api.dicebear.com` and `*.pravatar.cc` in `img-src`, `style-src`, `font-src` and `media-src`, and its one `script-src` hash matches the served script. The response is `no-store` and `nosniff`, with no cookie.
    - The served bundle carries `/api/preview-frame` and the host palette variables.
    - **Chrome on the demo.** Editing `email-inbox-widget` previews in the frame: origin `null`, sandbox `allow-scripts`, height 339 px equal to the document's. The inbox showed 2 unread and both messages under google-light.
  - **Browser agent on staging (owner's check).** All three checks passed.
    - **Isolation and live updates.** A red star color and the title "Inbox LIVE" patched the preview without reloading the frame. Nothing crossed the frame either way. A style value meant to break out was refused inline by the Styles panel, and the action badge still shows.
    - **Images.** `api.dicebear.com`, `i.pravatar.cc` (through the wildcard) and an inline `data:` image load. `picsum.photos` and `placehold.co` are blocked, though both load directly in the page.
    - **Dark mode.** Under "(none — defaults)", the preview is the built-in dark.
    - **What it led to.**
      - The page no longer gets core's widget stylesheet in island mode. It had carried 55 unused `.wg-*` rules; a test now pins that the stylesheet is absent.
      - The person's dark default not being previewable is queued as BACKLOG THM-4.
      - The page having no CSP of its own is queued as EXM-1.
    - **Redeploy (`designer-preview-island-913cca6`, ACR run `cj3t`, revision `--0000030`).** Chrome on the demo: the page has no `style[data-widgentic]` and no `.wg-*` rule, and the frame renders the draft.
    - **Agent retest on `--0000030`.** The base stylesheet is gone, but the chrome stylesheet still held the two `.wgd-preview .wg-designer-action` marker rules. Those rules and `.wgd-preview` moved to a stylesheet that only an in-page preview injects. Tests pin it: absent in island mode, present in page mode.
    - **Redeploy (`designer-preview-island-7914e25`, ACR run `cj3u`, revision `--0000031`).** Chrome on the demo, after the Widgets and Themes tabs: no `style[data-widgentic]`, no `style[data-widgentic-designer-preview]`, zero `.wg-*`, `.wgd-preview` or `wg-designer-action` rules, and the frame renders.

- **Docs accuracy review (2026-10-14, on `bug/docs-accuracy`, mcp and webmcp patch pending release)**: a review of the hand-written docs against the code for the 13 changes archived since 2026-10-07. Four read-only reviewers, split by area, found about 65 issues, and four fixers on disjoint files corrected them.
  - **Agent-facing text.**
    - The authoring guides' safety rule said bindings "can never inject markup". It now states the Markdown bind exception, with the tag list from `MARKDOWN_TAGS`.
    - `truncate` reads "code points".
    - `render_widget` names field order among what a streamed call shows first.
    - The corpus changed only for `get_authoring_guide` and `tools/list`.
  - **Wrong statements fixed.**
    - The app template "declares no CSP domains".
    - The `:is()` selector rule, stated backwards.
    - The token-value list, and the read-side behavior for a refused stored token.
    - The store port missing `settings`/`putSettings`.
    - Text binds offering `prefix`.
    - The .NET app template "never" consulting the source.
    - The 0.12.0 CHANGELOG's nonexistent `UseWidgets`.
    - Which seeded entries come back on restart.
    - The README's "zero external references".
    - The shape of `list_themes`.
  - **Missing content added.**
    - Text formats and a Markdown section in the DSL page, and card `hints.fields`.
    - A person-facing Resource domains section, and themed streaming previews.
    - Keyed patching and `partialData` in core.
    - Tool annotations, and the `execute_action` codes.
    - That an omitted rate limiter means no limit, with a limiter built once.
    - The `./host`, `./authoring` and `./store/sqlite` entries.
    - A `Widgentic.Mcp` section, a run-your-own-server pointer and a NuGet footer link (the docs site had no .NET mention).
    - The `/settings` route and the full host config.
    - The seed, deployment key and `Dockerfile.source` on the self-hosting page.
    - .NET XML docs.
  - **Generator.** `docs-generate.ts` renders the label-style rule, and the authoring-contract page's descriptor row now reads as an object with a `description` row.
  - **Gates.** Typecheck, `npm test` (1835 passed, 1 skipped), build, `pack:check`, `npm run docs:check` (Mintlify validation, broken links, accessibility), `openspec validate --specs` (19), and `dotnet test` (209).

- **Card field order (2026-10-14, change `card-field-order`, on `feature/card-field-order`, core/mcp minor pending release)**: an agent reported that card fields always appear sorted by key.
  - **Diagnosis.** The renderer and the preview keep argument order. A production `render_widget` with `role, company, email, phone, location` echoed that order in both the HTML and the payload. Hosts that re-serialize tool arguments through a map sort object keys, and the owner's v85 card (`Avatar, Company, Email, Location, Phone, Role`) shows it. Only an array keeps order.
  - **`hints.fields`** (`field-order.test.ts`, 8 tests).
    - The hinted keys render in order: `role, company, email`, with no `avatar` row, and `title` untouched.
    - `title` and `subtitle` are never fields. Missing keys are skipped, a repeat renders once, and `[]` shows no fields.
    - A malformed value (`"a"`, `["a", 3]`, an object, `null`) renders byte-identically to no hint.
    - `labels` and `fieldFormat` still address keys (`Unit Price` → `$9.99`).
    - Analysis gives `NO_MATCH` for `fields.cost` and `INVALID_VALUE` for a string, and is silent for coherent fields.
  - **Steering.** `FIELD_ORDER_RULE` ends the card's `fields` hint and the table's `columns` hint, and the card's `dataShape` names `hints.fields`.
  - **Preview.** In the `bootTemplate()` harness, a streamed card with `fields: ["role", "company"]` previewed `company` alone while `role` had not arrived, then `role, company` without `avatar`, matching the result's tree.
  - **The corpus** gains `field order card`, as a render, a page and a preview: keys `role, Company, email` and a `NO_MATCH` for `fields.zzz`. The bare realm and V8 in .NET reproduce them. Existing cases changed only for `list_widgets` (the descriptor texts) and the app template (the preview code).
  - **Gates.** Typecheck, `npm test` (1835 passed, 1 skipped), build, `pack:check`, docs check, `openspec validate --strict` and `--specs`, and `dotnet test` (209).
  - **Staging (`card-field-order-a91fd7b`, revision `widgentic-selfhost--0000027`).** Each response was saved to a file and then read. A keyless `list_widgets` carries the card's `fields` hint and the table's `columns` hint, each ending in the field-order rule. A keyless card with `fields: ["role", "company", "email"]` over `avatar, company, email, role` renders `role, company, email`.
  - **The owner's host check** (a fresh conversation on the demo): asked for Olivia Martinez's card with Role, Phone, Company, Email and Location "in this exact order", the host rendered them in exactly that order, with Title Case labels and the email as a link. Before the change, a card like this rendered alphabetically.

- **Text formats and Markdown text binds (2026-10-13, change `template-text-formats`, on `feature/template-text-formats`, core/designer/mcp minor and webmcp patch pending release)**: BACKLOG DSL-1 and DSL-2.
  - **Text formats.** `count`, `join`, `truncate` and `pluralize` render on text binds and attribute values alike (`text-formats.test.ts`, 10 tests).
    - **count:** `1,234` from a 1 234-item list, and `n/a` stays itself.
    - **join:** `red, green and blue` from sparse items, and `Ada, Lin` through `field`.
    - **truncate:** `Quarterly…`, with `👍👍...` cut by code point.
    - **pluralize:** `No items`, `1 item`, `1,200 items`, `2 items` (a numeric string) and `3 items` (a list), with `lots` left raw. Polish renders `1 plik`, `3 pliki`, `5 plików` and `22 pliki`.
    - **Validation:** 15 malformed specs fail with `INVALID_TEMPLATE_NODE` at the bind's path, naming the field. The 23 existing format tests passed unchanged.
  - **Markdown** (`markdown.test.ts`, 14 tests).
    - **The subset:** paragraphs, `br`, strong and em (asterisks and underscores, nested, inside link text), code spans, `ol start`, flat lists with continuation lines, and links guarded like `href` (mailto, tel and relative pass).
    - **Literal text:** `snake_case`, escapes, headings, quotes, fences, images, tables and raw HTML. `<img onerror>`, `javascript:` and `data:` links yield no `img` and no `a`.
    - **Bounds:** empty values render nothing, and a 20 001-character value renders as one unparsed paragraph. 4 000 list items under `maxNodes: 1000` stop truncated.
    - **Pathological input:** five 20 000-character delimiter, bracket and backtick inputs finish in under a second each, deterministically.
    - **Validation:** a misplaced `markdown` (with `format` or `map`, non-boolean, on an attribute) is refused at its path.
  - **Styles.** In happy-dom, a Markdown link computes the theme's `accent`, block margins follow `spacing`, and the last block sits flush. happy-dom does not resolve `var()` in `font-family`, so the `font-mono` code font is left to a real-browser check.
  - **Designer.** The Markdown toggle hides `format` and `map` while on and restores `{ bind }`, with the preview rendering `.wg-md`. Attribute rows offer no toggle. Every format type is offered and commits a valid spec (truncate 80, join with `last` previewing `red, green and blue`, pluralize `3 items`). Editing a Polish `one` form keeps `few`, `many` and `locale`.
  - **Guides.** The MCP and WebMCP guides teach the text formats with engine-rendered examples and the Markdown bind with `MARKDOWN_TAGS` and `MARKDOWN_SOURCE_MAX`. The WebMCP DSL summary names every format type and `markdown: true`. A drafted widget with a join, a pluralize and a Markdown bind passes `checkStoredWidget` and renders `3 tasks`, `Ada and Lin` and the Markdown list.
  - **The corpus.** A `corpus-text` widget with 6 data sets (example, zero, one, many, Polish five, hostile Markdown) gives 10 cases; the example and the hostile value also run as a page and a preview. The bare realm and V8 in .NET reproduce them. Existing cases changed only for `list_widgets`, `get_authoring_guide` and the page stylesheet (the `.wg-md` block).
  - **The seed** gains `project-status-widget` (design D9), and the seed tests count 9 entries.
  - **PR #41 review findings.** Two Markdown cases broke the "literal text" rule.
    - An image `![logo](url)` rendered as a literal `!` plus a link, and with a refused URL it dropped the URL. It now renders as its whole source text.
    - A code fence collapsed into one inline `code` span. Fence lines, the fences and the info string included, now form one literal paragraph with `br` between lines, through the closing fence or the end of the value. A shorter closer does not close it.
    - The literal-text test fed both inputs without asserting on them. Exact-output tests and a spec scenario ("Images and code fences stay literal") now cover them, and the corpus's hostile Markdown case carries both. Redeployed as `template-text-formats-8439a95` (revision `widgentic-selfhost--0000026`). A keyed render saved to a file shows both literal: `![logo](https://example.com/logo.png)`, then `` ```js``, `const a = 1;` and `` ``` `` separated by `br`. The same render shows `No open tasks` for an empty list.
  - **Owner finding on staging (design D10).** In a host, the seeded widget rendered as intended: `1 open task`, `Ada and Lin`, the summary cut with `…`, and the Markdown notes with bold, a list, inline code and an accent link. In the designer, though, its `tasks` and `owners` binds showed "(off-schema)", because bind dropdowns offered scalar paths only. A bind whose format reads a list (`LIST_FORMAT_TYPES`) now completes array paths, in text and attribute positions. The regression test checks that a pluralize text bind and a join attribute bind on `tags` list it plainly, while truncate and plain binds still mark it off-schema. Redeployed as `template-text-formats-cd9dfc4` (revision `widgentic-selfhost--0000025`); the served `/app.bundle.js` carries the list-path rule.
  - **Gates.** Typecheck, `npm test` (1820 passed, 1 skipped, after D10 and the review fixes), build, `pack:check`, docs check, `openspec validate --strict` and `--specs` (19), and `dotnet test` (206).
  - **Staging (`template-text-formats-1c4899d`, revision `widgentic-selfhost--0000024`).** Each response was saved to a file and then read.
    - **The guide.** A keyless 2026-07-28 `get_authoring_guide` carries the TEXT FORMATS and MARKDOWN forms, the rendered examples (`red, green and blue`; `No items, 1 item, 1,200 items`), `MARKDOWN_TAGS` and the 20000 bound.
    - **A keyed render.** Through the deployment key, `render_widget` of the seeded `project-status-widget` (`format: "html"`) renders:
      - `3 open tasks` and `Owners: Ada, Lin and Grace`;
      - the summary cut with `…`;
      - the notes as `div.wg-md` with `strong`, `em`, a `ul` holding `<code>ttl=300</code>`, and a guarded runbook `a` with `rel="noopener noreferrer"`.

- **Tool annotations (2026-10-13, change `tool-annotations`, on `feature/tool-annotations`, `@widgentic/mcp` patch and `Widgentic.Mcp` 0.11.1 pending release)** — raised while integrating `Widgentic.Mcp` 0.11.0 into a .NET MCP server: no tool carried annotations, so hosts assumed the riskiest hints.
  - **The values.** Each definition carries all four hints. The discovery tools and `preview_widget` are read-only, non-destructive, idempotent and closed-world, and `render_widget` is the same but open-world (image inlining). `execute_action` alone declares a write. A `handlers.test.ts` case pins all nine.
  - **Node.** Over the SDK, every tool's `tools/list` annotations deep-equal its definition's (`sdk-interop.test.ts`).
  - **The host bundle.** `definitions()` carries them with no code of its own; the host test's deep-equal now covers them, and each served tool is read-only. The corpus did not change, since it holds no definitions.
  - **.NET.** `WidgenticTool` deserializes the bundle's `annotations` into `Tool.Annotations`. A C# SDK client sees every widgentic tool's annotations equal to the bundle's, and `list_widgets` read-only, non-destructive, idempotent and closed-world (`ListedToolsCarryTheBundlesAnnotations`).
  - **Docs.** The generated MCP tools reference lists each tool's annotations.
  - **Gates.** Typecheck, `npm test` (1764 passed, 1 skipped), build, `pack:check`, docs check, `openspec validate --strict` and `--specs` (19), and `dotnet test` (196).
  - **Staging (`tool-annotations-97b3c8c`, revision `widgentic-selfhost--0000023`).** A keyless 2026-07-28 `tools/list`, saved to a file, lists 9 tools. Seven are read-only, non-destructive, idempotent and closed-world, `render_widget` is the same but open-world, and `execute_action` is a write (not read-only, destructive, not idempotent, open-world).

- **Field labels (2026-10-13, change `field-labels`, on `feature/field-labels`, core/mcp minor and webmcp patch pending release)**
  - **Rendering.** `hints.labels` relabels card field keys and table headers, and image `alt` takes the label, in 9 core tests.
    - **Column order.** `hints.columns` order is honoured, with the cells following.
    - **Fallbacks.** An unlabelled or blank-labelled key shows the key. A render without `labels`, or with `{}` or a non-object, is byte-identical to one without hints, and the 521 existing core tests passed unchanged.
    - **Escaping and other hints.** `<b>Total</b>` is escaped, and `fieldFormat` still addresses the key.
  - **Diagnostics.** `labels.last_name` on a card without that field gave `NO_MATCH`. `""`, whitespace, `1` and `null` labels gave `INVALID_VALUE`, and so did a non-object `labels`. Table labels are checked against columns, and coherent labels are silent.
  - **Steering.** `LABEL_STYLE_RULE` (Title Case unless the user asks otherwise, keys kept) is in the card and table descriptors' `labels` hint, the MCP authoring guide and the WebMCP guide, verbatim. `render_widget` asks for `widget` first and `hints` before `data`.
  - **Previews.** In the `bootTemplate()` harness, a streamed table with hints before data previewed `First Name` from its first row. A card first previewed `order_total`, then `Order Total` once the hints arrived, matching the result's tree.
  - **Themed built-in previews (design D8, an owner finding from the default-themes testing).**
    - **One CSS request per run.** With `serverTools`, a streamed `card` requested `preview_widget` once with `{ widget: "card" }` only, applied the answer's `css` (the caller's default theme) and kept the client-built card. More data asked nothing.
    - **A changed theme.** A theme still arriving asked nothing; a settled `theme: "dark"` asked once more.
    - **Groups and failures.** A group of built-ins asked with `{ items: [] }`. No request was made without `serverTools`, and none after a rejected one.
    - **The result wins.** A CSS answer arriving after the result was discarded.
    - **The server answers each kind.** `preview_widget` returns the default theme's CSS for `card`, `table` and `tree` with no data.
  - **The corpus.** A labelled card and table, each as a render, a page and a preview: 6 new cases. Existing cases changed only for `list_widgets`, `get_authoring_guide` and the app template, from the new texts. The bare realm and V8 in .NET reproduce all of them.
  - **Gates.** Typecheck, `npm test` (1762 passed, 1 skipped), build, `pack:check`, `openspec validate --strict` and `--specs` (19), and `dotnet test` (195).
  - **Staging (`field-labels-b4119c0`, revision `widgentic-selfhost--0000022`).**
    - **Steering.** `render_widget` asks for hints before data, and `list_widgets` carries the rule in the card and table `labels` hints.
    - **Labels.** A labelled card renders `First Name` and `Order Total`, and a table `First Name` and `Last Name`.
    - **The theme.** `preview_widget` with `{ widget: "card" }` answers 12,493 bytes of CSS carrying the light default's `#1a73e8`.
    - **The template.** The served template carries `requestThemeCss` and `labelOf`.
  - **The owner's host check on claude.ai (task 6.2).** The prompt asked for a customer card and an orders table and named no label style.
    - **Title Case by default.** The card showed Account Manager, First Name, Last Name, Last Order Date and Lifetime Value on the default theme. The table's call carried Title Case `hints.labels` (the Google theme uppercases headers, so the call data was the check).
    - **Streaming.** Built-in previews streamed in the default theme. The first chunk may show the base theme for the round trip of the CSS request, then switch, which the owner accepted.
    - **The user's style wins.** Asked again for the base light theme and lower-case labels, the table showed `order id`, `order date`, `order total` and `payment status`. Those are labels with spaces, not the keys, on the base light theme.

- **Per-principal resource domains (2026-10-13, change `principal-resource-domains`, on `feature/principal-resource-domains`, core/designer/mcp minor and `Widgentic.Mcp` 0.11.0 pending release)**
  - **Smoke test before implementation (2026-10-12).** Staging ran a local probe image (`principal-resource-domains-probe-c07d459`, revision `--0000020`). It declared `https://api.dicebear.com` and `https://*.pravatar.cc` for every caller, skipped inlining for them, and left `picsum.photos` undeclared as the inlined control.
    - **Every host honors declarations.** claude.ai web, ChatGPT desktop and VS Code Copilot loaded images from both the exact and the wildcard origin, including all 30 faces of a 30-row table, past the 24-source cap.
    - **Every host enforces `img-src`.** In 30 undeclared photos, rows 25–30 stayed blank on all three, so the declared images loaded because of the declaration.
    - **claude.ai caches the policy for the page session.** Its frame header copied our entries verbatim into `img-src`, `script-src`, `style-src`, `font-src`, `media-src` and `worker-src`. After the deploy changed the declaration, a new conversation in the same tab still enforced the old policy; a reload picked up the new one.
  - **The rule.** The core parser accepts `host`, `*.host` and either behind `https://`, and refuses every form the widget-store requirement lists, in 14 unit tests. The store, the designer, the Node assembly and the host bundle all use it.
  - **The store.** The contract suite runs the domain scenarios against memory, SQLite and the Cosmos fake: canonical storage, `INVALID_DOMAIN` naming the entry, `INVALID_SHAPE` at 21 entries, an empty list removing the section, independence from `defaultThemes`, and one shared read for themes and domains. Out-of-band records with a refused entry are read without it, and the file, SQLite and Cosmos diagnostics name it. A record without the section reads as no domains.
  - **The Node assembly.** Over the SDK, the declaration and the read content carry canonical origins, refused entries are dropped, and a list of only refused entries declares nothing.
    - **Inline-last.** In 10 declared and 20 undeclared thumbnails, all 20 undeclared and the first 4 declared were fetched, and the other 6 kept their URLs, unfetched.
    - **The note.** For 26 undeclared and 6 declared sources it reads "2 image source(s) left external (fetch cap: 2, byte budget: 0), and 6 on declared resource domains (fetch cap: 6, byte budget: 0)".
    - **Wildcards.** A wildcard ranked `a.b.example.com` as declared and the apex as undeclared.
    - **No domains, no change.** With no domains configured, the corpus is unchanged.
  - **The host bundle.** `resources()` reports the declared list, operator entries first. For one operator list and one settings record it equals the Node assembly's declaration, compared over a real SDK client. Refusals are listed under `resourceDomains` (with an index) and `settings` (`resourceDomains.<entry>`).
  - **The corpus.** Three domain configurations (operator, settings, both) each add a `resources` case; no existing case changed. The bare realm and V8 in .NET reproduce them.
  - **.NET.** 189 of 189.
    - **Startup.** `ResourceDomains` are declared canonical on list and read, followed by the startup settings section. A refused operator domain stops startup naming `ResourceDomains[0]`, and a refused setting naming the settings source.
    - **Per caller.** In Merge a principal's section replaced the startup one, and Replace kept only the operator list. A refused principal domain was logged as the caller's `INVALID_DOMAIN` and never blamed on the startup record. 32 concurrent reads on a pool of 4 never crossed principals.
    - **Failure and listing.** A throwing source still served the template, with the startup declaration and a log line. The list filter rewrote only the app entry and left the registered declaration untouched.
    - **The sample.** Over HTTP, keyless callers declare the seed's `https://api.dicebear.com` and `https://*.pravatar.cc`, `merge-demo` adds `https://ui-avatars.com` (its section lists all three, since a caller's section replaces the startup one), and `replace-demo` declares nothing.
  - **The designer and the example.** The settings designer records canonical entries, keeps invalid ones as typed with the rule's reason, clears an emptied list, stops adding at the limit, refuses a malformed list on load, and goes inert in read-only mode, in 35 tests. The self-host endpoint's composition, now in `principal-server.ts`, declares each principal's own domains and none for anonymous callers. It reads settings once per request, applies a saved change on the next request, and logs an unreadable record without failing.
  - **Gates.** Typecheck, `npm test` (1735 passed, 1 skipped), build, `pack:check`, `openspec validate --strict` and `--specs` (19), and `dotnet test` (189).
  - **Staging (`principal-resource-domains-41aabd3`, revision `widgentic-selfhost--0000021`).**
    - **The seed.** It wrote 8 entries, settings sections included.
    - **The declaration.** Keyed, the listing and the read both declare `https://api.dicebear.com` and `https://*.pravatar.cc`; keyless, neither declares any domain.
    - **Inline-last, from the served bytes.** A 3-source render inlined all 3. 30 declared faces gave 24 `data:` sources and 6 URLs, and so did 30 undeclared photos.
    - **claude.ai web.** In a new conversation, row 24 of the 30 faces was a `data:` URI and row 25 kept its pravatar URL, and all 30 faces showed. Of the 30 undeclared photos, rows 25–30 were blank.
    - **The Settings round trip on claude.ai web.** The owner removed both domains in the demo's Settings and saved, then reloaded the client and opened a new conversation. Rows 1–24 of the 30 faces were still inlined and rows 25–30 were blank, so the saved change reached the frame and fell back to inlining. With the domains restored in Settings, after another reload, all 30 showed again, rows 25–30 loaded from the declared domain.
    - **ChatGPT and Copilot** were not rerun on this path; the smoke test covered both on the same two domains.
  - **The .NET sample in VS Code Copilot (owner, local HTTP).**
    - **No key.** pravatar faces and DiceBear avatars showed, from the seed's two domains. ui-avatars initials (declared only by `merge-demo`) and picsum photos (never declared, and .NET does not inline) were blank. The 30-face table loaded straight from the declared domain.
    - **The `merge-demo` key, in a new conversation.** The ui-avatars initials showed as well. The principal's section listed the seed's two domains plus `ui-avatars.com` and replaced the startup section. Picsum stayed blank, and the faces loaded directly.

- **Default themes from settings, in the host bundle and .NET (2026-10-12, change `dotnet-principal-catalogs`, on `feature/dotnet-principal-catalogs`, `@widgentic/mcp` minor and `Widgentic.Mcp` 0.11.0 pending release)**
  - **The bundle.** `createWidgenticHost` takes a `settings` record.
    - **Same as the Node path.** For `{ light }`, `{ dark }`, two defaults and one theme for both modes, the host's `render_widget` (slim and as a page), `preview_widget` and `list_themes` output equals the Node path for a principal whose stored settings choose the same defaults (memory store and `composeThemes`).
    - **Refusals.** A default naming `ghost`, `light` or `dark`, or a configured `dark` that was refused, is reported as `UNKNOWN_THEME` under section `settings` and keeps the built-in. A malformed record is reported as `INVALID_SHAPE`. `null`, `{}` and no record leave every output unchanged.
    - **Node-free.** The rules moved to `store/settings-rules.ts`. The boundary test keeps the bundle's graph free of `node:`, and the store's refusals are unchanged.
  - **The corpus.** Five named settings configurations (light only, dark only, two defaults with styles, two defaults with one styled, one theme for both), each with a render, a page, a preview, an explicit theme, the listing and a widget page: 30 cases.
    - **The rules hold.** A lone styled default's styles are unscoped. Two styled defaults scope with `:where()`. One theme for both is emitted as explicit. An explicit theme drops the defaults. Pages take the light default only.
    - **Every runtime agrees.** The bare realm and V8 in .NET reproduce all 30 byte for byte. No existing case changed.
  - **.NET.** 177 of 177 on Windows 11, .NET SDK 10.0.401.
    - **Startup.** The seed's `google-light`/`google-dark` settings put each token block under its mode selector. `ghost` stops startup with `UNKNOWN_THEME` naming `settings JSON`, and an unreadable file stops it with `INVALID_JSON` naming the file.
    - **Merge and Replace.** A principal's `{ dark: "night" }` gave `light`/`night` while another principal kept the seed's defaults. Replace gave the built-ins.
    - **Refused settings.** A principal's `dark: "ghost"` was logged as `the caller's setting 'defaultThemes.dark'`, and an unreadable record as `INVALID_JSON`; neither log line carried the name. A principal's refused `google-dark` left the startup dark default unresolved, which was logged as a startup setting skipped for that caller.
    - **Previews and pages** carried the caller's light default and not another caller's.
  - **The sample** loads the seed's settings. Over stdio and HTTP it reports `google-light`/`google-dark`; `merge-demo` reports `google-light`/`merge-demo-dark` and `replace-demo` the built-ins.
  - **The owner's local retest (task 6.4).** The sample ran over HTTP on `localhost:3002` with demo keys, and each principal was connected as its own server, each in a fresh conversation. No staging deploy, by the owner's decision.
    - **No key:** the seed's two widgets and the `google-light`/`google-dark` defaults.
    - **`merge-demo`:** its own inbox, headed "Merge demo inbox", in place of the seed's, and `merge-demo-dark`'s green accent as the default on a dark host.
    - **`replace-demo`:** only the built-in kinds and `release-notes-widget`, under the built-in dark theme.

- **Theme styles, settings and default themes (2026-10-11, change `theme-styles-and-defaults`; core, designer and mcp minor, webmcp patch pending release)**
  - **Core.** The registry merges `extends` styles per selector, then per property; refuses a malformed `styles` map with `INVALID_THEME`; and holds one default per mode (built-ins until set, unregistered names refused). `themeStylesToCss` matches the widget generator unscoped and prefixes every selector part with `:where(<scope>) ` when scoped. A computed-value check in happy-dom (fresh document per case) shows a scoped rule applying only inside its scope and losing a tie to a later widget rule.
  - **Store.** The contract suite runs on memory, SQLite and Cosmos. It covers: settings round-trip; section-level replace, where `null` and an empty section remove; refusals that change nothing (`UNKNOWN_THEME`, `INVALID_SHAPE`, `UNKNOWN_PRINCIPAL`); `THEME_IN_USE` naming both modes; no crossing between principals; and the settings record leaking into no entry listing. Out-of-band tests on SQLite, Cosmos and the file store cover a later version's section (ignored on read, kept on write), a dangling default (diagnostic, built-in kept) and a pre-styles theme row loading unchanged. A malformed out-of-band `styles` is skipped with a diagnostic.
  - **Authoring.** `styles` round-trips through `PUT /themes/<name>`. `/settings` is read and replaced; a smuggled `principalId` is ignored; `THEME_IN_USE` maps to 409; and the core handler answers as the Node adapter does.
  - **Output.**
    - **Theme styles.** They come before kind styles, then the theme's declarations, in the template channel, `page`/`app` documents and `preview_widget`; unsafe entries reach no output.
    - **Defaults.** Light-only, dark-only and both-modes defaults; an explicit theme replaces the defaults (deep-equal to a registry without them); documents use the light default only.
    - **No change without defaults.** With no defaults set, output is deep-equal across all five formats.
    - **App template.** Booted with its static stylesheet, a light default reaches `--wg-accent` on a light host and not on a dark host.
    - **Conformance corpus.** It gains a styled theme (`corpus-styled`: two renders and a preview). Its diff touches only `list_themes`, `list_theme_tokens`, `get_authoring_guide`, the `theme unknown` message (which lists the themes) and the three new cases; no existing render changed. `dotnet test` passes 123 of 123 on the regenerated corpus.
  - **Designer.**
    - **Theme designer.** Edits styles in the shared Styles panel, which sits right under the preview as in the widget designer and goes inert in read-only mode; the Tree and JSON views keep each other in step. Export omits an emptied `styles`, and a malformed import is refused. The preview shows a theme rule's computed colour and flags a `body` rule while keeping it out of the CSS.
    - **Widget designer.** The selected theme's class colours the draft, and the draft's own rule wins. Choosing "none" removes the rule and the draft's `themeStyles`. `previewTheme` opens with the named entry selected and applied from the first render (computed colour), applies a tokens-only entry, ignores an unknown name, and survives `loadWidget` with its styles. The selector keeps a chosen name even when another entry has the same content (a stored theme with empty tokens beside the built-in `light`).
    - **Settings designer.** Mounts alone; registers its element only on the explicit call; edits and notifies; lets one theme serve both modes; shows a missing theme as unavailable; passes unknown sections through; refuses a malformed record; is inert when read-only.
    - **WebMCP.** `theme_load`/`theme_get` round-trip `styles`, and a token merge keeps them.
  - **Self-host example.** The seed writes `settings` after the themes, never over a held section; refusals are logged per section, and the demo seed sets `google-light`/`google-dark` (7 written). An in-browser app test boots `main.ts` in happy-dom against the real authoring handler and checks: the widget designer opens on the light default; the Themes list marks the default; picking a default in Settings and saving moves the mark; deleting the default shows `THEME_IN_USE`; a newly saved theme becomes a choice.
  - **Review fixes (two reviews of PR #29, deduplicated).**
    - **Action re-renders:** a named theme with styles survives an `execute_action` re-render (same `css`), a styleless theme adds no `themeName`, and a vanished name falls back to the held tokens.
    - **Guards:** they drop comment tricks, `:not(.wg-x)`, `:is(.wg-a, body)`, attribute-hidden `.wg-`, combinator-led parts, and `image-set(`/`src(`, in styles and token values. They keep `:has(…, …)`, `:not(:last-child)` and root-anchored rules; a root-anchored rule scopes on its root compound and computes only in its scope.
    - **Two defaults:** each theme's padding applies on hosts of its mode, in the template (computed). The dark-host value equals a no-defaults render's.
    - **Cosmos races:** a theme removed mid-`putSettings` gives `UNKNOWN_THEME`, a default set mid-`removeTheme` gives `THEME_IN_USE`, and a section added meanwhile survives. These are checked through the fake's transactional batch with etags.
    - **Composition:** it survives a missing or throwing `settings` and an invalid-but-stored default, with diagnostics.
    - **Designers:** `loadTheme` drops stale styles; the JSON tab refuses a malformed map and maps `{}` to none; the settings element takes `themes` before and after connecting.
    - **Example:** `previewThemes` merges `extends` in any order; unread settings open read-only without Save.
    - **Corpus:** it changes only in the styled-theme cases (`themeName`) and the guide text; `dotnet test` passes.
  - **WebMCP agent findings (2026-10-12, an agent driving the designers' tools).**
    - **Load tools refuse what saving would:** `draft_load` and `definition_check` refuse a built-in kind (`table`, `RESERVED_KIND`) and a kind with a space (`INVALID_IDENTIFIER`) with `REJECTED`, leaving the draft as it was; `theme_load` refuses `light` (`RESERVED_THEME`) and `my theme` (`INVALID_IDENTIFIER`). Both used to load and fail only at Save.
    - **Data shape:** a definition without `dataShape` checks `ok` and carries a `dataShape` diagnostic, shown under the field in the widget designer. Both guides now call it strongly recommended rather than required.
    - **Preview theme:** `widget_theme_set` with empty tokens leaves the selector on "none" (it switched to "Light", whose token map is also empty).
    - **Theme designer:** typing `dark` into Name shows `RESERVED_THEME` inline, and typing `ocean` clears it.
    - **Corpus:** only `get_authoring_guide` changed (the `dataShape` text).
  - **WebMCP agent retest on staging `6c7eace` (2026-10-12).** Four findings fixed. Two remained:
    - **`widget_theme_set` dropped the person's theme:** it now layers over the chosen preview theme. A test chooses `google-light`, sets `accent`, and checks the selector and `previewTheme` still name it with the other tokens kept; `{}` returns its tokens exactly. In the designer the same holds for a theme with styles; with nothing chosen, a map is the whole theme.
    - **`schema_load` accepted `type: "banana"`:** it still loads (the store accepts it on purpose) but returns `warnings` naming `schema.properties.kind.type`, the schema designer shows the warning until the type is fixed, and an inline `dataSchema` warns in the widget designer and in `definition_check`. Core tests cover unknown names (and that validation still lets anything through), unrunnable patterns, misshapen keywords through `items`, and silence on every supported type and on unknown keywords.
  - **Second review round at `6c7eace` (2026-10-12, two re-reviews, deduplicated).**
    - **Guards (core):** dropped now: `.wg-a[title="("], body`, `body:not([title=")"] .wg-x)`, `body:not([x="]].wg-"])`, unclosed `:is(` and `[title`, an unclosed string, and the values `calc(1px + (2px`, `foo(`, `1px)` and `"open`. Kept again: `:is(.wg-btn, .wg-link):hover`, `:where(.wg-card) h3`, and a quoted `"("` in an attribute test or a value. `.wg-a[title="("], .wg-b` scoped to dark scopes both parts, and a computed check shows `.wg-b` unstyled on a light root. Token values refuse `u\72 l(…)`, unclosed brackets and unclosed strings.
    - **Stored themes:** an old-shape theme with `accent: "#0b5fff /* brand */"` reads without `accent` and with a diagnostic, in SQLite, Cosmos and the file store. It still serves as the light default, a write of the same entry is refused, and the Cosmos document is left as it is.
    - **Cosmos:** the fake now throws batch failures the way `@azure/cosmos` 4.10 does, as a plain `Error` wrapping the message. `putSettings` and `removeTheme` then give `FORBIDDEN` for a permission refusal and `STORE_ERROR` for a 503. A stored dangling dark default no longer blocks an update that leaves it alone.
    - **Scoping:** a light default's styles are unscoped when the dark default has none (a styleless theme or the built-in), and the same holds the other way round.
    - **Designers and WebMCP:** `widget_example_data_set` on a draft the person kinded `my widget` succeeds, with `INVALID_IDENTIFIER` in its diagnostics, and `theme_tokens_set` on a theme named `dark` succeeds; loading `table` or `light` is still refused. The Styles JSON tab's parse error clears after a load, and the widget designer's JSON tab is gated on the styles shape.
    - **Settings element (headless Chrome):** a page sets `themes` on `<widgentic-settings-designer>` before the bundle loads. Before the upgrade it is an own property; afterwards it is not, and the light choices are `["", "ocean", "night"]`. happy-dom does not upgrade, so the unit test exercises `upgradeProperty` directly.
    - **Example apps:** after a failed read, a later Settings visit opens the stored `google-light` and saving keeps it. The demo restores an autosaved draft as the person left it.
  - **Third review round at `5969a8b` (2026-10-12), triaged for the normal flow (D17).**
    - **Guards:** a newline inside a quoted string, in a selector, a value or a token value, is dropped, including `:where(.wg-a[x="⏎], body, [y="⏎])`. A rule after such an entry in the same sheet still applies (computed check). A selector list split across lines is still kept. `:is(` nested 2,000 deep is refused without throwing, and three levels still render.
    - **Cosmos:** a 429 whose diagnostics carry `LSN: 403` stays `STORE_ERROR`, and the batch failure is logged with the service's first line.
    - **Self-host example:** a new draft given the kind `my widget` keeps that kind across a trip to the Themes tab, flagged `INVALID_IDENTIFIER`, with no "load failed".
    - **Old-shape tests:** the Cosmos test now also refuses the write, and the file-store test serves the trimmed theme as the light default.
  - **Browser agent: false "unknown schema" (2026-10-12, staging `5969a8b`).** The agent found that `definition_check`, and `draft_get` on a widget opened with Edit, called the saved `email-inbox` reference unknown. Its report traced this to WebMCP deriving diagnostics without the host's schemas. Regression tests:
    - A designer mounted with `email-inbox` and opened on a referencing widget gives no `schemaRef` from `draft_get` or `definition_check`.
    - A bad example gets `INVALID_TYPE` against the resolved schema.
    - The typo `email-inbx` is still reported.
    - Both schema forms together are `REJECTED`.
    - With no designer mounted, the reference is unverified (`diagnosticsDerived: true`) rather than unknown.
    - In the designer, `getDiagnostics()` and `checkWidget` give the same answers, without touching the draft.
  - **Fourth review round at `8841d0a` (2026-10-12, D19).**
    - **WebMCP:** `definition_check` with a `widget` source that counts its calls and a `widgetIfMounted` source resolves `email-inbox` and calls `widget` zero times. A numeric, spaced or empty `dataSchemaRef` and a `null` `dataSchema` are `REJECTED` by `draft_load` and `definition_check`, and `draft_get` still works afterwards.
    - **Designer:** with no `schemas`, a reference is not unknown; with `schemas: []`, it is. A malformed initial kind shows the empty state with `INVALID_IDENTIFIER` in the banner.
    - **Self-host app:** after picking `ocean`, showing Widgets again keeps the same designer root and the pick, and a trip to Themes and back remounts with `ocean` still picked.
    - **Cosmos:** a batch refused with an explicit `StatusCode: 403` or a firewall message gives `FORBIDDEN`. A request-level `StatusCode: 404` gives `STORE_ERROR` for `removeTheme` and `putSettings`, and the theme is still stored.
    - **Unit tests:** `list_theme_tokens` carries `TOKEN_VALUE_RULE`, and an adapter without `settings` composes with no diagnostics.
  - **Re-review at `b0f0e74` (2026-10-12).** The shared example sources return the widget designer from `widgetIfMounted` while its section is shown and nothing once another section is shown. Without that source, the check leaves a reference unverified rather than unknown (existing test). A malformed `dataSchemaRef` is refused with `INVALID_SHAPE`, as the store refuses it.
  - **Reviewer 1 at `1fbce0e`: ready to merge.** Its two non-blocking notes are addressed:
    - An app-level test (`app-webmcp.test.ts`) boots the self-host page on a stand-in model context. On Widgets, the check resolves `inbox` through the designer. On Data schemas, a schema `orders` saved meanwhile is not reported unknown (`diagnosticsDerived: true`), and the view stays on Data schemas.
    - The spec no longer says "never" for View and Edit mode.
  - **Browser agent on staging `1fbce0e` (2026-10-12).** `theme_load` with a `div` selector, a `red /*` value and a `9x` property, beside a safe rule, returns `ok` with three `diagnostics.styles` entries: a skipped selector, value and property. The value's message no longer quotes the property-name rule. `theme_tokens_set` and `theme_get` report the same audit. Queued, because it predates this change: link and host warnings at load (AGT-5). `extends` was removed instead (see below).
  - **Theme `extends` removed (2026-10-12, D20).**
    - An entry registered with `extends: "dark"` is held as registered: no dark tokens and no `extends`.
    - Derived themes in the tests merge `darkTheme` themselves.
    - `previewThemes` offers saved entries after the built-ins, and leaves out an entry the registry refuses.
    - The conformance corpus is unchanged, since no case used `extends`.
  - **Reviewer 1 at `b889ac5` (2026-10-12).** `theme_load` with `extends: "dark"` returns, and `theme_get` holds, an entry without `extends`, as does a designer created with such an `initialTheme`. The changesets mark the removal as breaking.
  - **MCP Apps border preference (2026-10-12, D21).** Over the SDK, both with and without `resourceDomains`, the app resource's declaration carries `_meta.ui.prefersBorder: false`, and its read content carries the same `_meta.ui`. The .NET protocol test (`AsksTheHostForNoBorder`) sees the same on `resources/list` and `resources/read`, with no `csp` when no domains are configured; `dotnet test` passes 124 of 124. The corpus changes only in the bundle's `resources()` descriptor.
  - **Preview containment (2026-10-12, D22, browser agent).**
    - **Designer:** a draft style coloring `.wg-title` colors the previewed title, and a `.wg-title` element outside the designer keeps its own color (computed).
    - **Example pages:** a structural guard checks that every element-led rule in the three example pages carries `:where(:not(.wgd-preview *))`. happy-dom matches that selector on descendants too, so it cannot compute it.
    - **Headless Chrome** (`tools/probe-computed.mjs`), on pages built from both stylesheets: the page header has 12px bottom padding and the widget header 0px, and the page button has `cursor: pointer` and the widget button the default.
  - **Demo seed restyled (2026-10-12, from the browser agent).** The two Google-inspired themes now carry shared classes: `.wg-panel`, `.wg-title`, `.wg-item`, `.wg-chip`, card and table refinements. The agenda and inbox widgets use them. A later pass from the agent added cancelled and declined states (`.wg-item-cancelled`, `.wg-chip-no`), card and table layout fixes, and `yyyy-MM-dd` dates throughout. Under `auditStyles` every theme and widget style entry passes, and the theme tokens validate; the largest entry is 4,814 bytes. The .NET sample's seed is regenerated from it (`conformance:generate`), and `dotnet test` passes 124 of 124. The corpus is unchanged.
  - **Hosts (2026-10-12):** staged as `7373de2` on `demo.widgentic.dev`; the owner reported that the checks in fresh conversations went well. widgentic.dev's Settings section follows in the apps change `adopt-theme-settings`.
- **Per-principal catalogs in .NET (2026-10-11, change `dotnet-principal-catalogs`, on `feature/dotnet-principal-catalogs`, `Widgentic.Mcp` 0.11.0 unreleased)**
  - **The suite.** Windows 11, .NET SDK 10.0.401: 136 of 136.
  - **Composition, through the resolver with real principals.** Two principals over 32 concurrent calls on a pool of 4 never saw each other's kinds. In Merge a principal's `email-inbox-widget` was listed once, with its own description, and a principal theme extending `google-dark` inherited its tokens. Replace listed the built-ins and the principal's widget only, and a catalog's own `Replace` overrode the default for its principal alone. On a pool of one, B did not see A's entries, and an entry added to A's catalog appeared on A's next call.
  - **Refusals.** A repeated `kind` served the first entry and logged `widgets[1]`. A principal's `<script>` widget, posing as `email-inbox-widget`, was refused (`INVALID_TEMPLATE`) and still removed the seed's inbox. Unreadable JSON was logged as `INVALID_JSON`. No log line contained the entry's contents.
  - **A failing source** answered `CATALOG_UNAVAILABLE` without the exception text, which held a fake address, and logged the failure at Error; the other principal kept working.
  - **Global surfaces.** `list_theme_tokens`, `get_authoring_guide`, `tools/list` and the app template never called the source. Over the in-process protocol, `list_widgets` did, and a host tool rendering a principal-only kind through the `RequestContext` overload equaled `render_widget`.
  - **The sample over HTTP**, launched as a process with two random keys from environment variables. The keyless client listed the seed. `merge-demo`, keyed by `x-api-key`, listed its inbox once with its own description plus `merge-demo-dark`. `replace-demo`, keyed by `?key=`, listed `card` and `release-notes-widget` without the seed's kinds and rendered its widget. The server's output, Information logs included, never contained either key.
  - **NOT yet done.** Staging (6.4), and the owner's per-principal host retest.

- **Wire schemas from the exported definitions (2026-10-11, change `derived-input-schemas`, `@widgentic/mcp` minor pending release)**
  - **The wire.** `server-wiring` lists the tools of `createWidgenticServer()` and finds every `inputSchema` and description equal to the exported definition's, for all nine tools: nothing added (no `$schema`), nothing missing.
  - **One validation path.** Over the protocol, `{ kind: "card", data: 1 }` comes back as the handler's `MISSING_FIELD` on `widget`, naming the mix-up, and `format: "pdf"` as `INVALID_TYPE` on `format`. Neither is the SDK's "Input validation error".
  - **The corpus** gains the mix-up cases for `render_widget` and `preview_widget`, so `.NET` is held to the same message.
  - **`execute_action`** refuses a string, array or null `args`, a numeric `at` and a numeric `item` with `INVALID_TYPE` on that path, with nothing fetched.
  - **Staged (2026-10-12).** `demo.widgentic.dev` at `theme-styles-and-defaults-7373de2` carries this change. Keyless `tools/list` serves 9 tools whose input schemas equal the exported definitions, and a raw `render_widget` call with `{ kind: "card", data }` answers `MISSING_FIELD` on `widget`, naming the mix-up. The owner reported the host retest went well.
- **The Node assembly on SDK 2.x, both protocol eras (2026-10-09, change `mcp-sdk-v2`, `@widgentic/mcp` minor pending release)** — Windows 11, Node 24.
  - **Wire schemas.** The published 0.9.0 (SDK 1.31) and this assembly list the same nine tools, with identical names, descriptions, `_meta` and input properties. The one difference is `$schema` on the three zod-backed inputs: JSON Schema 2020-12 instead of draft-07.
  - **In process** (`server-wiring`), through `createMcpHandler`:
    - a 2026-07-28 MCP Apps client gets the slim output;
    - a 2026-07-28 client without UI gets the full output, even with `WIDGENTIC_ASSUME_UI=1`;
    - a stateless 2025-era client follows `WIDGENTIC_ASSUME_UI` both ways;
    - both eras list the same tools and render the same `structuredContent`.
  - **Examples, smoke-run with real clients.** stdio (`serveStdio`) and the docker service (`createMcpHandler` + `toNodeHandler`) each served a 2025-era client (full output) and a 2026-07-28 Apps client (slim output). The docker preflight allows `Mcp-Method`. Raw smokes 2 and 4 above passed against the docker service: 9 tools with the steering text, and slim from the request's own capabilities.
  - **Response shape.** 2025-era responses over HTTP are now single-event SSE (the SDK's stateless fallback) instead of JSON.
  - **Staging-shaped run, local.** The `Dockerfile.source` steps were replayed without Docker:
    - the four packages packed from the branch;
    - the docker example's manifest rewritten to the tarballs;
    - `npm install --omit=dev --install-links`.

    The result: one copy of `@widgentic/mcp`, SDK `server`/`node`/`client`/`core` 2.x, `ext-apps` 2.0.3, no 1.x SDK, and the import smoke passes. `web` and `mcp` ran as on the demo, with the `/mcp` proxy, the `demo.json` seed (6 written) and a throwaway deployment key from a file (`read, execute`). Through the proxy, with that key:
    - a 2025-era client and a 2026-07-28 Apps client each listed 9 tools and the two seeded widgets, and read the app template;
    - the 2025-era client got the full output, the 2026-07-28 client the slim output;
    - raw smokes 2 and 4 passed, and neither log carries the key.
  - **Staged and retested (2026-10-09).** The branch ran on the self-host demo, built from source. Served bytes are recorded in the apps RUNBOOK. In fresh conversations, Claude, VS Code Copilot and ChatGPT each mounted the widgets inline, and Claude's streaming previews worked. Copilot's first call passed `kind` instead of `widget`; 0.9.0 answers that call with the same input-validation error, and Copilot corrected itself (BACKLOG AGT-4).
  - **All three hosts still open with `initialize`**, so the live retest exercised the 2025-era path on SDK 2.x, including the SSE answers. The 2026-07-28 path is proven by the tests and by raw smoke 4 against the demo, not yet by a host.
  - **A log line fixed.** Over stateless HTTP every session's `MCP Apps:` line said "lacks the UI capability", Apps hosts included: the instance receiving `initialized` never saw `initialize`. It now reports only negotiated capabilities.

- **WebMCP tools carry the authoring contract (2026-09-03, change `webmcp-authoring-contract`, `@widgentic/webmcp` 0.2.0 pending release)** — from the owner's first round in ChatGPT Desktop's browser: the agent used the tools but drafted worse than after reading the MCP authoring guide, because the tool descriptions named shapes and not rules; and asked to "create a widget" it loaded through our tools and then CLICKED Save with the host's own page tools. Two reference tools join (fourteen in all): `<prefix>_authoring_guide` — the MCP guide's structure, derived from core's constants (reserved kinds from the catalog, tokens from `TOKEN_SPECS`, format examples rendered by the engine), workflow rewritten for the browser — and `<prefix>_widget_definition_check` — the load's verdict with no side effect. Every editing description carries a DSL cheat sheet (`bind`/`each`/`when`, `map`/`prefix`/`format` one-per-value, forbidden tags/attributes, `.wg-` styles with `var(--wg-*)`, required descriptor fields, identifier rule) and names the guide and check tools under the configured prefix. Tests pin the term list under both prefixes, the guide's derivation (kinds, tokens, forms, rendered `$3,207` and `01-09-2026 02:04`), and the check tool's verdicts. The host write path is stated, not fought: docs, READMEs and the host matrix say a host agent that can operate the page may press Save under the person's session, that the draft is visible first, and that "draft it, I will save" keeps the click. Duplication of the guide text from `@widgentic/mcp` is deliberate for now (that package is Node-only); a browser-safe guide module in core is queued. Second live round is the owner's, comparing output against the MCP-guide baseline.
- **Self-host README loop, run as a judge would (2026-09-02, local Docker 29.7 / Compose 5.4, unmodified image)** — `docker compose up --build -d` from `examples/docker` with an existing `kek.txt`: both services up (`web` :8080, `mcp` :8081). Served: `/healthz` 200, the page carries `#key-connect` and NO endpoint meta (no upstream configured → the page fell back to `http://localhost:8081/mcp`, which the Keys pane then showed with both key forms), `POST /mcp` on the web port 404 (forward off, as documented), `:8081/mcp initialize` → `serverInfo widgentic 0.1.0`, keyless `tools/list` 8. `POST /api/keys` → 201 with `entry`, `key`, `notice` (raw key kept in a file, never printed). Headless Chrome 151 with the testing flag on `http://localhost:8080/`: header `WebMCP tools are available in this browser …`, 12 tools; `widgentic_widget_draft_load` with a `judge-card` definition → `ok: true, previewable`, the kind input and the preview showed it; clicking `#widget-save` → status `saved judge-card — it is in your MCP catalog now`, the list shows `judge-card`. MCP with the key: anonymous `list_widgets` does NOT contain `judge-card`, the keyed call does; `render_widget { widget: "judge-card", data, format: "page" }` → 7160 B page carrying the title and `wg-card` (screenshotted; a `kind` argument is refused with `-32602`). Three screenshots (designer after save, Keys pane, rendered page) went to the owner. Conclusion: the deployed demo is this image unchanged; the README reproduces it.
Deployment entries (every vNN, production checks, claude.ai/Copilot legs against the hosted server) moved to `widgentic/apps` RUNBOOK.md on 2026-08-27; package-level entries stay here.

- **.NET sample live in three MCP Apps hosts (2026-10-09, change `dotnet-host`, PR #19, owner-reported)** — the owner ran `dotnet/samples/Widgentic.Sample.Stdio` over Streamable HTTP (`--http`, `localhost:3002/mcp`), serving the docker demo seed (the appointment agenda and email inbox widgets, the `google-dark`/`google-light` themes and their shared schemas) and the sample's own `team_roster` tool. Each host was connected as described under Host registration snippets. **Claude, VS Code Copilot and ChatGPT all worked**, the custom `team_roster` host tool included: its result, rendered through `IWidgenticRenderer`, mounted inline like `render_widget`'s. This was the first live run of `Widgentic.Mcp` and closes task 11.5. The same day, the sample gained committed launch profiles (`http` by default on port 3002, and `stdio`), so `dotnet run` and F5 start the tested HTTP mode.
- **Image places in streaming previews (2026-10-09, change `preview-image-placeholders`)** — owner finding on production v82 in Claude Desktop: an org tree with 30 image icons and a card cover streamed as URL text (half-typed, then whole) before the result swapped in the inlined images. Previews now hold an image's place: client-built tree icons, card fields and table cells decide exactly as the built-in renderers do and mount `span.wg-img.wg-img-<shape>.wg-img-pending` where the result draws an image; server previews mount every non-`data:` `img` as such a place; the last value of a partial snapshot is left out while it is a URL or the start of one (`h` … `https:/`, `d` … `data:`), from the preview and from the `preview_widget` request. Unit gate: an agreement suite renders the same card and table payloads through core and through the bridge preview across every branch of the decision (extension and `data:image` auto-detection, a shape hint on an extensionless URL, `true`, `false`, an unsafe source under a hint, a non-hintable hint string, a link, a number) and compares image positions and shape classes; one test per scenario plus five trailing prefixes. Chrome (`tools/probe-template.ts`): handshake, keyed reorder and server preview still pass; icon place 18×18, pending hero 371×209 in a 480 px frame (it measured 0×0 before the card value cell was allowed to grow); template 40,915 / 10,829 bytes, under the 45,056 / 13,312 budget. Not changed: the 24-source fetch cap per render, which left seven of that tree's icons external in the result (`BACKLOG.md` RND-5).
- **Streaming preview host probe (2026-10-09, change `rendering-app-template`, staging on `demo.widgentic.dev`)** — a probe build (never merged) added a counter line under the widget and a tool-name log line on the server. Two prompts per host, each in a fresh conversation: a 25-row built-in table and a 12-appointment stored `appointment-agenda-widget`. **Claude Desktop**: partial input streamed (157 snapshots for the table, 114–256 for the agenda) and the table grew row by row; the first agenda run drew an empty frame because the agent wrote `data` first and `widget` last, and the one preview request carried the name cut mid-stream (`UNKNOWN_KIND`), which ended previews. After the fix (previews act on settled names only; an unnamed "Generating…" placeholder before that; `render_widget` asks for `widget` before `data`) the agenda filled in progressively: `preview sent 23 [appointment-agenda-widget] ok 23 err 0`, with the server logging `preview_widget` calls before `render_widget`. **VS Code Copilot Chat** and **ChatGPT**: `partials 0 | input 1` on both prompts — the complete input arrives just before the result, no preview request is sent, the widget appears at once; the final render works. Copilot's agent passed `format: "app"` and then doubted the inline display; the `format` description now steers to the default. Claude on the web and basic-host were not re-probed.
- **Release (.NET) dry run (2026-10-08, PR #19, change `dotnet-host`)** — the PR run of `release-dotnet.yml` on ubuntu-latest. `package` built the npm workspace and passed `dotnet test` 111 of 111 on linux-x64, with the package's own native V8 and nothing else installed. The pin check reported `@widgentic/mcp@0.9.0 is not on the registry` as a warning (non-fatal, because a PR run cannot publish). `Widgentic.Mcp.0.9.0.nupkg` was packed and uploaded as an artifact (100,065 bytes), and `publish` was skipped because the ref is not `main`. The CI `dotnet` job, `verify`, `docs` and both image builds passed on the same head.
- **.NET host after merging main (2026-10-08, change `dotnet-host`, on `feature/dotnet-host`)** — merged the rendering-app-template change and the 0.8.0 release. The corpus went stale in exactly two cases (the authoring guide and the app template, both changed by main), and the bare-realm and .NET suites failed on the same two before regeneration. Nine `preview_widget` cases were added, for 76 in all. The bare realm reproduced all 76 byte for byte; the .NET suite passed 111 of 111, with `preview_widget` listed app-only beside `render_widget` and hidden with it. The pin moved to `0.9.0`, because 0.8.0 shipped without `./host`.
- **.NET host (2026-10-08, change `dotnet-host`, `@widgentic/mcp` minor pending release, `Widgentic.Mcp` 0.1.0 unpublished)** — Windows 11, Node 24.18, .NET SDK 10.0.401, ClearScript V8 7.5.1.1, ModelContextProtocol 2.2.0. The `./host` bundle (168 KB) evaluated in a bare `vm` realm with no `URL`, `process`, `Buffer` or `require` reproduced all 67 conformance cases byte for byte, including `fr-CA` currency as `1 234,50 $` and IDN, userinfo and `javascript:` URLs. The realm's global names were unchanged after a full run; this check caught core-js's `__core-js_shared__` global, now kept module-local. The .NET suite passed 100 of 100: the same 67 cases on V8 byte for byte, the protocol over in-process pipes (tool texts equal to the bundle's, `_meta.ui.resourceUri` plus the legacy key, CSP `resourceDomains` on the listed app resource, slim and full output), 64 tool selections, configuration refusals naming the file, a runaway `for(;;){}` interrupted at 300 ms with the pool restored, no HTTP request across the corpus, a `.nupkg` holding only build output with exactly 7 dependencies, and the stdio sample launched as a process serving `invoice`, `weather`, `x-post` and `team_roster`. `npm run pack:check` passed, with are-the-types-wrong green for `@widgentic/mcp/host`. NOT yet done: the sample in a real MCP Apps host in a fresh conversation (task 11.5), and the `release-dotnet.yml` dry run (10.3), which needs the branch pushed.
- **Self-host staging path (2026-10-08, change `selfhost-staging`, local Docker 29.7)** — `Dockerfile.source` built from the repository root (root `.dockerignore`): the builder stage ran `npm ci`, `npm run build` and `npm pack` for the four packages, and the runtime stage installed those tarballs through a rewritten manifest plus `overrides`. `npm ls --all --json` in the image showed one copy of each `@widgentic/*` package, resolved from `file:/tarballs/…` and deduped everywhere else; the import smoke passed; `mcp` answered `/healthz` 200 and keyless `tools/list` with this branch's 8 tools; `web` served `/` 200; the committed `examples/docker/package.json` was unchanged. With `WIDGENTIC_SEED_FILE=/srv/docker/seed/demo.json` on a fresh volume the web log read `6 written, 0 already present, 0 refused` and `/api/widgets|themes|schemas` listed the agenda and inbox widgets, both Google-inspired themes and both schemas; a restart over the same volume read `0 written, 6 already present`. Unit gate: 10 seed tests on the SQLite store (the sample seeds and both widgets render; a held theme keeps its tokens; `UNKNOWN_SCHEMA` refused while the rest land; missing, non-JSON and non-object files write nothing; unset and multi-user modes write nothing). CI gains a non-required `selfhost-source-image` job. Deployment key: `web` seeding a shared volume and `mcp` with `WIDGENTIC_DEFAULT_KEY_FILE` (a generated key, mounted read-only, never printed) and `WIDGENTIC_DEFAULT_KEY_SCOPES=read,execute`: `list_widgets` with that key returned the four built-ins plus `appointment-agenda-widget` and `email-inbox-widget`, a random well-formed key returned the four built-ins only, the log said `deployment key configured (scopes: read, execute)`, and no log line contained any part of the key; 10 unit tests cover the requirement.
- **Rendering and the app template (2026-10-07, change `rendering-app-template`)** — four backlog items in one change. (1) **Size budget**: `buildAppTemplate()` was 41,038 bytes raw / 11,684 gzipped (level 9); stripping full-line comments, blank lines and indentation from the inline script at build time brought it to 33,903 / 9,012, and after the additions below it serves 36,596 / 9,665, under the 45,056 / 13,312 budget the gate now pins. The compacted script ran in headless Chrome (`tools/probe-template.ts`: handshake completed, both cases mounted); 200-row table / 200-node tree mount medians moved within run-to-run noise (7–19 ms / 4–8 ms before and after). (2) **Keyed patching**: table rows and tree sibling lists keyed by a distinct record `id`, template `each` lists by an optional `key` path; both patchers pair a fully, uniquely keyed list by key and move nodes, positional otherwise. One fixture table drives core's patcher and the bridge's in the same suite (12 sequences); disabling the bridge's keyed path fails 7 of them. In Chrome a reversed 200-row keyed table kept every row element. (3) **Server previews**: new app-only `preview_widget` renders partial input of stored kinds with `partialData` (data-schema check skipped, no inlining, `{ tree, css }` only); the frame calls it during streaming when `serverTools` is present, one request in flight, latest snapshot next, any failure keeps the skeleton; checked in Chrome against the fake host. Whether real hosts proxy a tool call before the tool result is NOT yet probed (claude.ai, VS Code Copilot Chat, ChatGPT, basic-host) — that leg runs from `widgentic/apps`. (4) **Inlining**: sources ranked hero → thumb/avatar/template → icon (document order within a rank), first 24 fetched, admitted while substituted bytes — data-URI length × occurrences — fit 3 MiB; a hero after 30 icons is now fetched, and a 20,000-character icon on 200 nodes stays external while a 100 KB hero inlines; overflow is a count-only stderr line.
- **Designers as WebMCP tools (2026-09-02, change `designer-webmcp`, new package `@widgentic/webmcp` 0.1.0 pending release)** — headless Chrome 151 launched with `--enable-features=WebMCPTesting,DevToolsWebMCPSupport` against BOTH example hosts — the designer demo (`npm run designer`) and the self-host authoring app (`examples/docker/web.ts` on a scratch SQLite file, the host the live URL runs) — driven by `tools/probe-computed.mjs` + `tools/probe-webmcp.js`, with identical results. What was VISIBLE: the page's own header read `agent tools: 12 registered`; BOTH `document.modelContext` and `navigator.modelContext` existed as `ModelContext` objects with `registerTool`/`getTools`/`executeTool` (the package resolves the document's first, per the spec and ChatGPT's docs); `document.modelContext.getTools()` listed the twelve `widgentic_*` tools with `annotations.readOnlyHint` intact on exactly the five read tools (`*_get` ×4 and `theme_token_specs`) — the hint reaches the browser, so ChatGPT can run them without a confirmation step; `navigator.modelContextTesting.listTools()` listed the same twelve. Executing `widgentic_widget_draft_load` through the testing surface (`executeTool(name, jsonString)` — Chrome 151 wants the input SERIALIZED there, and its in-page `document.modelContext.executeTool(tool, object)` answered "Failed to parse input arguments"; the agent-side path is the one that matters) returned our MCP-shaped result `{"content":[{"type":"text","text":"{\"ok\":true,\"diagnostics\":{\"styles\":[],\"previewable\":true},\"diagnosticsDerived\":false}"}]}`, and the DESIGNER changed: the kind input read `probe-card` and the live preview rendered the definition's example title `Hello from WebMCP`. Unit gate on the fake model context: 27 webmcp tests (descriptor set, prefix, read-only annotations, closed schemas, real-designer round trips for widget/theme/schema/action, `NOT_MOUNTED`/`INVALID_INPUT`/`REJECTED` results, document-over-navigator precedence, per-name failure reporting, idempotent dispose, host tools under the same signal) plus 3 self-host edge tests (streamed `/mcp` forward with headers/body/query intact, 404 when unset, 502 with a structured error when the upstream is down, origin-trial meta only when a token is set). Repo gate: typecheck, 1079 tests, build, pack:check (four tarballs), docs:check (52 MDX files) green; the export snapshot gained the `@widgentic/webmcp` block (`DEFAULT_PREFIX`, `designerTools`, `exposeDesigners`, `failResult`, `okResult`, `registerTools`, `resolveModelContext`). Not verified here, by design: ChatGPT Desktop's "Available site tools" listing and its confirmation UX — that check runs on the deployed self-host instance (apps repo log).
- **Array projection and value formats (2026-09-01, change `array-projection-and-formats`)** — three gaps one live authoring session against a currency ticker surfaced, closed together. (1) **Root-array completion**: `collectPaths` bailed on any non-object root, so the shape most REST endpoints return yielded ZERO candidates and every path input degraded to free text; it now descends a ROOT array into its item's properties, and `itemScope` collapses into `schemaAt(scope, eachPath) + .items` so `each: "."` scopes like any other each. Scoped deliberately to the root (design D8): mirroring `schemaAt` literally would have offered `lines.qty` in the outer scope, and NEITHER reader that matters resolves it — verified against the compiled renderer, `lines.qty` renders empty while `lines.0.qty` renders `2`, and the projection's `getAtPath` is the same. A nested array stays offered for `each`, its item properties arriving through that each. (2) **Per-item projection**: `applyOutput`'s `map` resolved only at the response root, so `getAtPath(array, "ask")` was `undefined` and a list response could only be `replace`d raw; entries now resolve per ITEM when the response is an array, which is backward-safe precisely because the old behavior was useless. The sole-entry `"."` target still addresses the root by index, and `merge` still refuses arrays. (3) **The `format` bind transform**: `{ bind, format }` on text binds and attr values, `number`/`currency`/`date`, render-time only — the payload keeps the typed value. Determinism is the hard requirement (server render, designer preview and in-frame re-render must agree byte for byte or the patcher sees phantom text changes): locale fixed at `en-US`, unzoned ISO read as UTC and formatted in UTC via our own token engine rather than `new Date()` — this VM's TZ is UTC, which would have hidden the bug, so the engine was checked under `TZ=UTC`, `America/Bogota` and `Asia/Tokyo` and gives `01-09-2026 02:04` in all three. Two facts worth keeping: Intl separates a currency CODE from the number with a NO-BREAK SPACE (U+00A0), so `COP\u00A03,207` — a plain-space assertion fails invisibly; and `Date.parse` is not required to accept the ticker's nine fractional digits, so the engine truncates to three. Owner decision (design D7): `currencyDisplay` is exposed, defaulting to `narrowSymbol`, because Intl's default `symbol` gives `COP 3,207` while the change's stated goal was `$3,207`. Acceptance rig on the user's real response, asserting the SERVED bytes of `handleRenderWidget`: root-array schema completing (`ask,when,book`), `each: "."` scoping to the item, template + store validation, per-item projection dropping `bid`, and `<ul><li>usdc_cop $3,207 @ 01-09-2026 02:04</li><li>usdt_cop $4,103 @ 01-09-2026 02:05</li></ul>` — with the ten-decimal string ABSENT from the render and PRESENT in the payload, and the tree and html projections byte-identical. Also confirmed the same enumerator fix repairs the action input mapping, the `$root.` helpers and the widget-level `load` (they share `allPaths`), and that two array sides of an output map are now compared by their ITEM types instead of passing every `array`-vs-`array` pair. Two defects the user found by driving the RUNNING designer were fixed in the same change (design D9). (a) `map`/`prefix` on a TEXT bind validated `ok` and were then ignored by the renderer — verified: `{ bind: "book", map: { usdc_cop: "X" } }` rendered `usdc_cop`, not `X`; both are now refused with a dotted path, `format` staying valid in both positions. (b) The `map` button was present but PERMANENTLY invisible on every attribute row: it lives in a `.wgd-node-icons` group hidden until its row is hovered, and the only reveal rules were `.wgd-node-row:hover > …` / `.wgd-st-row:hover > …` — child combinators that never match inside `.wgd-attr-row`. Confirmed by COMPUTED VALUE in headless Chrome against the live designer, not by a stylesheet regex: `visibility` `hidden` before focus → `visible` after, the button 35x17 with `checkVisibility()` true, inside the row's own width, and `elementFromPoint` at its centre returning the button itself; the row was also overflowing (`scrollWidth 334 > clientWidth 325`) so it now wraps. Gates: typecheck, 1028 tests, build, pack:check green; the export snapshot gained the format engine and its constants. **Review closure (8 angles, design D10) — three of the statements above were REVERSED by the review and are recorded here rather than rewritten:** (i) the text-bind `map`/`prefix` refusal was reverted — stores re-validate on read, so a stored widget carrying one dead key would have vanished from every host, against "nothing is ever saved but vanished"; they stay accepted and ignored, and the designer's text rows simply never offer them. (ii) the enumerator no longer descends a root array — that descent lived in the SHARED collector and advertised item properties at the template ROOT, in `load` input mappings and in `$root.` helpers, all of which resolve against the ARRAY and render nothing; the collector is context-free again, each item-scoped consumer (`each`, both output-map columns) asks for `itemSchema(...)`, an array scope offers only `"."`, and `schemaAt` steps into arrays by INDEX only, as the resolvers do (the "same fix repairs input mapping / `$root.` / `load`" claim above was the defect, not the feature — the binding test that pinned it now asserts the truth). (iii) per-item projection had hijacked INDEX-addressed sources: `{ latest: "0.ask" }` was a valid, working binding that resolved at the root and would have started projecting `undefined` per item — a source starting with an index now keeps root semantics. Also hardened: a date pattern must carry a token and no stray letter (`d/M/yy` rendered a constant), epoch numbers are seconds below 1e11 and milliseconds above (`1756694687` had formatted as 1970), a locale must be one the runtime knows, numeric output normalizes ICU's no-break spaces so engines agree byte for byte, the default `merge` over a per-item projection is flagged in the editor, `Intl.NumberFormat` and the tokenized pattern are built once per spec object (`compileFormat`) rather than per cell, the guide renders its example outputs through the engine, and one `:is()` rule reveals the icon group on every hosting row type. One finder claim was refuted by probe: prompt-text segments carrying `format` are already refused. **Then two backlog items were pulled into scope by owner decision (design D11):** a `"."` map target now SELECTS first — alone it is the projection as before, beside other entries it names the value they map — so an enveloped list (`{ data: [...] }`) projects per item without touching the output schema (the shape was forbidden until now, so nothing stored changes meaning; the output-map editor completes the `"."` row from the response root and the rows after it from the selection's items); and `map` WORKS on a text bind (the value selects an authored label, `default` on miss), while `prefix` stays attribute-only and inert in a text position — the designer's text rows offer `format` and `map`, never `prefix`. Live use of that build then surfaced three small designer findings, fixed in place (design D12): the `"."` selection row is an on-schema target; the widget designer's Export section lost its stray theme-JSON button and its entry button is `Export widget entry` like the other designers; the styles legend is `(.wg- selectors only)`.
- **Native tree widgets (2026-09-01, change `native-widgets-refresh`)** — tree branches became native `details.wg-tree-branch` / `summary.wg-tree-label` disclosures, so expand/collapse works with ZERO script wherever the HTML lands; `hints.expandDepth` now selects the INITIAL state through the `open` attribute and `data-expanded` is gone. Confirmed in a REAL browser (headless Chrome, CDP driver in the shape of `tools/probe-computed.mjs` plus `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` — synthetic events cannot exercise the platform's activation), inside a `sandbox="allow-scripts"` iframe serving the real `buildAppTemplate()` bytes with the tool-result posted in as a host would. With `expandDepth: 0`: branch 20px tall, children `checkVisibility()` false, the leaf's text still in the DOM (presentational collapse); trusted click → open, 49px, children visible; click again → closed; focus lands on the summary; Enter → open, Space → closed. `cursor: pointer`, one chevron at `rgb(107, 114, 128)` (`--wg-muted` default) with the platform marker suppressed, the emoji icon rendering before the label (`📁root`). Note for a future run: Chrome hides a closed disclosure with `content-visibility` on `::details-content`, so `getClientRects()` still returns boxes — use `checkVisibility({ contentVisibilityAuto: true })`; and the sandboxed frame is a separate process by default, so either pass `--disable-features=IsolateSandboxedIframes,IsolateOrigins,site-per-process` and pick the execution context whose `auxData.frameId` differs from `Page.getFrameTree`'s main frame, or attach to the frame target with flattened `Target.setAutoAttach`. Toggle survival is pinned by tests at both layers (core `mountWidget` and the `bootTemplate()` bridge): the patchers diff the PREVIOUS render tree, never the live DOM, so an unchanged branch is never rewritten and a newly appended branch mounts with its computed state. Nodes also gained an optional `icon` — a safe image source through card/table's own `looksLikeImageUrl` gate renders as `img.wg-img.wg-img-icon` with an empty alt, anything else as `span.wg-tree-icon` text, and `icon` joins `children` in the JSON-fallback exclusion. The `custom` kind was REMOVED: `createCatalog().kinds()` is exactly `card, table, tree, group`, `checkStoredWidget` now ACCEPTS `custom` as a user's own stored kind, and the guide's `reservedKinds` and `list_widgets` followed automatically. Two current specs the drafted deltas had not covered were reconciled during apply (design D8): `widget-theming` — `.wg-custom` renamed to the neutral `.wg-code` monospace utility rather than deleted, because `--wg-font-mono` is consumed only there and dropping the token would refuse live stored themes that set it with `UNKNOWN_TOKEN`; and `reactive-rendering` — the patch scenario renamed to `open` with the prev-vs-next guarantee promoted to stated behavior. Gates re-run after review: typecheck, full suite, build, pack:check green. An 8-angle review then hardened it: the fallback label's icon/children-only boundary (both renderers), negative `expandDepth` clamped to 0 instead of flipping fully open, a depth-64 totality bound in the core renderer (the header said \"never throws\"; a 5000-deep nesting proved otherwise), the preview's depth cap bounding recursion rather than SHAPE, the designer's tree seed moved off dead `data-expanded` markup, the render-only `icon` shape split into `RenderImageShape`, the two sanctioned preview divergences pinned BY NAME, and the toggle-survival claim qualified as positional — an unkeyed diff re-pairs states when siblings reorder (keyed diff queued in the backlog with the inliner's occurrence-amplification).
- **Agent-visible shared actions (2026-08-31, change `agent-visible-actions`)** — `list_actions` joins the discovery tools (eighth overall) and the authoring guide gains the `sharedAction` section, closing the gap found live on v70: the template DSL bound `{ "ref": "<name>" }` while nothing told an agent what the referenced entry was, what arguments it took, or where a person imports one. The listing is the action's CONTRACT — `name`, `label?`, `description?`, `kind`, and for http the `method` and the input/output schemas — and deliberately withholds `url`, `headers` and `query`: a binding needs none of them, and a read-only key travels into prompt-injectable hosts where an author's literal header or query value (a bare token, for an author who did not know better) would otherwise be readable. The projection lives in the handler, not at each host's wiring, so no deployment can leak by forgetting; the protocol test asserts the ABSENCE of the URL, the header name and value, and the secret's name from the serialized result. Also derived rather than restated: the guide quotes `ACTION_NAME` (`^[a-z][a-z0-9-]{0,63}$`), which is STRICTER than the `SAFE_IDENTIFIER` widgets, themes and schemas use — a guide that had restated the wrong one would have taught names the store then refuses. Two adjacent gaps closed: the guide's `limits` published four caps but neither `maxSchemas` nor `maxActions`, and the Node authoring adapter awaited the host's `resolveContext` outside its try/catch, so a host whose store was unreachable got an escaped rejection (a bodyless 500 at best) instead of the surface's own structured `INTERNAL` with the trace on the log sink. Gates: typecheck clean, full suite green, build and pack:check green; the export snapshot gained exactly `LIST_ACTIONS_TOOL` and `handleListActions`. An 8-angle review on the diff then hardened it: a prompt entry carries `binds` (its text's data paths — a prompt ref takes NO input mapping, and every steering text now says so), the adapter's containment keeps a store rejection's mapped status/code instead of flattening it to 500 (the production resolver IS `ensurePrincipal`), one malformed source entry is dropped rather than failing the whole listing, and the smoke above asserts the action's PRESENCE before the absence of its own transport values — an unwired source would pass a blanket absence check vacuously, and `"$schema"` URLs false-positive a bare `https://` grep.
- **First npm publish (2026-08-27, `@widgentic/core|designer|mcp@0.1.0`, Release workflow)** — repository transferred to the `widgentic` GitHub organization (`widgentic/widgentic`, public); the Release workflow opened and merged the Version Packages PR (0.0.0 → 0.1.0 for the linked group) and published with a bootstrap `NPM_TOKEN`. Verified from an anonymous client: all three at 0.1.0 with npm **provenance attestations**, MIT, `repository` → `widgentic/widgentic`, core with no dependencies, designer/mcp depending on core, mcp's SDK/zod/Azure clients as optional peers; `npm install @widgentic/core @widgentic/designer @widgentic/mcp` in a clean project resolves and every entry imports. Two operational lessons: the `NPM_PUBLISH` gate must be a repository **variable** (a secret of the same name reads empty and the workflow silently falls back to `pack:check` — green, but no publish); and a freshly published package can 404 from the registry document endpoint for several minutes while the search index already lists it — wait, do not assume restricted access.
- **Claude Code 2.1.220** — graceful degradation confirmed (text results, no UI mounting by design).
- **Linked-group release semantics (2026-08-29, change `linked-release-versions`)** — the first release after 0.1.0 carried a designer-only changeset and published `@widgentic/designer@0.2.0` while core and mcp stayed at 0.1.0; both published dependents declare `@widgentic/core: ^0.1.0`, which the unchanged core satisfies (verified on the registry). The same run rewrote `packages/mcp/package.json`'s devDependency on designer to `^0.2.0` without bumping mcp, so the published `@widgentic/mcp@0.1.0` keeps the older devDependency range — harmless, consumers never install devDeps. `package-distribution`'s "Versions move together and are attested" now records the linked semantics, the range guarantee, the highest-version rule and this manifest-without-release case; the release configuration was deliberately left alone (`linked`, not `fixed`).
- **Docs site live (2026-08-29, change `docs-site`, commit `89b8d46`)** — `docs/` (47 MDX pages: 25 hand-written, 22 generated) deployed by Mintlify from `main` (GitHub App, subdirectory `/docs`) and served at `https://docs.widgentic.dev` over TLS. Gates green before the push: `docs:generate --check` 22 pages current, navigation test (no orphans, every entry resolves), `mint validate` (strict), `mint broken-links --check-anchors` clean, `mint a11y` clean over 47 files; repo gate typecheck / 862 tests / build / pack:check. Verified from served bytes after the build: a page from every tab answers 200 with its own title (`/get-started/what-is-widgentic`, `/design/widget-designer`, `/how-it-works/trust-model`, `/develop/packages`, `/reference/theme-tokens`, `/reference/api/core`, `/reference/api/mcp-secrets-keyvault`). Two lessons: the CDN served the previous build's root for minutes after the new pages were live (a cache-buster showed the correct home page — check a deep path, not `/`, to judge a deploy); and `mint a11y` measures `colors.primary` against the light background, where widget blue `#40A0C8` fails 3:1, so the docs primary is link blue `#1E6F92`.
- **Designer chrome tokens (2026-08-28, change `designer-chrome-tokens`, `@widgentic/designer` → 0.2.0 pending release)** — headless Chrome 151 via `tools/probe-computed.mjs` against the demo host. Without `chrome`: root `system-ui, sans-serif` 13px gap 16px, inputs/buttons 13px radius 4px, compact inputs 12px, tags `ui-monospace, monospace` 11px radius 3px colour `rgb(37, 99, 235)`, sections radius 6px, chevron 10px, JSON pane mono 13px, preview `rgb(255, 255, 255)` — identical to the literals the tokens replaced. After "Host chrome" (`bg/panel/border/line/text/muted/hover/accent` → `var(--host-*)`, `font: var(--host-font, system-ui, sans-serif)`, `font-size` 14px, `font-size-sm` 13px, `radius` 8px, `radius-lg` 12px): root and buttons Georgia 14px radius 8px, compact inputs 13px, sections 12px, tag colour `rgb(64, 160, 200)`; tags stayed 11px/3px and the chevron 10px (unmapped `font-size-xs`/`radius-sm`), the preview background stayed white (widget `--wg-*` tokens untouched). The root carried the map as inline custom properties and nothing else.
- **Designer chrome tokens, full map (2026-08-29)** — the demo host's "Host chrome" button switches the page's own `--host-*` palette to the brand look (light and dark) and passes a map covering all 28 tokens, so page and designers match in both states (the header stays `system-ui` with the built-in palette while the toggle is off). Probe before → after the toggle: root `system-ui` 13px gap 16px `rgb(255,255,255)`/`rgb(31,36,48)` → Georgia 14px gap 24px `rgb(246,250,252)`/`rgb(11,27,38)`; inputs and buttons 13px radius 4px → 14px radius 8px, border `rgb(213,219,227)` → `rgb(211,224,232)`; compact inputs 12px → 13px; tags `ui-monospace` 11px radius 3px `rgb(37,99,235)` on `rgb(232,238,249)` → `"Courier New"` 12px radius 4px `rgb(30,111,146)` on `rgb(227,241,247)`; sections radius 6px → 12px; chevron 10px → 11px; JSON pane mono 13px → Courier 14px, `hl-key` `rgb(11,95,165)` → `rgb(30,111,146)`, `hl-str` `rgb(10,122,61)` → `rgb(46,125,91)`; the root's inline custom properties 0 → 28; the preview background stayed `rgb(255,255,255)` (widget tokens untouched).
