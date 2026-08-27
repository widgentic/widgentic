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
