# @widgentic/mcp

Everything needed to host the widgentic engine over MCP:

- `@widgentic/mcp` — the widgentic tool-output convention (`toWidgetResult`,
  `extractWidgetPayload`, …), the tool handlers, the MCP Apps template, action
  execution with the SSRF-guarded fetch, and the edge helpers (execution
  limiter, body cap). Framework-agnostic: no MCP SDK is imported here.
- `@widgentic/mcp/sdk` — `createWidgenticServer()`, the full assembly on the
  official `@modelcontextprotocol/sdk` (optional peer, with
  `@modelcontextprotocol/ext-apps` and `zod`).
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

Requires Node 22 or later.

```sh
npm install @widgentic/mcp @modelcontextprotocol/sdk @modelcontextprotocol/ext-apps zod
```

```ts
import { createWidgenticServer } from "@widgentic/mcp/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

await createWidgenticServer().connect(new StdioServerTransport());
```

MIT © Diego Hoyos
