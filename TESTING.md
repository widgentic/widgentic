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
| `dotnet run --project dotnet/samples/Widgentic.Sample.Stdio` | stdio | The same widgets from a .NET server (`Widgentic.Mcp`), plus a host tool that renders its own data (`team_roster`); needs `npm run build` first |
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
- **The real protocol.** A C# SDK client checks tool texts, `_meta.ui`, slimming,
  resources and CSP, and a host tool.
- **Tool selection.** All 64 flag combinations.
- **Configuration refusals.**
- **The engine pool.** Concurrency, a runaway call, nothing leaking between
  callers, and the bundle's identity.
- **Render-only.** No HTTP request, and prompt actions live while http actions
  render disabled.
- **The `.nupkg` shape.**
- **The stdio sample**, launched as a process.

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

**Claude Desktop, the .NET sample** (`claude_desktop_config.json`; build the npm
workspace and the sample first, then point at the built DLL):

```json
{ "mcpServers": { "widgentic-dotnet": { "command": "dotnet", "args": ["/path/to/widgentic/dotnet/samples/Widgentic.Sample.Stdio/bin/Release/net10.0/Widgentic.Sample.Stdio.dll"] } } }
```

**Claude Desktop** (`claude_desktop_config.json`, absolute paths):

```json
{ "mcpServers": { "widgentic": { "command": "npx", "args": ["tsx", "/path/to/widgentic/examples/mcp-server/main.ts"] } } }
```

## Verification log

- **WebMCP tools carry the authoring contract (2026-09-03, change `webmcp-authoring-contract`, `@widgentic/webmcp` 0.2.0 pending release)** — from the owner's first round in ChatGPT Desktop's browser: the agent used the tools but drafted worse than after reading the MCP authoring guide, because the tool descriptions named shapes and not rules; and asked to "create a widget" it loaded through our tools and then CLICKED Save with the host's own page tools. Two reference tools join (fourteen in all): `<prefix>_authoring_guide` — the MCP guide's structure, derived from core's constants (reserved kinds from the catalog, tokens from `TOKEN_SPECS`, format examples rendered by the engine), workflow rewritten for the browser — and `<prefix>_widget_definition_check` — the load's verdict with no side effect. Every editing description carries a DSL cheat sheet (`bind`/`each`/`when`, `map`/`prefix`/`format` one-per-value, forbidden tags/attributes, `.wg-` styles with `var(--wg-*)`, required descriptor fields, identifier rule) and names the guide and check tools under the configured prefix. Tests pin the term list under both prefixes, the guide's derivation (kinds, tokens, forms, rendered `$3,207` and `01-09-2026 02:04`), and the check tool's verdicts. The host write path is stated, not fought: docs, READMEs and the host matrix say a host agent that can operate the page may press Save under the person's session, that the draft is visible first, and that "draft it, I will save" keeps the click. Duplication of the guide text from `@widgentic/mcp` is deliberate for now (that package is Node-only); a browser-safe guide module in core is queued. Second live round is the owner's, comparing output against the MCP-guide baseline.
- **Self-host README loop, run as a judge would (2026-09-02, local Docker 29.7 / Compose 5.4, unmodified image)** — `docker compose up --build -d` from `examples/docker` with an existing `kek.txt`: both services up (`web` :8080, `mcp` :8081). Served: `/healthz` 200, the page carries `#key-connect` and NO endpoint meta (no upstream configured → the page fell back to `http://localhost:8081/mcp`, which the Keys pane then showed with both key forms), `POST /mcp` on the web port 404 (forward off, as documented), `:8081/mcp initialize` → `serverInfo widgentic 0.1.0`, keyless `tools/list` 8. `POST /api/keys` → 201 with `entry`, `key`, `notice` (raw key kept in a file, never printed). Headless Chrome 151 with the testing flag on `http://localhost:8080/`: header `WebMCP tools are available in this browser …`, 12 tools; `widgentic_widget_draft_load` with a `judge-card` definition → `ok: true, previewable`, the kind input and the preview showed it; clicking `#widget-save` → status `saved judge-card — it is in your MCP catalog now`, the list shows `judge-card`. MCP with the key: anonymous `list_widgets` does NOT contain `judge-card`, the keyed call does; `render_widget { widget: "judge-card", data, format: "page" }` → 7160 B page carrying the title and `wg-card` (screenshotted; a `kind` argument is refused with `-32602`). Three screenshots (designer after save, Keys pane, rendered page) went to the owner. Conclusion: the deployed demo is this image unchanged; the README reproduces it.
Deployment entries (every vNN, production checks, claude.ai/Copilot legs against the hosted server) moved to `widgentic/apps` RUNBOOK.md on 2026-08-27; package-level entries stay here.

- **Image places in streaming previews (2026-10-09, change `preview-image-placeholders`)** — owner finding on production v82 in Claude Desktop: an org tree with 30 image icons and a card cover streamed as URL text (half-typed, then whole) before the result swapped in the inlined images. Previews now hold an image's place: client-built tree icons, card fields and table cells decide exactly as the built-in renderers do and mount `span.wg-img.wg-img-<shape>.wg-img-pending` where the result draws an image; server previews mount every non-`data:` `img` as such a place; the last value of a partial snapshot is left out while it is a URL or the start of one (`h` … `https:/`, `d` … `data:`), from the preview and from the `preview_widget` request. Unit gate: an agreement suite renders the same card and table payloads through core and through the bridge preview across every branch of the decision (extension and `data:image` auto-detection, a shape hint on an extensionless URL, `true`, `false`, an unsafe source under a hint, a non-hintable hint string, a link, a number) and compares image positions and shape classes; one test per scenario plus five trailing prefixes. Chrome (`tools/probe-template.ts`): handshake, keyed reorder and server preview still pass; icon place 18×18, pending hero 371×209 in a 480 px frame (it measured 0×0 before the card value cell was allowed to grow); template 40,915 / 10,829 bytes, under the 45,056 / 13,312 budget. Not changed: the 24-source fetch cap per render, which left seven of that tree's icons external in the result (`BACKLOG.md` RND-5).
- **Streaming preview host probe (2026-10-09, change `rendering-app-template`, staging on `demo.widgentic.dev`)** — a probe build (never merged) added a counter line under the widget and a tool-name log line on the server. Two prompts per host, each in a fresh conversation: a 25-row built-in table and a 12-appointment stored `appointment-agenda-widget`. **Claude Desktop**: partial input streamed (157 snapshots for the table, 114–256 for the agenda) and the table grew row by row; the first agenda run drew an empty frame because the agent wrote `data` first and `widget` last, and the one preview request carried the name cut mid-stream (`UNKNOWN_KIND`), which ended previews. After the fix (previews act on settled names only; an unnamed "Generating…" placeholder before that; `render_widget` asks for `widget` before `data`) the agenda filled in progressively: `preview sent 23 [appointment-agenda-widget] ok 23 err 0`, with the server logging `preview_widget` calls before `render_widget`. **VS Code Copilot Chat** and **ChatGPT**: `partials 0 | input 1` on both prompts — the complete input arrives just before the result, no preview request is sent, the widget appears at once; the final render works. Copilot's agent passed `format: "app"` and then doubted the inline display; the `format` description now steers to the default. Claude on the web and basic-host were not re-probed.
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
