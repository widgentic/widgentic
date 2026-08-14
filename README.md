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
| `widget-catalog` | `widgentic/catalog` | Built-ins (`card`, `table`, `tree`, `custom`), registration API, pure `WidgetNode` render tree, `renderToHtml` + `mountNode`, image-aware card fields and table cells (avatars/thumbs/heroes via `hints.images`), descriptor data schemas incl. ReDoS-bounded `pattern` |
| `mcp-widget-output` | `widgentic/mcp` | The MCP convention: emit/extract widget payloads, capability negotiation — no SDK dependency |
| `reactive-rendering` | `widgentic/reactive` | `mountWidget` handles with in-place DOM patching (identity-preserving updates) |
| `template-widgets` | `widgentic/templates` | Serializable JSON template DSL (`bind`/`each`/`when`) — the widget-designer runtime, safe for untrusted authors |
| `widget-theming` | `widgentic/theming` | `--wg-*` token registry (colors, status, scale steps), author-defined `x-*` custom variables, named-theme registry with `extends`, generated base stylesheet, themes as validated JSON |
| `mcp-server` | `widgentic/mcp-server` | The Widgentic MCP server: `list_widgets` (descriptor discovery) + `render_widget` (validate → render → HTML + payload) as SDK-free definitions/handlers, plus the full server assembly behind `widgentic/mcp-server/sdk` (MCP SDK as optional peers) |
| `widget-store` | `widgentic/store` | Per-principal widgets and themes: a persistence-agnostic port (`resolvePrincipal`/`widgets`/`themes`), memory + file reference implementations, hashed constant-time keys, structural limits, and request-scoped `composeCatalog`/`composeThemes` |
| `widget-designer` | `widgentic/designer` | Two embeddable designers (factories + opt-in custom elements, zero deps): the **widget** designer (template tree/JSON, full descriptor, styles, dataSchema, theme selection) and the standalone **theme** designer (tokens, custom variables, named entries) — both with live validated preview |

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
# tools: list_widgets, list_themes, list_theme_tokens, render_widget
```

- `list_themes` — the server's registered themes (`name`, `label`, `tokens`); pass any name as `render_widget`'s `theme` instead of composing tokens.
- `list_widgets` — returns every registered kind's descriptor: purpose, expected `data` shape, an example to imitate, and supported hints.
- `render_widget` — input `{ widget, data, hints?, meta? }`; validates the id and payload, then returns the rendered HTML **plus** an embedded widgentic payload block (aware hosts mount it natively). Invalid input comes back as a structured, correctable error (`UNKNOWN_KIND`, `MISSING_FIELD`, ...). Misaimed hints (misspelled keys, targets matching no field/column, unsafe image sources) never fail a render — they come back as a compact `Hint notes:` tail on the text output plus `structuredContent.diagnostics`, so agents can self-correct on the next call.
- **Model-context slimming**: when the host is an MCP Apps host (session-negotiated, or assumed via `WIDGENTIC_ASSUME_UI=1` where negotiation can't happen — stateless HTTP), the default-format result replaces the full-HTML text block with a one-line confirmation telling the model the visual is already displayed. Explicit `format` requests are never slimmed.

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
Keys are personal: sign up at [widgentic.dev](https://widgentic.dev), create
named keys (shown once, individually revocable), and each key serves **your**
catalog — the widgets and themes you design there. The deployment is fully described by [infra/main.bicep](infra/main.bicep)
(Log Analytics, private ACR pulled via a pre-granted user-assigned identity,
managed environment, scale-to-zero app with the key as a Container Apps
secret). To ship a new version:

```bash
az acr build -r <registry> -t widgentic-mcp:vN .
az deployment group create -g widgentic-rg -f infra/main.bicep \
  -p image=<registry>.azurecr.io/widgentic-mcp:vN -p apiKey=<current-key>
```

### Serving per-principal catalogs

Set `WIDGENTIC_STORE_DIR` and the API key stops being a shared password and
starts identifying a principal: each request resolves the key, composes a
**fresh** catalog and theme registry for that principal, and serves it.

```
<dir>/principals.json                     [{ id, scopes, keyDigest }]  # sha256 digests, never raw keys
<dir>/<principalId>/widgets/<kind>.json   { kind, template, descriptor }
<dir>/<principalId>/themes/<name>.json    { name, label?, tokens }
```

Guarantees worth knowing: entries are validated on write **and** on read (a
store is editable out of band), an invalid entry is skipped with a
diagnostic rather than failing the session, stored kinds may never shadow
built-ins, per-principal limits bound how much one tenant can load, and an
unknown key degrades to the anonymous catalog — in production, exactly the
built-in kinds — never to an error. With no store configured the server
serves one catalog for every caller (the library default: built-ins; the
stdio example shows compiling in your own widgets).

Registration is deliberately **not** an MCP tool: the key travels into
third-party hosts and prompt-injectable contexts, so writes belong to an
authenticated app session, not to a pasted credential.

In production the store is **Cosmos DB serverless** via the
`widgentic/store/cosmos` adapter (`@azure/cosmos` + `@azure/identity` are
optional peer dependencies — only hosts importing that entry install
them). Two containers: `data` partitioned by `/principalId` (a user's
whole catalog is one single-partition query) and `keys` partitioned by
`/digest` (key resolution is a 1-RU point read). Access is managed
identity under Cosmos RBAC — account keys are disabled at the account
(`disableLocalAuth`) — and the MCP server's identity holds the
**read-only** role, so the read path cannot write even if compromised.
Set `WIDGENTIC_COSMOS_ENDPOINT` to activate it; `WIDGENTIC_STORE_DIR`
still selects the file store for local rigs.

### The widgentic.dev app

`apps/web/` is the authoring surface (`npm run web`, port 3002): sign in,
create named API keys (shown once, individually revocable), and design
widgets and themes with the embedded designers — saving writes through
the session-authenticated API into your store, so the entry is in **your**
MCP catalog on the next tool call. Sign-in is email via Entra
External ID (OIDC + PKCE, validated with node `crypto`) and GitHub via
the app's own OAuth code flow (External ID cannot federate GitHub) —
both land on the same principal model with namespaced subjects, no new
runtime dependency; sessions are the app's own HMAC-sealed cookie.
API keys never authorize writes: presenting one to the authoring API is a
`401` by design.

### Register with Claude Code

```bash
claude mcp add widgentic -- npx tsx /path/to/widgentic/examples/mcp-server/main.ts
```

Confirm with `/mcp`, then just ask — *"list the available widgets"*, *"render an invoice widget for ..."*.

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
every render streams into it as `structuredContent` (render tree + fragment +
CSS + payload); the template mounts the tree natively — DOM built from data,
successive results patched in place — with the HTML fragment as fallback.
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
[TESTING.md](TESTING.md).

### Design a widget

`npm run designer` serves a demo host on `:8082` with both designers
([examples/designer/](examples/designer/)):

- **Widget designer** — template (tree or JSON), descriptor, styles,
  dataSchema, with widgentic's validators running on every edit and a live
  preview mounted through the real pipeline. Export produces the exact
  `CustomWidget` JSON/TypeScript the server registers
  ([examples/mcp-server/widgets/](examples/mcp-server/widgets/)).
- **Theme designer** — a named theme entry (`{ name, label?, description?,
  tokens }`): every registry token with color swatches, plus author-defined
  `x-*` custom variables, previewed against any catalog kind.

Themes the host supplies appear in the widget designer's preview selector,
so the two cooperate without either owning the other. Embed via
`createDesigner(container, { themes })` / `createThemeDesigner(container)`
or the opt-in elements `defineDesignerElement()` /
`defineThemeDesignerElement()` — no framework, no deps, no network; hosts
persist via `widgentic-change` events.

### Testing without Claude

- **MCP Inspector** (interactive UI): `npx @modelcontextprotocol/inspector npx tsx examples/mcp-server/main.ts`
- **Raw stdio**: pipe newline-delimited JSON-RPC (`initialize` → `notifications/initialized` → `tools/list` → `tools/call`) into `npm run mcp`.
- **In-process**: the SDK interop suite (`src/mcp-server/__tests__/sdk-interop.test.ts`) runs client and server over an in-memory transport on every `npm test`.

## Status

All eleven capabilities are implemented and tested (`npm test` — 530+ unit, type, DOM, and MCP Apps interop tests — type suites run in the default gate; zero runtime dependencies — the Cosmos adapter's Azure SDKs are optional peers installed only by hosts importing `widgentic/store/cosmos`). Live in production: the MCP server at `https://mcp.widgentic.dev/mcp` serving **per-principal catalogs** from Cosmos DB (keys resolve by digest point read; unknown keys degrade to the anonymous catalog), and the authoring app at [widgentic.dev](https://widgentic.dev) — sign in with email (Entra External ID) or GitHub, create revocable API keys, and design widgets/themes that appear in your own catalog on the next tool call. IaC in [infra/](infra/); both container apps scale to zero. Development is spec-first via OpenSpec: see `openspec/specs/` for current behavior and `openspec/changes/archive/` for the full change history. Backlog for the next cycles: the static docs site at `docs.widgentic.dev`, account linking across sign-in methods, `ontoolinputpartial` streaming previews, and the pre-production hardening pass (per-deployment `resourceDomains`, DNS-rebinding pinning for the image inliner, MI-federated app credential, GitHub secret rotation).

## Reference material

See `reference-links.md` for MCP, UI runtime, and design system references that inform widgentic's direction.
