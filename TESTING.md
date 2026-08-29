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

## Designer chrome: computed-value check

The designers' chrome is painted through the 28 `--wgd-*` tokens
(`CHROME_TOKENS`); unit tests pin the token blocks and audit the stylesheet
structurally, but only a browser cascades `var()`. `tools/probe-computed.mjs`
loads a URL in headless Chrome over the DevTools Protocol (no dependency —
Node's `fetch` + `WebSocket`) and prints the JSON result of an expression:

```bash
npm run designer &                     # the demo host on :8082 — its "Host chrome" button toggles a chrome map
node tools/probe-computed.mjs http://localhost:8082/ probe.js
```

with `probe.js` reading `getComputedStyle()` of `.wgd-root`, an input, a
`.wgd-node .wgd-tag`, `.wgd-section`, `.wgd-chevron` and the JSON pane's
`.wgd-hl-k` before and after `document.getElementById("chrome-toggle").click()`.
Expected: without `chrome`, `system-ui, sans-serif` / 13px / 16px gap on the
root, 12px on compact inputs, `ui-monospace, monospace` / 11px / 3px on tags,
6px on sections, 10px on the chevron, 4px on inputs and buttons — the
pre-token literals, and the page itself wears the same palette. The toggle
switches the page to its brand look (`html[data-host-chrome="brand"]`) and
passes a map covering all 28 tokens (colours and shadow as `var(--host-*)`,
typefaces with fallback stacks, sizes/radii/gap one step up), so afterwards
page and designers match again — Georgia 14px, Courier tags at 12px/4px,
brand accent and highlight colours, 24px gap, chevron 11px — while the
preview's widget colours (`--wg-*`) stay put.

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

- **First npm publish (2026-08-27, `@widgentic/core|designer|mcp@0.1.0`, Release workflow)** — repository transferred to the `widgentic` GitHub organization (`widgentic/widgentic`, public); the Release workflow opened and merged the Version Packages PR (0.0.0 → 0.1.0 for the linked group) and published with a bootstrap `NPM_TOKEN`. Verified from an anonymous client: all three at 0.1.0 with npm **provenance attestations**, MIT, `repository` → `widgentic/widgentic`, core with no dependencies, designer/mcp depending on core, mcp's SDK/zod/Azure clients as optional peers; `npm install @widgentic/core @widgentic/designer @widgentic/mcp` in a clean project resolves and every entry imports. Two operational lessons: the `NPM_PUBLISH` gate must be a repository **variable** (a secret of the same name reads empty and the workflow silently falls back to `pack:check` — green, but no publish); and a freshly published package can 404 from the registry document endpoint for several minutes while the search index already lists it — wait, do not assume restricted access.
- **Claude Code 2.1.220** — graceful degradation confirmed (text results, no UI mounting by design).
- **Docs site live (2026-08-29, change `docs-site`, commit `89b8d46`)** — `docs/` (47 MDX pages: 25 hand-written, 22 generated) deployed by Mintlify from `main` (GitHub App, subdirectory `/docs`) and served at `https://docs.widgentic.dev` over TLS. Gates green before the push: `docs:generate --check` 22 pages current, navigation test (no orphans, every entry resolves), `mint validate` (strict), `mint broken-links --check-anchors` clean, `mint a11y` clean over 47 files; repo gate typecheck / 862 tests / build / pack:check. Verified from served bytes after the build: a page from every tab answers 200 with its own title (`/get-started/what-is-widgentic`, `/design/widget-designer`, `/how-it-works/trust-model`, `/develop/packages`, `/reference/theme-tokens`, `/reference/api/core`, `/reference/api/mcp-secrets-keyvault`). Two lessons: the CDN served the previous build's root for minutes after the new pages were live (a cache-buster showed the correct home page — check a deep path, not `/`, to judge a deploy); and `mint a11y` measures `colors.primary` against the light background, where widget blue `#40A0C8` fails 3:1, so the docs primary is link blue `#1E6F92`.
- **Designer chrome tokens (2026-08-28, change `designer-chrome-tokens`, `@widgentic/designer` → 0.2.0 pending release)** — headless Chrome 151 via `tools/probe-computed.mjs` against the demo host. Without `chrome`: root `system-ui, sans-serif` 13px gap 16px, inputs/buttons 13px radius 4px, compact inputs 12px, tags `ui-monospace, monospace` 11px radius 3px colour `rgb(37, 99, 235)`, sections radius 6px, chevron 10px, JSON pane mono 13px, preview `rgb(255, 255, 255)` — identical to the literals the tokens replaced. After "Host chrome" (`bg/panel/border/line/text/muted/hover/accent` → `var(--host-*)`, `font: var(--host-font, system-ui, sans-serif)`, `font-size` 14px, `font-size-sm` 13px, `radius` 8px, `radius-lg` 12px): root and buttons Georgia 14px radius 8px, compact inputs 13px, sections 12px, tag colour `rgb(64, 160, 200)`; tags stayed 11px/3px and the chevron 10px (unmapped `font-size-xs`/`radius-sm`), the preview background stayed white (widget `--wg-*` tokens untouched). The root carried the map as inline custom properties and nothing else.
- **Designer chrome tokens, full map (2026-08-29)** — the demo host's "Host chrome" button switches the page's own `--host-*` palette to the brand look (light and dark) and passes a map covering all 28 tokens, so page and designers match in both states (the header stays `system-ui` with the built-in palette while the toggle is off). Probe before → after the toggle: root `system-ui` 13px gap 16px `rgb(255,255,255)`/`rgb(31,36,48)` → Georgia 14px gap 24px `rgb(246,250,252)`/`rgb(11,27,38)`; inputs and buttons 13px radius 4px → 14px radius 8px, border `rgb(213,219,227)` → `rgb(211,224,232)`; compact inputs 12px → 13px; tags `ui-monospace` 11px radius 3px `rgb(37,99,235)` on `rgb(232,238,249)` → `"Courier New"` 12px radius 4px `rgb(30,111,146)` on `rgb(227,241,247)`; sections radius 6px → 12px; chevron 10px → 11px; JSON pane mono 13px → Courier 14px, `hl-key` `rgb(11,95,165)` → `rgb(30,111,146)`, `hl-str` `rgb(10,122,61)` → `rgb(46,125,91)`; the root's inline custom properties 0 → 28; the preview background stayed `rgb(255,255,255)` (widget tokens untouched).
