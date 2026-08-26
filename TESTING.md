# Widgentic — testing & operations runbook

Everything runnable, hosted, and learned the hard way: local entries, the
Apps rig, production for both container apps, and host registration.

## Entries

| Command | Transport | Use for |
|--|--|--|
| `npm run mcp` | stdio | Claude Desktop, Claude Code, any stdio client |
| `npm run mcp:http` | Streamable HTTP (stateless) on `:3001/mcp` | VS Code Copilot (HTTP), MCP Apps hosts, curl |
| `npm run web` | HTTP on `:3002` | The authoring app locally (`WIDGENTIC_DEV_LOGIN=1` for subject-only sign-in; add `WIDGENTIC_COSMOS_ENDPOINT` to author against live data). A stored entry opens READ-ONLY when selected — `Edit` makes it editable; that is the flow, not a bug) |
| `npm run designer` | HTTP on `:8082` | The designers in a demo host (widget + theme + action tabs); rig: `:9446` |
| *(env)* `WIDGENTIC_LOCAL_KEK=<64 hex>` | — | Enables secrets on a local rig (development cipher; `openssl rand -hex 32`). Production uses `WIDGENTIC_KEK_ID` (Key Vault) instead |
| *(env)* `WIDGENTIC_EXECUTE_RATE=<n>` | — | `execute_action` per-principal executions per minute (default 60) |
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

**Currently deployed: `v55`** (v54 + verification pass: execution limiter extracted to `src/mcp-server/rate-limit.ts`, no behavior change; v54 = designer round 3: action menu only on button/a, schema-copy label, busy states, top notification banner; v53 = designer round 2: attribute-bind path dropdowns, real selects in the mapping editors; v52 = designer fixes: output-map completions from both schemas with a type-mismatch flag, ref-resolved path dropdowns; v51 = actions inside `group` renders: descriptors carry `widget`/`at`, `execute_action` takes `at`/`item`, group loads; v50 = model-facing `Action notes`, fresh-listing tool description, actions in the authoring guide; v49 = widget actions: `execute_action`, the app template's action layer, the secrets KEK in `widgentickv` with both identities granted wrap/unwrap; v47 carried the temporary probe, v48 removed it) (both container apps share one image; check with `az containerapp list -g widgentic-rg --query "[].properties.template.containers[0].image"`).

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

**Redeploy contract v3 (hardening pass, 2026-08-22) — Key Vault references:**
the three secrets live in Key Vault `widgentickv` (`widgentic-api-key`,
`widgentic-session-secret`, `widgentic-github-client-secret`) and the
committed `infra/deploy.params.template.json` references them — the params
file holds NO secret material and is safe to copy anywhere. To deploy:

```bash
cp infra/deploy.params.template.json /tmp/deploy.params.json
sed -i 's/widgentic-mcp:vNN/widgentic-mcp:v41/' /tmp/deploy.params.json   # target tag
az deployment group create -g widgentic-rg -f infra/main.bicep -p @/tmp/deploy.params.json
```

ARM resolves the references at deployment time; the deployer needs
`Key Vault Secrets User` (or Officer) on the vault. This SUPERSEDES the
recover-from-live dance for secrets — domains still come from the
template (kept current in git). The old contract above remains the
recipe if the vault is ever unavailable.

**Redeploy contract v4 (widget-actions, 2026-08-25) — the secrets KEK:**
`main.bicep` now creates an RSA key `widgentic-kek` in the EXISTING vault
`widgentickv` (param `keyVaultName`; empty disables secrets) and grants both
managed identities `Key Vault Crypto Service Encryption User` on that key
(wrap/unwrap only — no secret-read permission anywhere). Both apps receive
`WIDGENTIC_KEK_ID` (the versioned key URI). Requirements: the deployer needs
a data-plane role that can create keys (`Key Vault Crypto Officer` or
`Key Vault Administrator`) on the vault for the FIRST deploy; later deploys
are no-ops on the key. Rotation = create a new key version, redeploy (the
env picks up the new version), then re-wrap stored records (the store's
re-wrap keeps ciphertext intact). The MCP identity stays Cosmos read-only.
Secret-bearing actions fail cleanly (`ACTION_FETCH_FAILED`/`UNKNOWN_SECRET`)
when the vault is unreachable; renders and prompt actions never touch it.

**Widget actions runbook:** actions are per-principal entities (Actions tab),
secrets are write-only (Secrets tab; disabled with a reason when no cipher
is configured), and keys carry fixed scopes (`execute` opt-in at creation —
existing keys stay read-only). Host support matrix from the 2026-08-25
probe (verification log below): app-initiated `tools/call` is proxied by
basic-host, claude.ai and VS Code Copilot Chat; `ui/message` works on all
three but is advertised by claude.ai only, so the frame never gates prompts
on the flag; `ui/message` on both production hosts PREFILLS the composer —
the user sends. Grep production logs for `execute_action rate-limited` to
see throttling.

**Never print secrets.** Secret values must not appear in terminal
output, chat transcripts, or logs — the 2026-08 rotation happened because
params files were printed for verification. Generate piped
(`az keyvault secret set --value "$(openssl rand -hex 32)"`), and verify
params files masked:

```bash
python3 -c "import json;d=json.load(open('FILE'));[d['parameters'][k].update(value='***') for k in ('apiKey','sessionSecret','githubClientSecret') if 'value' in d['parameters'].get(k,{})];print(json.dumps(d,indent=1))"
```

**API-key rotation in store mode (learned 2026-08-22):** with a store
configured, the WIDGENTIC_API_KEY env is NOT the gate — keys are Cosmos
principal rows, and an unknown key is DEMOTED to the anonymous catalog
(built-ins), never 401. Rotating the production key therefore means store
surgery, not just a redeploy: resolve the bootstrap principal with the old
key, `createKey` a replacement (raw value straight to the vault via
`--file`, never stdout), `revokeKey` the old one, and verify the old key
now lists built-ins only while the vault key lists the principal's customs
(`invoice`, `x-post`). The vault's `widgentic-api-key` is the single
source of truth; the env copy only matters for no-store deployments.

**Identity decision record (2026-08-22):** the Entra External ID flow is a
public client with PKCE — NO client secret exists on the app registration,
and none may be added (redirect URIs live under *Mobile and desktop* for
exactly this reason). GitHub OAuth requires its client secret by protocol —
it is a permanent Key Vault rotation item. If a confidential Entra client
is ever introduced (Graph, OBO), use a FEDERATED CREDENTIAL bound to the
container app's managed identity (App registrations → Certificates &
secrets → Federated credentials → scenario "Managed identity") — never a
stored client secret.

**Rate-limit posture (2026-08-22):** API-key auth compares SHA-256 digests
in constant time but is unthrottled — brute force costs one HTTPS
round-trip per guess against a 256-bit keyspace (not practical; recorded
so nobody rediscovers it as a finding). Auth routes are safe-by-shape
(dev login is hard-disabled whenever an issuer is configured). If
throttling is ever needed, Container Apps ingress IP restrictions are the
first knob.

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

**Account linking (v41–v43):** one person, both methods, one principal —
linked subjects resolve through a one-hop alias profile (`linkTo`) so
Cosmos stays point-read; the canonical profile carries `linkedSubjects`
with display labels (GitHub login / email claim). The link flow is the
provider's own flow carrying a sealed session-bound intent; the callback
re-verifies the live session and never mints one. Conflicts refuse with
`SUBJECT_IN_USE` (emptiness counts unrevoked keys); the canonical subject
is `CANNOT_UNLINK_PRIMARY`. STANDING RULE (learned when v42 crashed
production boot on v41-era data): any persisted-shape change ships with a
normalization seam and an old-shape regression test — live Cosmos
documents never migrate themselves. Links written before v42 are plain
subject strings, normalized on read; they gain labels only on relink.

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

- **Widget actions, designer round 3 (2026-08-26, v54, user findings)** — (1) the tree's add menu offered `action` on every element; now only on `button` and `a` (existing bindings anywhere stay editable); (2) the action designer's "copy from shared schema…" was a real copy — the action model stores schemas inline on purpose so an action's contract cannot drift when a shared schema is edited — relabeled as a copy with a note; (3) async operations (save/delete/keys/secrets/test call) had no feedback — the acting button now shows a busy spinner and is disabled while the banner reads a pending message; (4) the status text sat bottom-right where nobody reads it — notifications moved to a dismissible banner under the header with an error tone for failures. Task 8.8.
- **Widget actions, designer round 2 (2026-08-26, v53, user findings)** — two more authoring gaps from live use of the widget designer: (1) bound ATTRIBUTE values (`img src`/`alt` binds) still rendered as free text while bind/each/when nodes had the schema-driven dropdown — attribute binds now use the same `pathControl` (row marker `wgd-attr-value` preserved on the wrap); (2) the mapping editors used `<input list>` datalists, whose browser arrow looks like a dropdown but only offers typed suggestions — replaced with real selects (known paths, the off-schema current value, a `custom…` escape) for input mappings and both output-map columns. Task 8.7.
- **Widget actions, legs 2 and 3 complete: claude.ai and VS Code Copilot Chat with an execute key (2026-08-25, v51, user-driven)** — `weather-secure` (shared WeatherAPI action, key in a secret) loads its reading on first render, Refresh re-renders in place, the prompt lands in the composer, and the `group` composition (card + forecast table) refreshes the card item in place — on both hosts. One authoring defect surfaced on the way: the widget's data schema declared `reading.temperature` as `string` while the response carries a number, so the fold failed with `INVALID_TYPE data.reading.temperature` — correct server behavior, but the designer let it happen: the output `map` editor offered no target/source paths and no type check. Designer findings (task 8.6): output-map targets from the widget's data schema (relative to the `patch` path), sources from the action's output schema, a type-mismatch diagnostic; and the template panel's path dropdowns must resolve a shared `dataSchemaRef` (they only read an inline `dataSchema`, so ref-based widgets got plain text boxes).
- **Widget actions, leg 2 (second pass): claude.ai with an execute key (2026-08-25, v50, user-driven)** — with the `Action notes:` tail the model explained the disabled Refresh correctly ("your current API key lacks the execute scope … a key with execute would light it up; Ask about today is a prompt action, which works on any key") — finding 2 of the first pass closed. With an `execute` key the agent spontaneously composed a `group`: the bound `weather-secure` card on top and an 8-day table from another source below — and the card's Refresh failed with `Widget 'group' has no action binding 'children.2.children.0'`: item descriptors were compiled against the ITEM's template but the frame named the ROOT kind. Fix (v51): descriptors carry `widget` (their own kind) and, stamped by group composition, `at` (`data.items.<i>`, nested groups prefix outward); the frame passes both, `execute_action` resolves the binding on the item's kind, folds the response into that item and re-renders the whole group; group items' `load` bindings ride `structuredContent.loads` and fire one after another. Recorded as task 5.8 and a `widget-catalog` delta.
- **Widget actions, leg 2 (first pass): claude.ai with a read-only key (2026-08-25, v49, user-driven)** — `weather-secure` (shared `weather-current` action against WeatherAPI.com with the key in a secret) rendered inline on claude.ai under a READ-ONLY key: the http Refresh rendered disabled with the correct tooltip ("This key cannot run widget actions (it lacks the execute scope)."), the prompt button stayed live, no load fired — exactly the specified read-only behavior. Two findings: (1) the agent answered "what widgets do I have" from an earlier `list_widgets` result instead of re-querying — the tool description now demands a fresh call (catalogs are per key and change between calls); (2) the model had no way to know WHY the button was disabled and guessed (format? secret?) — `render_widget`/`execute_action` text now ends with an `Action notes:` tail naming the action kinds, `load`, and the `disabled` reason in plain terms, and `get_authoring_guide` documents actions, `disabled` reasons and the `execute` scope (shipped as v50). The execute-key pass of this leg and the Copilot leg are pending.
- **Widget actions, leg 1: basic-host with a bound widget (2026-08-25, headless-driven, local file-store rig)** — the reference `weather` widget (`examples/mcp-server/widgets/weather.ts`: inline http GET against Open-Meteo bound to a Refresh button and to the widget-level `load`, plus a `prompt` button) served from a file store whose key carries `execute`, mounted by basic-host and driven headless (`scratchpad/drive-actions.cjs`). Observed: descriptors render with resolved arguments (`{ latitude, longitude, current_weather: true }`) and prompt text (`What should I wear today in Vancouver?`); `load` fires exactly once after the first result and the live reading lands (`Vancouver 23 °C · wind 5.7 km/h`) through `execute_action` → guarded fetch → `patch` at `reading`; the host's Model Context panel shows the update (`Widget 'weather' updated by action 'load'…`); Refresh sets `aria-busy`/`wg-busy` while in flight, re-renders in place, keeps the alert hidden, and updates the context again (`children.2.children.0`); the prompt lands as `[user] What should I wear today in Vancouver?` in the host's Messages panel. Two defects found and fixed on the way: an output `map` target of `"."` wrote a literal key (now means "the whole projection"), and a first drive timed out on a slow Open-Meteo answer (transient; the second run completed in seconds). Legs 2/3 — claude.ai and VS Code Copilot Chat against production v49 with an `execute` key — pending.
- **Widget-actions probe, leg 3: VS Code Copilot Chat (2026-08-25, VS Code 1.134.0, user-driven against the tailnet rig)** — `hostInfo` `{"name":"Visual Studio Code","version":"1.134.0"}`, protocol `2026-01-26`; `hostCapabilities` = `openLinks`, `serverTools{listChanged}`, `serverResources{listChanged}`, `logging`, `sandbox{permissions:{clipboardWrite}}`, `updateModelContext{audio,image,resourceLink,resource,structuredContent}` (no `text`!), `downloadFile` — again **no `message` flag, yet `ui/message` → `{"isError":false}` and the text was appended to the chat composer as a draft**, claude.ai's model exactly. App-initiated `tools/call` proxied (auto + button); "Discovered 7 tools, 6 visible in tool selector" — the app-only tool is hidden from the selector. `ui/update-model-context` accepted for text and structured; from the screenshot the context text surfaces as a removable attachment chip above the composer. App-side `tools/list` → `-32601 Method not found: tools/list`. **Three-host conclusions for the widget-actions change:** (a) `serverTools` is advertised by all three hosts and is a reliable gate for `http` actions; (b) `message` is advertised by 1 of 3 hosts while all 3 support `ui/message` — prompt actions must NOT be gated on the flag: enable them, and treat `-32601` (the consistent unsupported-method signal on every host) with the inline alert; (c) the `updateModelContext` modality sets are three different, mutually inconsistent lists and every host accepted both forms — send BOTH `content:[{type:"text"}]` and `structuredContent` in one request; (d) `ui/message` on both production hosts means "prefill the composer, the user sends" — a `prompt` action proposes, never triggers; (e) app-side `tools/list` is proxied nowhere — the server must ship everything the widget needs in `structuredContent`; (f) app-only tools are hidden from the model on all three hosts (claude.ai and Copilot still show them to the USER), while the SDK server lists them — a non-Apps client sees them as ordinary tools.
- **Widget-actions probe, leg 2: claude.ai (2026-08-25, v47, user-driven + Log Analytics)** — the same probe against production from a claude.ai custom connector. `hostInfo` `{"name":"Claude","version":"1.0.0"}`, protocol `2026-01-26`; `hostCapabilities` = `openLinks`, `downloadFile`, `serverTools{listChanged}`, `serverResources{listChanged}`, `logging`, `updateModelContext{text,image}`, `message{text}`, `sandbox{}` — the DRAFT-spec capability shape, so claude.ai DOES advertise `message` where basic-host does not (taken together: flag present ⇒ enable; flag absent ⇒ inconclusive, not "unsupported"). (1) App-initiated `tools/call` of the app-only tool is proxied (auto-fire at initialize + button), arriving at production under the connector's key; the connector settings list `probe_app_call` separately under "App-only tools (1)" — hidden from the model's list, visible to the user. (2) `ui/message` → `{}` and **the text lands in the chat composer as a prefilled draft — the user must press send**; nothing is auto-submitted (claude.ai's consent model). Design consequence: a `prompt` action is "propose a message", never "trigger the agent". (3) `ui/update-model-context` accepted for both `structuredContent` and text (`{}`) though only `text`+`image` are advertised; whether `structuredContent` actually reaches the model is unverified (ask the model in a later turn of the same conversation). (4) App-initiated `tools/list` → `-32601`, as on basic-host: not part of the proxied surface on any host so far. Ops notes: `az containerapp logs show` tails only the CURRENT replica (scale-to-zero cycles them) and the platform strips the leading `widgentic ` token from the line, so grep for `probe: app tools/call`; Log Analytics (`ContainerAppConsoleLogs_CL`, workspace `68663928-10e3-4098-8f6c-8d1952fe0632`) is the durable record — the `az monitor log-analytics` extension installs on first use (preview). Probe UI defect found by the user: the panel was `position:fixed`, which the size-changed ResizeObserver never measures, so on a small widget the buttons left the iframe after the first click — fixed in-tree by making the panel in-flow (v47 still has it; use a tall widget or the local rig).
- **Widget-actions probe, leg 1: basic-host (2026-08-25, ext-apps 1.7.5 reference host, headless-driven)** — temporary probe (commit `1f0533a`): `probe_app_call` registered with `_meta.ui.visibility: ["app"]`, plus a corner panel in the app template that captures the `ui/initialize` result and exercises app→host requests, classifying each ok/error/timeout and echoing every outcome to the server log through the probe tool. Findings: (1) `hostCapabilities` = `openLinks`, `serverTools{listChanged}`, `serverResources{listChanged}`, `updateModelContext{text}` — **no `message` flag, yet `ui/message` returned `{}` and the host rendered it as a `[user]` message**: a missing flag does not mean unsupported, even on the reference host, so prompt actions cannot be gated on it (the published 2026-01-26 spec has no such flag; the draft spec and the 1.7.5 types do). (2) `updateModelContext` advertises `text` only, but a `structuredContent` update was accepted (`{}`) too; the host shows only the latest update (overwrite semantics confirmed). (3) App-initiated `tools/call` of the app-only tool is proxied end-to-end — widget → host → widgentic → back to the widget as the RPC result; six calls landed in the server log with the full capability payload. (4) App-initiated `tools/list` → JSON-RPC `-32601 Method not found`: unsupported methods error rather than vanish, so the error class is a usable runtime signal here. (5) The host filters `visibility: ["app"]` tools out of its model-facing list (`isToolVisibleToModel`) while the SDK server's own `tools/list` still returns them — filtering is entirely the host's job (the sdk-interop expectation is widened for the probe window). Rig notes: basic-host has no local `tsx` (run it with the repo's); the Chrome DevTools MCP plugin needs a display, but its cached `puppeteer-core` drives `/usr/bin/google-chrome` headless, including `frame.evaluate` inside the sandboxed widget frame (`scratchpad/drive.cjs` pattern). Legs 2 and 3 (claude.ai, VS Code Copilot Chat) above.
- **Group widget kind (2026-08-21, v32, rig + production + basic-host)** — multi-widget single render verified at three levels: a JSON-RPC probe against `mcp:http` with a file store (mixed group of built-in card + stored custom `person-card` + table in a grid container with the exact `wg-group wg-group-grid wg-gap-lg wg-cols-2` classes; the custom kind's styles present in the css union; 5-card stack; item errors re-pathed `data.items[<i>].…`; per-item hint diagnostics prefixed `data.items[<i>].hints.`); the same probe against production v32 (steering on the tool description, `group` listed, live grid render); and a user-driven basic-host layout sweep over the tailnet rig (stack/row/grid, gap presets, dark theme). Two implementation notes: the handler's UNKNOWN_KIND "available widgets" rewrite is scoped to `path === "kind"` so item errors keep their indexed paths, and `analyzeHints` needed a kind-aware branch because group's `columns` hint is a NUMBER while table's is a string[]. Seeding gotcha for file-store rigs: `StoredWidget` is flat `{ kind, template, descriptor }`.
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
