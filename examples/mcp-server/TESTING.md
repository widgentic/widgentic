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

Rotate the key with `az containerapp secret set -n widgentic-mcp -g widgentic-rg --secrets widgentic-api-key=<new>` followed by a revision restart. DNS lives in Cloudflare: CNAME `mcp` → the app FQDN (DNS only / grey cloud — required for the Azure-managed certificate) plus the `asuid.mcp` TXT validation record.

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
