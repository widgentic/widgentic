# Widgentic — testing & operations runbook

Everything runnable, hosted, and learned the hard way: local entries, the
Apps rig, production for both container apps, and host registration.

## Entries

| Command | Transport | Use for |
|--|--|--|
| `npm run mcp` | stdio | Claude Desktop, Claude Code, any stdio client |
| `npm run mcp:http` | Streamable HTTP (stateless) on `:3001/mcp` | VS Code Copilot (HTTP), MCP Apps hosts, curl |
| `npm run web` | HTTP on `:3002` | The authoring app locally (`WIDGENTIC_DEV_LOGIN=1` for subject-only sign-in; add `WIDGENTIC_COSMOS_ENDPOINT` to author against live data). A stored entry opens READ-ONLY when selected — `Edit` makes it editable; that is the flow, not a bug) |
| `npm run designer` | HTTP on `:8082` | Both designers in a demo host (widget + theme tabs); rig: `:9446` |
| *(hosted)* `https://mcp.widgentic.dev/mcp` | Streamable HTTP, API key required | Any HTTP host, no local setup |
| *(hosted)* `https://widgentic.dev` | HTTPS | Accounts, API keys, both designers against production Cosmos |

Quick checks without any host:

```bash
npx @modelcontextprotocol/inspector npx tsx examples/mcp-server/main.ts   # interactive UI
npm test                                                                  # incl. SDK interop suite
npm run build                                                             # packaging + declarations
```

Two protocol-level smokes worth running against any deployment, because
neither shows up in a normal render check:

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
| `:9447` | `:3002` | the widgentic.dev app (`WIDGENTIC_DEV_LOGIN=1 npm run web`) |

The app on `:9447` signs in through the dev harness (`/auth/login` → subject +
label), which works over the tailnet as-is: the session cookie rides the same
HTTPS origin Caddy terminates. Both bundling servers (`npm run web`, `npm run
designer`) build their client at STARTUP — restart them after any client
change or the tailnet serves the old bundle.

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

`https://mcp.widgentic.dev/mcp` — the same HTTP server (`apps/mcp-server/http.ts`)
containerized and deployed via [infra/main.bicep](infra/main.bicep) to app
`widgentic-mcp` in resource group `widgentic-rg`. Scale-to-zero: the first
request after idle takes a few seconds. Since v11 the deployment runs in
**per-principal mode** (`WIDGENTIC_COSMOS_ENDPOINT` set by Bicep's
`mcpCosmosEnabled=true`): the presented key — `x-api-key` header or `?key=`
query parameter (for claude.ai / Claude Desktop remote connectors, whose
settings accept only a URL) — resolves against Cosmos by digest point read,
and the request is served that principal's composed catalog. An unknown or
revoked key degrades to the anonymous catalog — since v14, exactly the
built-in kinds (nothing is compiled into production; custom widgets come
from principals' stores, and the compiled-in path lives on as
`examples/mcp-server`) — never an error. The pre-portal production key is
seeded as the `bootstrap:production` principal owning stored copies of
`invoice` and `x-post`, so its catalog is unchanged from v10. The MCP
identity holds the Cosmos **read-only** role. `/healthz` is open for probes.

Smoke test:

```bash
curl https://mcp.widgentic.dev/healthz    # 200 ok
curl -X POST https://mcp.widgentic.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: <your-key>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
# → 200 with "serverInfo":{"name":"widgentic",...}. In per-principal mode a
#   missing/unknown key is NOT an error — it serves the anonymous catalog
#   (the 401 gate applies only to no-store deployments).
```

The hosted deployment sets `WIDGENTIC_ASSUME_UI=1`: stateless HTTP can't see
the client's negotiated capabilities at `tools/call` time, so the default
`render_widget` format returns the slim confirmation line instead of the full
HTML text block (Apps hosts mount the visual from `structuredContent`
regardless; explicit `format` values are never slimmed). Misaimed hints
surface as a `Hint notes:` tail + `structuredContent.diagnostics`.

**Hosts cache the app template per conversation** (observed at v19: a
Claude Desktop chat kept rendering with the pre-deploy
`ui://widgentic/app.html` it had fetched earlier — styles looked broken
while the server was already fixed). After deploying template-affecting
changes, verify in a FRESH conversation; the remote-host analog of the
local "reconnect after server changes" rule.

Key rotation is now self-service: create a new named key in the app, move
your hosts, revoke the old one (no downtime window). The legacy
`WIDGENTIC_API_KEY` secret still gates NO-store deployments only; in
per-principal mode the store decides. DNS lives in Cloudflare: CNAME `mcp` →
the app FQDN (DNS only / grey cloud — required for the Azure-managed
certificate) plus the `asuid.mcp` TXT validation record.

**Currently deployed: `v25`** (both container apps share one image; check with `az containerapp list -g widgentic-rg --query "[].properties.template.containers[0].image"`).

**Redeploy contract (learned at v11, extended at v14):** the Bicep template
owns the apps' ingress AND secrets. On every `az deployment group create`:
- ALWAYS pass the live custom-domain bindings (`mcpCustomDomains` /
  `webCustomDomains` with the managed-cert resource id), or the deploy
  silently unbinds the domain (observed: TLS reset on mcp.widgentic.dev
  until rebound with `az containerapp hostname add` + `hostname bind`).
- ALWAYS pass `sessionSecret` (and the GitHub/auth secrets) — an empty
  secure param REMOVES the container secret (observed at v14: sessions
  would break on every cold start). Recover the live value first, never
  from a scratch file:
  `az containerapp secret show -n widgentic-web -g widgentic-rg --secret-name widgentic-session-secret --query value -o tsv`

## The widgentic.dev app (production)

`widgentic-web` in the same environment serves the authoring app
(`apps/web/http.ts`, port 3002): sign-in, named API keys (shown once,
revocable), both designers wired to persistence. Its identity holds Cosmos
**Data Contributor**; the session cookie secret is the ACA secret
`widgentic-session-secret`. Email sign-in requires the Entra External ID tenant
(`WIDGENTIC_AUTH_ISSUER` / `WIDGENTIC_AUTH_CLIENT_ID` Bicep params);
GitHub sign-in is the app's own OAuth flow (`githubClientId` /
`githubClientSecret` params — External ID cannot federate GitHub; the
OAuth app's callback is `https://widgentic.dev/auth/github/callback`).
Until those are set the app serves but refuses sign-in.

Entra config lessons (learned live at v13):
- **Issuer**: external-tenant tokens carry the TENANT-ID host in `iss`
  (`https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0`), not the
  `<subdomain>.ciamlogin.com` form. Read it from the tenant's discovery
  document and configure that exact value — validation is exact-match.
- **Public client + PKCE**: redirect URIs must be registered under the
  **Mobile and desktop applications** platform. Under the Web platform,
  code redemption demands a secret (`AADSTS7000218`) even with "Allow
  public client flows" enabled — the platform of the redirect URI wins.

Local dev: `WIDGENTIC_DEV_LOGIN=1 npm run web` (honored only when no issuer
is configured) gives a subject-only sign-in against an in-memory store —
add `WIDGENTIC_COSMOS_ENDPOINT` to author against live Cosmos with your
`az` credential.

Apex + `www` DNS (Cloudflare, live since 2026-08-14; all grey cloud):

```
A     widgentic.dev        20.12.149.224  (env static IP)
TXT   asuid.widgentic.dev  <domainVerificationId>
CNAME www                  widgentic-web.wittysand-0949e6e9.centralus.azurecontainerapps.io
TXT   asuid.www            <domainVerificationId>
```

Binding lesson (learned live): for the **apex**, bind with
`--validation-method HTTP` — a TXT-validated managed cert for an apex sat
`Pending` for over an hour and never completed; deleted and re-issued with
HTTP it succeeded in minutes (the environment answers the challenge through
the A record, so `hostname add` must come first). Subdomains (`www`, `mcp`)
validate fine via CNAME. After any binding change, pass the live bindings
as `mcpCustomDomains`/`webCustomDomains` on every deploy (see the redeploy
contract above). `docs.widgentic.dev` stays unclaimed for the static site
change.

## Per-principal store (local)

```bash
# Seed two principals, then run the server against the store
WIDGENTIC_STORE_DIR=/tmp/wg-store npm run mcp:http

# Each key sees its own catalog
curl -s -X POST "http://localhost:3001/mcp?key=<alice-key>" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_widgets","arguments":{}}}'
```

An unknown key falls back to the anonymous catalog (the built-ins); the
server logs the unresolved-key event **without** the key. Widgets that fail
validation are skipped with a stderr diagnostic naming the reason, so a
hostile or corrupt entry never reaches a catalog.

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

**Claude Code** (tool results are text; Claude Code does not mount MCP Apps UI):

```bash
claude mcp add widgentic -- npx tsx /path/to/widgentic/examples/mcp-server/main.ts
```

**Claude Desktop** (`claude_desktop_config.json`, absolute paths):

```json
{ "mcpServers": { "widgentic": { "command": "npx", "args": ["tsx", "/path/to/widgentic/examples/mcp-server/main.ts"] } } }
```

## Verification log

- **Verification fixes (2026-08-16, v25)** — a cross-spec verification against the archived `authoring-guidance` work turned up five defects, four of them live. The one worth remembering: the `:root` token-defaults block (added at v19 so custom styles could use bare `var(--wg-*)`) **severed the `surface → bg` fallback** — a CSS `var()` fallback fires only when the property is UNSET, so defining `--wg-surface` made `var(--wg-surface, var(--wg-bg, …))` unreachable and a dark theme setting only `bg` painted WHITE cards. The test that should have caught it regex-matched the stylesheet TEXT and passed throughout. Fallbacks now resolve where the theme is applied (`withFallbacks`), because a `:root` chain cannot work either: substitution happens at the declaring element and descendants inherit the already-resolved value. Also closed: a theme saved as `light`/`dark` passed validation then vanished during compose (`RESERVED_THEME` now refuses it at the door); the preview rendered blank when the FIRST draft was invalid; theme validation errors were computed and dropped; and the README's deploy recipe omitted every parameter whose Bicep default mutates live state.
- **Read-only view/edit flow (2026-08-16, v23/v24, browser sweep)** — the app's whole select → Edit → Save/Cancel cycle driven headlessly on BOTH tabs: selecting a stored entry opens it read-only with Edit/Delete, Edit swaps the row to Save/Cancel and hides New + "Save to my catalog", Cancel discards, and the preview plus its selectors stay live throughout. Lesson: opacity-only de-emphasis was invisible on dark chrome, so read-only also flattens control borders. v24 added the theme designer's custom-widget previews.
- **Token defaults and the dark bridge (2026-08-15, v19/v20)** — a flawless agent-authored widget rendered jammed: every `var(--wg-…)` named a real token, but NOTHING defined registry tokens where widgets render, so any token the active theme didn't set silently invalidated the declaration (DevTools: "--wg-spacing-lg is not defined"). Fixed with the `:root` defaults block. Layer two, found in a fresh chat: those defaults are LIGHT literals and the host bridge maps only 8 tokens, so an unbridged `surface` rendered a white card under a near-white bridged `fg` — the app template now flips the unbridged dark tokens under `:root[data-theme="dark"]`.
- **Wire-level tool descriptions (2026-08-15, v21/v22)** — an agent inlined a full token map for a theme the user named. Root cause was not the model: the assembly built `render_widget`'s zod schema by hand, so **definitions.ts descriptions never reached the wire** — agents saw a bare `anyOf` for `theme`. The fields now take their `.describe()` text from `RENDER_WIDGET_TOOL.inputSchema`, with a `tools/list` test. Invisible to every other test class.
- **basic-host (ext-apps v1.7.5 reference)** — full 7-input visual sweep: all five kinds inline, live host re-theming via `host-context-changed`, error-state notice.
- **VS Code Copilot Chat** — agent-driven end-to-end from a one-line steer; all five kinds mounted inline over HTTP.
- **Claude Code 2.1.220** — graceful degradation confirmed (text results, no UI mounting by design).
- **Production endpoint (mcp.widgentic.dev)** — deployed 2026-07-30; `/healthz`, 401-without-key, and keyed `initialize` handshake verified end-to-end through the custom domain with the Azure-managed certificate.
- **Theming foundation (2026-08-13, v9, local rig)** — inverse test: a complete `midnight-neon` theme entry (all 32 tokens + three `x-*` custom variables) was authored as JSON, imported into the **standalone theme designer**, saved, then selected as the preview theme in the **widget designer**. Confirms the split and the token system: color pickers appear only on `color`-typed tokens (chosen from `TOKEN_SPECS.type`, not guessed), identity fields populate on import, the table preview renders 40px circular avatars from `avatar-size`, and the custom `x-post` widget picks up the theme — including deriving its avatar box from `calc(var(--wg-avatar-size) * 1.5)` and lifting its card onto `surface` above `bg`. Named themes over the wire verified separately via curl against production: `list_themes`, `theme: "dark"` resolution, and `UNKNOWN_THEME` for an unregistered name.
- **Designer round-trip (2026-08-09, local rig)** — the `x-post` widget was authored/imported in the designer (`:9446`), exported, and pasted back via "Copy as TypeScript" into what is now `examples/mcp-server/widgets/x-post.ts` with no edits; it registers and renders through `render_widget`. Confirms images work in **custom template widgets**: bound `img src` values are inlined server-side as `data:` URIs on both iframe surfaces (2/2 in html and tree) while the model-facing text keeps the original URLs, and the `pattern`-constrained handle rejects `no-at` with `INVALID_TYPE @ data.author.handle`. Visually confirmed in basic-host: the full post shows real avatar and media pixels inside the sandbox (external URLs, server-inlined), and a minimal post correctly hides every `when`-gated block (avatar, media, timestamp, stats). Also verified agent-driven in **VS Code Copilot against production v7** from a no-JSON prompt: the agent read the descriptor, invented schema-valid data (including a handle matching `^@[A-Za-z0-9_]{1,15}$`), mounted both posts as visuals with images visible, hit the pattern error exactly on the invalid handle, and restated no data as text.
- **Native tree mounting + surface token (2026-08-02, v6, basic-host)** — the app template now mounts `structuredContent.tree` natively (DOM from data, in-place patching); the invoice renders pixel-identical to the HTML-injection era (the pass condition), and a dark theme with `surface` set shows cards visibly lifted off the page background. Schema `pattern` verified via curl and visually (the template's error notice shows the violation): a digit-less `lineTotal` fails with `INVALID_TYPE` at `data.lines.0.lineTotal`; tree/html image inlining verified in lockstep through production.
- **Slimming + hint diagnostics (2026-08-01, v5, VS Code Copilot)** — the self-correction loop works end-to-end: given deliberately broken hints (`colums` typo, `fieldFormat` on `table`), the first render succeeded with two `Hint notes:`, and the agent unprompted renamed `colums` → `columns`, dropped the unsupported hint, re-rendered clean, and attributed both fixes to the tool feedback. The slim confirmation line also held: no restatement of widget data as text. Env path (`WIDGENTIC_ASSUME_UI=1` over stateless HTTP) verified via curl: slim line + intact `structuredContent.html`, diagnostics array present, `isError` unset.
- **Image rendering (2026-07-31 → 08-01, v3/v4)** — `img` elements mount inline with the correct `wg-img-*` classes in both **VS Code Copilot** and **basic-host** (auto-detect and `hints.images` paths; `fieldFormat` coexists on sibling fields; suppression and hostile-URL rejection verified visually). Apps-host sandbox CSP blocks fetching **external** image URLs (basic-host: exactly `img-src 'self' data: blob:`) while `data:` is universally allowed — so since v4 the server **inlines image bytes as `data:` URIs at render time** on the iframe-facing surfaces (structuredContent fragment + `ui://` resource; model-facing HTML and `format: "page"` keep original URLs). The fetch is SSRF-guarded (https-only, private/metadata address rejection per redirect hop, `image/*` only, 1 MiB / 4 s / 8-images caps); any failure falls back to the original URL, where the alt-text broken-image state is the safety net. Verified in production via curl: external `picsum` image → `data:image/jpeg` in structuredContent; `https://169.254.169.254/...` refused and left un-inlined. Visually confirmed against v4 in **VS Code Copilot** and **basic-host** (full 5-payload sweep): round table avatars and a full-width card hero display as real pixels from external URLs (server-inlined), data-URI swatch renders, suppression and hostile-URL rejection hold, dark theme intact.
