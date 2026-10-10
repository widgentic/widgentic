# @widgentic/mcp

Everything needed to host the widgentic engine over MCP:

- `@widgentic/mcp` — the widgentic tool-output convention (`toWidgetResult`,
  `extractWidgetPayload`, …), the tool handlers, the MCP Apps template, action
  execution with the SSRF-guarded fetch, and the edge helpers (execution
  limiter, body cap). Framework-agnostic: no MCP SDK is imported here.
- `@widgentic/mcp/sdk` — `createWidgenticServer()`, the full assembly on the
  official MCP TypeScript SDK 2.x: optional peers `@modelcontextprotocol/server`
  2.3+, `@modelcontextprotocol/ext-apps` 2 and `zod` 4.2+. Served through the
  SDK's entries, it speaks protocol revision 2026-07-28 and the 2025-era
  revisions alike.
- `@widgentic/mcp/authoring` — the write side as a hostable HTTP surface:
  widgets, themes, schemas, shared actions, the guarded action test call,
  write-only secrets and API keys, as a pure request handler plus a
  `node:http` adapter. The host resolves the principal; a presented API key
  never authorizes authoring.
- `@widgentic/mcp/store` — the per-principal store port with memory and file
  implementations, composition and validation; `@widgentic/mcp/store/sqlite`
  adds the single-node durable adapter on the Node runtime's built-in SQLite
  (no dependency at all); `@widgentic/mcp/store/cosmos` adds the Azure Cosmos
  DB adapter (optional peers `@azure/cosmos`, `@azure/identity`).
- `@widgentic/mcp/secrets` — envelope encryption for action secrets;
  `@widgentic/mcp/secrets/keyvault` wraps data keys in Azure Key Vault
  (optional peer `@azure/keyvault-keys`).
- `@widgentic/mcp/host` — the runtime-neutral host for MCP servers that are
  not Node (see below).

Requires Node 22 or later — except `@widgentic/mcp/host`, which needs no Node.

```sh
npm install @widgentic/mcp @modelcontextprotocol/server @modelcontextprotocol/ext-apps zod
```

```ts
import { createWidgenticServer } from "@widgentic/mcp/sdk";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

serveStdio(() => createWidgenticServer());
```

Over Streamable HTTP, serve the same factory with `createMcpHandler` from
`@modelcontextprotocol/server` (wrapped with `toNodeHandler` from
`@modelcontextprotocol/node` on Node). It builds a server per request, so
resolve the caller's API key in the factory.

## `@widgentic/mcp/host` — widgentic in any JavaScript engine

The entry's default file is ONE self-contained ES module (no imports) that needs
nothing beyond ECMAScript and `Intl`: no Node modules, no `process`/`Buffer`,
no web APIs. Embed it in any engine — V8 through ClearScript in .NET (the
`Widgentic.Mcp` NuGet package does exactly this), a JVM or Python V8 binding —
and serve widgentic from a server written in that language. It never touches
the realm's globals; `URL` resolves to the platform's implementation, or to a
bundled spec-compliant one where the engine has none.

```ts
import { createWidgenticHost } from "@widgentic/mcp/host";

const host = createWidgenticHost(JSON.stringify({ widgets, themes, schemas }));
host.problems();     // JSON: entries refused at the door, with codes — never thrown
host.definitions();  // JSON: the tool definitions to register (name, description, inputSchema)
host.call("render_widget", JSON.stringify(args), slim); // JSON: the MCP tool result
host.appTemplate();  // the MCP Apps template for ui://widgentic/app.html
host.widgetPage("card"); // the preview page for ui://widgentic/page/{kind}
```

Every argument and result is a string. `widgets` are designer exports
(`{ kind, template, descriptor, load? }`), `themes` theme entries, `schemas`
shared schemas; they go through the same composition and checks as the store.
The served tools are `list_widgets`, `render_widget`, `list_theme_tokens`,
`list_themes`, `list_schemas` and `get_authoring_guide`, plus the template's
own `preview_widget` (marked `visibility: ["app"]` in `definitions()`; rate
limiting previews is the embedding server's job). They are answered by the same
handlers the Node assembly wires, and the output is byte-identical to the Node
path, checked against a conformance corpus.

The host is **render-only**: http actions render disabled, no `load` runs, and
`execute_action`/`list_actions` are not served (prompt actions work — the
template proposes them to the host's composer). Nothing is fetched, so images
are not inlined: in Apps hosts whose sandbox blocks external images, declare
the image host as a CSP resource domain or pass `data:` URIs.

MIT © Diego Hoyos
