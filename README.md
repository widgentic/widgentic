# widgentic

**Widgets for agents.** widgentic is the UI layer for MCP skills, plugins, and agent tools that need to show structured data — JSON, CSV, or anything an agent assembles — as friendly, generic widgets (cards, tables, trees, custom).

It is the only UI an agent needs to render data from external services and APIs.

## Why

Agents call tools and APIs that return structured data. Each tool today reinvents how to present that data in chat or canvas surfaces. widgentic provides one consistent, agent-friendly contract and a small set of generic widgets, so any MCP-aware host can render rich tool output without bespoke UI per tool.

## Capabilities

All capabilities are specified under `openspec/specs/` and implemented with zero runtime dependencies:

| Capability | Package entry | What it does |
|--|--|--|
| `widget-contract` | `widgentic/contract` | The normalized payload `{ kind, data, hints?, meta? }` + `validateWidgetPayload` |
| `data-adapters` | `widgentic/adapters` | `parseJson` / `parseCsv` with structured errors and opt-in type inference |
| `widget-mapper` | `widgentic/mapper` | `inferKind` / `mapToWidget`: default widget selection from data shape |
| `widget-catalog` | `widgentic/catalog` | Built-ins (`card`, `table`, `tree`, `custom`), registration API, pure `WidgetNode` render tree, `renderToHtml` + `mountNode`, image-aware card fields and table cells (avatars/thumbs/heroes via `hints.images`) |
| `mcp-widget-output` | `widgentic/mcp` | The MCP convention: emit/extract widget payloads, capability negotiation — no SDK dependency |
| `reactive-rendering` | `widgentic/reactive` | `mountWidget` handles with in-place DOM patching (identity-preserving updates) |
| `template-widgets` | `widgentic/templates` | Serializable JSON template DSL (`bind`/`each`/`when`) — the widget-designer runtime, safe for untrusted authors |
| `widget-theming` | `widgentic/theming` | `--wg-*` token registry, generated base stylesheet, themes as validated JSON |
| `mcp-server` | `widgentic/mcp-server` | The Widgentic MCP server: `list_widgets` (descriptor discovery) + `render_widget` (validate → render → HTML + payload), as SDK-free handlers plus a runnable stdio server |

## Architecture

```
External API / Agent data
        │
        ▼
  Data adapter (JSON | CSV | passthrough)      widgentic/adapters
        │
        ▼
  Widget mapper ──► { kind, data, hints?, meta? } ◄── widgentic/contract
        │
        ▼
  MCP widget output (tool ⇄ host convention)   widgentic/mcp
        │
        ▼
  Widget catalog → card · table · tree · custom · registered/template kinds
        │
        ▼
  Reactive renderer (WidgetNode diff → DOM patch) + theming (--wg-* tokens)
```

## End to end

```ts
import { parseCsv } from "widgentic/adapters";
import { mapToWidget } from "widgentic/mapper";
import { toWidgetResult, extractWidgetPayload, hostSupportsWidgets } from "widgentic/mcp";
import { createCatalog } from "widgentic/catalog";
import { mountWidget } from "widgentic/reactive";
import { injectBaseStyles, applyTheme, darkTheme } from "widgentic/theming";

// Tool side: parse data, pick a widget, emit an MCP result.
const parsed = parseCsv(csvText);
const payload = mapToWidget({ data: parsed.ok ? parsed.records : [], meta: { title: "People" } });
const result = hostSupportsWidgets(clientCapabilities) ? toWidgetResult(payload) : /* text */ undefined;

// Host side: extract, mount, theme, and keep updating in place.
const catalog = createCatalog();
const extraction = extractWidgetPayload(result, { knownKinds: new Set(catalog.kinds()) });
if (extraction.found && extraction.ok) {
  injectBaseStyles(document);
  applyTheme(container, darkTheme);
  const mount = mountWidget(extraction.payload, container, { catalog });
  // later: mount.update(nextPayload) patches the DOM without losing state
}
```

Custom widgets come in two flavors:

```ts
// Code (trusted developers): a pure renderer function
catalog.register("badge", (payload) => ({ tag: "span", attrs: { class: "badge" }, children: [String(payload.data)] }));

// Data (untrusted authors / widget designers): a serializable template
import { registerTemplate } from "widgentic/templates";
registerTemplate(catalog, "invoice", {
  tag: "div",
  children: [
    { tag: "h2", children: [{ bind: "$meta.title" }] },
    { each: "lines", template: { tag: "li", children: [{ bind: "item" }, ": ", { bind: "amount" }] } }
  ]
});
```

## Run the Widgentic MCP server

widgentic is itself an MCP server: any MCP client can discover the available widgets and ask widgentic to validate and render for it.

```bash
npm run mcp        # stdio server
npm run mcp:http   # Streamable HTTP on :3001/mcp (for HTTP hosts and Apps testing)
# tools: list_widgets, list_theme_tokens, render_widget
```

- `list_widgets` — returns every registered kind's descriptor: purpose, expected `data` shape, an example to imitate, and supported hints.
- `render_widget` — input `{ widget, data, hints?, meta? }`; validates the id and payload, then returns the rendered HTML **plus** an embedded widgentic payload block (aware hosts mount it natively). Invalid input comes back as a structured, correctable error (`UNKNOWN_KIND`, `MISSING_FIELD`, ...).

### Hosted endpoint

The server is deployed on Azure Container Apps behind a custom domain:

```
https://mcp.widgentic.dev/mcp        (Streamable HTTP, API key required)
https://mcp.widgentic.dev/healthz    (unauthenticated health check)
```

The API key is accepted two ways: an `x-api-key` header (hosts with header
support, e.g. VS Code Copilot), or a `?key=` query parameter
(`https://mcp.widgentic.dev/mcp?key=…`) for hosts whose connector settings
cannot send custom headers — claude.ai and Claude Desktop remote connectors.
`widgentic.dev` itself is reserved for the future registration/designer app,
which will own per-user key issuance; for now the single API key is
distributed out-of-band. The deployment is fully described by [infra/main.bicep](infra/main.bicep)
(Log Analytics, private ACR pulled via a pre-granted user-assigned identity,
managed environment, scale-to-zero app with the key as a Container Apps
secret). To ship a new version:

```bash
az acr build -r <registry> -t widgentic-mcp:vN .
az deployment group create -g widgentic-rg -f infra/main.bicep \
  -p image=<registry>.azurecr.io/widgentic-mcp:vN -p apiKey=<current-key>
```

### Register with Claude Code

This repo ships a project-scoped [`.mcp.json`](.mcp.json), so Claude Code picks the server up automatically: open a session in this workspace, approve the server when prompted, and confirm with `/mcp`. Then just ask — *"list the available widgets"*, *"render an invoice widget for ..."*.

To register it outside this project instead:

```bash
claude mcp add widgentic -- npx tsx /path/to/widgentic/examples/mcp-server/main.ts
```

For Claude Desktop, add to `claude_desktop_config.json` (absolute paths — Desktop has no working directory):

```json
"widgentic": {
  "command": "npx",
  "args": ["tsx", "/path/to/widgentic/examples/mcp-server/main.ts"]
}
```

### Inline widgets in Apps-capable hosts

Hosts that support MCP Apps (Claude Desktop among them) can display widgets
**inline in the conversation**. The server implements the official convention
(spec 2026-01-26, via `@modelcontextprotocol/ext-apps`): `render_widget`
declares its app template (`_meta.ui.resourceUri` → `ui://widgentic/app.html`,
`text/html;profile=mcp-app`), the host mounts it in a sandboxed iframe, and
every render streams into it as `structuredContent` (fragment + CSS + payload).
For legacy embedded-resource hosts (mcp-ui lineage), `format: "app"` also
carries the self-contained styled page inline. Widget content stays script-free
with zero external references; the widgentic payload block is always included
for natively mounting hosts, and a text fallback covers everyone else.

Register the server in Claude Desktop (`claude_desktop_config.json`, absolute
paths) and ask for a widget render — Apps-capable versions mount the page in
chat. Non-aware hosts (including Claude Code's terminal chat) receive the same
result as text; there, use `format: "page"` and open the document in a browser
instead.

Inline mounting is verified in the official **basic-host** reference and
**VS Code Copilot Chat** (all five widget kinds, live host re-theming);
Claude Code degrades gracefully to text. Full runbooks — local basic-host
setup, remote rig, host registration snippets — live in
[examples/mcp-server/TESTING.md](examples/mcp-server/TESTING.md).

### Testing without Claude

- **MCP Inspector** (interactive UI): `npx @modelcontextprotocol/inspector npx tsx examples/mcp-server/main.ts`
- **Raw stdio**: pipe newline-delimited JSON-RPC (`initialize` → `notifications/initialized` → `tools/list` → `tools/call`) into `npm run mcp`.
- **In-process**: the SDK interop suite (`src/mcp-server/__tests__/sdk-interop.test.ts`) runs client and server over an in-memory transport on every `npm test`.

## Status

All nine capabilities are implemented and tested (`npm test` — unit, type, DOM, and MCP Apps interop suites; zero runtime dependencies). `render_widget` supports per-kind data schemas, formatting hints, themes, format selection, and MCP Apps inline mounting — visually verified in two production-grade Apps hosts (see [TESTING.md](examples/mcp-server/TESTING.md)). The server is live at `https://mcp.widgentic.dev/mcp` (Azure Container Apps, IaC in [infra/](infra/)). Development is spec-first via OpenSpec: see `openspec/specs/` for current behavior and `openspec/changes/archive/` for the full change history (14 changes). Earned backlog for the next cycle: capability-aware model-context slimming, native reactive mounting in the app template, hint-coherence diagnostics, bounded schema pattern checks, a `--wg-surface` token, and the widget designer UI on top of `widgentic/templates`.

## Reference material

See `reference-links.md` for MCP, UI runtime, and design system references that inform widgentic's direction.
