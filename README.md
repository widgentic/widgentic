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
| `widget-catalog` | `widgentic/catalog` | Built-ins (`card`, `table`, `tree`, `custom`), registration API, pure `WidgetNode` render tree, `renderToHtml` + `mountNode` |
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
npm run mcp   # starts the stdio server (tools: list_widgets, render_widget)
```

- `list_widgets` — returns every registered kind's descriptor: purpose, expected `data` shape, an example to imitate, and supported hints.
- `render_widget` — input `{ widget, data, hints?, meta? }`; validates the id and payload, then returns the rendered HTML **plus** an embedded widgentic payload block (aware hosts mount it natively). Invalid input comes back as a structured, correctable error (`UNKNOWN_KIND`, `MISSING_FIELD`, ...).

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

### Testing without Claude

- **MCP Inspector** (interactive UI): `npx @modelcontextprotocol/inspector npx tsx examples/mcp-server/main.ts`
- **Raw stdio**: pipe newline-delimited JSON-RPC (`initialize` → `notifications/initialized` → `tools/list` → `tools/call`) into `npm run mcp`.
- **In-process**: the SDK interop suite (`src/mcp-server/__tests__/sdk-interop.test.ts`) runs client and server over an in-memory transport on every `npm test`.

## Status

All nine capabilities are implemented and tested (`npm test` — unit, type, DOM, and MCP interop suites). Development is spec-first via OpenSpec: see `openspec/specs/` for current behavior and `openspec/changes/archive/` for the change history. Planned next: `render_widget` extensions (per-kind data schemas, theme input, format selection) and a widget designer UI on top of `widgentic/templates`.

## Reference material

See `reference-links.md` for MCP, UI runtime, and design system references that inform widgentic's direction.
