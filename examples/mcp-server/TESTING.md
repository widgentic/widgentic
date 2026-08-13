# Testing the Widgentic MCP server

## Entries

| Command | Transport | Use for |
|--|--|--|
| `npm run mcp` | stdio | Claude Desktop, Claude Code, any stdio client |
| `npm run mcp:http` | Streamable HTTP (stateless) on `:3001/mcp` | VS Code Copilot (HTTP), MCP Apps hosts, curl |
| *(hosted)* `https://mcp.widgentic.dev/mcp` | Streamable HTTP, API key required | Any HTTP host, no local setup |

Quick checks without any host:

```bash
npx @modelcontextprotocol/inspector npx tsx examples/mcp-server/main.ts   # interactive UI
npm test                                                                  # incl. SDK interop suite
```

## Inline widgets with the official basic-host (local)

The ext-apps reference host mounts the declared app template — the strictest
acceptance surface for MCP Apps behavior.

```bash
# one-time setup
git clone --branch v1.7.5 --depth 1 https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
cp -r /tmp/mcp-ext-apps/examples/basic-host ~/widgentic-basic-host
cd ~/widgentic-basic-host
npm install && npm install -D @types/cors cross-env concurrently

# build once, then serve (its `npm run serve` expects bun; tsx works identically)
NODE_ENV=development INPUT=index.html   ./node_modules/.bin/vite build
NODE_ENV=development INPUT=sandbox.html ./node_modules/.bin/vite build
npx tsx serve.ts        # UI on :8080, sandbox on :8081; SERVERS defaults to http://localhost:3001/mcp
```

Start `npm run mcp:http` in the repo, open `http://localhost:8080`, and call
`render_widget`. basic-host assumes everything is same-machine `localhost` —
for remote use, see below.

## Remote demo rig (this project's dev VM, tailnet-only)

The VM `ubuntu-open-clawn.tailcb1690.ts.net` exposes the rig through Caddy
(sites already configured in `/etc/caddy/Caddyfile`, TLS via the openclaw cert,
bound to the tailscale interface only):

| Public (tailnet) | → local | Serves |
|--|--|--|
| `:9443` | `:8080` | basic-host UI |
| `:9444` | `:3001` | widgentic MCP (`/mcp`) |
| `:9445` | `:8081` | basic-host sandbox page |
| `:9446` | `:8082` | designer demo — widget + theme tabs (`npm run designer`) |

Because the browser (not the VM) fetches all three, basic-host needs two
patches for remote operation — both are same-machine assumptions in the
example host, not widgentic issues:

1. `src/implementation.ts` — point the sandbox at the exposed origin:
   `const SANDBOX_PROXY_BASE_URL = "https://ubuntu-open-clawn.tailcb1690.ts.net:9445/sandbox.html";`
2. `src/sandbox.ts` — extend `ALLOWED_REFERRER_PATTERN` so the host origin may embed it:
   `/^(http:\/\/(localhost|127\.0\.0\.1)|https:\/\/ubuntu-open-clawn\.tailcb1690\.ts\.net)(:|\/|$)/`

Then rebuild both entries (vite commands above) and start:

```bash
# terminal 1 — widgentic (repo root)
npm run mcp:http

# terminal 2 — basic-host (patched copy)
SERVERS='["https://ubuntu-open-clawn.tailcb1690.ts.net:9444/mcp"]' npx tsx serve.ts
```

Browse `https://ubuntu-open-clawn.tailcb1690.ts.net:9443` from any tailnet
machine.

## Production (Azure Container Apps)

`https://mcp.widgentic.dev/mcp` — the same HTTP server (`examples/mcp-server/http.ts`)
containerized and deployed via [infra/main.bicep](../../infra/main.bicep) to app
`widgentic-mcp` in resource group `widgentic-rg`. Scale-to-zero: the first
request after idle takes a few seconds. `/mcp` requires the API key
(distributed out-of-band; stored as the ACA secret `widgentic-api-key`),
presented either as an `x-api-key` header or as a `?key=` query parameter —
the latter exists for claude.ai / Claude Desktop remote connectors, whose
settings accept only a URL. `/healthz` is open for probes.

Smoke test:

```bash
curl https://mcp.widgentic.dev/healthz    # 200 ok
curl -X POST https://mcp.widgentic.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: $WIDGENTIC_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
# → 200 with "serverInfo":{"name":"widgentic",...}; without the header → 401
```

The hosted deployment sets `WIDGENTIC_ASSUME_UI=1`: stateless HTTP can't see
the client's negotiated capabilities at `tools/call` time, so the default
`render_widget` format returns the slim confirmation line instead of the full
HTML text block (Apps hosts mount the visual from `structuredContent`
regardless; explicit `format` values are never slimmed). Misaimed hints
surface as a `Hint notes:` tail + `structuredContent.diagnostics`.

Rotate the key with `az containerapp secret set -n widgentic-mcp -g widgentic-rg --secrets widgentic-api-key=<new>` followed by a revision restart. DNS lives in Cloudflare: CNAME `mcp` → the app FQDN (DNS only / grey cloud — required for the Azure-managed certificate) plus the `asuid.mcp` TXT validation record.

## Per-principal store (local)

```bash
# Seed two principals, then run the server against the store
WIDGENTIC_STORE_DIR=/tmp/wg-store npm run mcp:http

# Each key sees its own catalog
curl -s -X POST "http://localhost:3001/mcp?key=<alice-key>" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_widgets","arguments":{}}}'
```

An unknown key falls back to the anonymous catalog (built-ins + the
compiled-in widgets); the server logs the unresolved-key event **without**
the key. Widgets that fail validation are skipped with a stderr diagnostic
naming the reason, so a hostile or corrupt entry never reaches a catalog.

## Host registration snippets

**VS Code Copilot** (`.vscode/mcp.json`) — an MCP Apps host; widgets mount inline:

```json
{ "servers": { "widgentic": { "type": "http", "url": "https://mcp.widgentic.dev/mcp", "headers": { "x-api-key": "<api-key>" } } } }
```

Against a local/tailnet server instead, drop the header and point `url` at
`http://localhost:3001/mcp` or `https://ubuntu-open-clawn.tailcb1690.ts.net:9444/mcp`.

**claude.ai / Claude Desktop custom connectors** — Settings → Connectors →
Add custom connector, with the key in the URL (no header support there):

```
https://mcp.widgentic.dev/mcp?key=<api-key>
```

**Claude Code** — this repo's `.mcp.json` registers the stdio server
automatically (tool results are text; Claude Code does not mount MCP Apps UI).

**Claude Desktop** (`claude_desktop_config.json`, absolute paths):

```json
{ "mcpServers": { "widgentic": { "command": "npx", "args": ["tsx", "/path/to/widgentic/examples/mcp-server/main.ts"] } } }
```

## Verified hosts (2026-07)

- **basic-host (ext-apps v1.7.5 reference)** — full 7-input visual sweep: all five kinds inline, live host re-theming via `host-context-changed`, error-state notice.
- **VS Code Copilot Chat** — agent-driven end-to-end from a one-line steer; all five kinds mounted inline over HTTP.
- **Claude Code 2.1.220** — graceful degradation confirmed (text results, no UI mounting by design).
- **Production endpoint (mcp.widgentic.dev)** — deployed 2026-07-30; `/healthz`, 401-without-key, and keyed `initialize` handshake verified end-to-end through the custom domain with the Azure-managed certificate.
- **Theming foundation (2026-08-13, v9, local rig)** — inverse test: a complete `midnight-neon` theme entry (all 32 tokens + three `x-*` custom variables) was authored as JSON, imported into the **standalone theme designer**, saved, then selected as the preview theme in the **widget designer**. Confirms the split and the token system: color pickers appear only on `color`-typed tokens (chosen from `TOKEN_SPECS.type`, not guessed), identity fields populate on import, the table preview renders 40px circular avatars from `avatar-size`, and the custom `x-post` widget picks up the theme — including deriving its avatar box from `calc(var(--wg-avatar-size) * 1.5)` and lifting its card onto `surface` above `bg`. Named themes over the wire verified separately via curl against production: `list_themes`, `theme: "dark"` resolution, and `UNKNOWN_THEME` for an unregistered name.
- **Designer round-trip (2026-08-09, local rig)** — the `x-post` widget was authored/imported in the designer (`:9446`), exported, and pasted back via "Copy as TypeScript" into `examples/mcp-server/widgets/x-post.ts` with no edits; it registers and renders through `render_widget`. Confirms images work in **custom template widgets**: bound `img src` values are inlined server-side as `data:` URIs on both iframe surfaces (2/2 in html and tree) while the model-facing text keeps the original URLs, and the `pattern`-constrained handle rejects `no-at` with `INVALID_TYPE @ data.author.handle`. Visually confirmed in basic-host: the full post shows real avatar and media pixels inside the sandbox (external URLs, server-inlined), and a minimal post correctly hides every `when`-gated block (avatar, media, timestamp, stats). Also verified agent-driven in **VS Code Copilot against production v7** from a no-JSON prompt: the agent read the descriptor, invented schema-valid data (including a handle matching `^@[A-Za-z0-9_]{1,15}$`), mounted both posts as visuals with images visible, hit the pattern error exactly on the invalid handle, and restated no data as text.
- **Native tree mounting + surface token (2026-08-02, v6, basic-host)** — the app template now mounts `structuredContent.tree` natively (DOM from data, in-place patching); the invoice renders pixel-identical to the HTML-injection era (the pass condition), and a dark theme with `surface` set shows cards visibly lifted off the page background. Schema `pattern` verified via curl and visually (the template's error notice shows the violation): a digit-less `lineTotal` fails with `INVALID_TYPE` at `data.lines.0.lineTotal`; tree/html image inlining verified in lockstep through production.
- **Slimming + hint diagnostics (2026-08-01, v5, VS Code Copilot)** — the self-correction loop works end-to-end: given deliberately broken hints (`colums` typo, `fieldFormat` on `table`), the first render succeeded with two `Hint notes:`, and the agent unprompted renamed `colums` → `columns`, dropped the unsupported hint, re-rendered clean, and attributed both fixes to the tool feedback. The slim confirmation line also held: no restatement of widget data as text. Env path (`WIDGENTIC_ASSUME_UI=1` over stateless HTTP) verified via curl: slim line + intact `structuredContent.html`, diagnostics array present, `isError` unset.
- **Image rendering (2026-07-31 → 08-01, v3/v4)** — `img` elements mount inline with the correct `wg-img-*` classes in both **VS Code Copilot** and **basic-host** (auto-detect and `hints.images` paths; `fieldFormat` coexists on sibling fields; suppression and hostile-URL rejection verified visually). Apps-host sandbox CSP blocks fetching **external** image URLs (basic-host: exactly `img-src 'self' data: blob:`) while `data:` is universally allowed — so since v4 the server **inlines image bytes as `data:` URIs at render time** on the iframe-facing surfaces (structuredContent fragment + `ui://` resource; model-facing HTML and `format: "page"` keep original URLs). The fetch is SSRF-guarded (https-only, private/metadata address rejection per redirect hop, `image/*` only, 1 MiB / 4 s / 8-images caps); any failure falls back to the original URL, where the alt-text broken-image state is the safety net. Verified in production via curl: external `picsum` image → `data:image/jpeg` in structuredContent; `https://169.254.169.254/...` refused and left un-inlined. Visually confirmed against v4 in **VS Code Copilot** and **basic-host** (full 5-payload sweep): round table avatars and a full-width card hero display as real pixels from external URLs (server-inlined), data-URI swatch renders, suppression and hostile-URL rejection hold, dark theme intact.
