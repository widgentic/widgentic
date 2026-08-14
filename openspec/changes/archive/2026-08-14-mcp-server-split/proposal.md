# Split the MCP Server: Library Assembly, Lean Production, Guiding Example

## Why

`apps/mcp-server/` currently carries two roles at once: the deployed HTTP server *and* a demonstration of compiling custom widgets into a server. Since the widgentic.dev app shipped, custom widgets belong to principals in the store — the compiled-in `widgets/` folder is a leftover of the pre-app era sitting inside production code. Meanwhile the server assembly (`createWidgenticServer`) is generic wiring that every host reimplements or reaches into `apps/` for; it belongs to the library, and the MCP SDK is a natural, expected dependency for that one entry.

## What Changes

- **The server assembly becomes a library export**: `createWidgenticServer` moves to `src/mcp-server/` behind a new `widgentic/mcp-server/sdk` entry, with the MCP SDK packages as optional peer dependencies (the Cosmos-adapter pattern). The base `widgentic/mcp-server` entry stays SDK-free. The default catalog is the **built-ins only** — compiled-in extras become an explicit host choice.
- **`apps/mcp-server/` goes lean**: only `http.ts` (and TESTING.md) remain. No `widgets/` folder, no stdio entry. Production consequence: the **anonymous** catalog on `mcp.widgentic.dev` becomes built-ins only — `invoice`/`x-post` stay available to the bootstrap principal via its stored Cosmos copies.
- **The stdio server returns to `examples/mcp-server/`** with the `widgets/` folder: a self-contained demonstration of hosting widgentic with your own compiled-in widgets — the guidance path for future custom implementations. `npm run mcp` points there.
- Test fixtures, the designer demo, docs, and the copy-as-TypeScript emit target follow the moves.

## Capabilities

### Modified Capabilities

- `mcp-server`: gains the SDK-assembly entry requirement; the runnable-stdio requirement moves to the example path and the dependency scenario admits the optional-peer pattern.
- `widget-designer`: copy-as-TypeScript emit target becomes `examples/mcp-server/widgets/`.

## Impact

- `src/mcp-server/server.ts` (new, from `apps/mcp-server/server.ts`); `package.json` gains the `./mcp-server/sdk` export and optional peers for `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `zod`.
- `apps/mcp-server/`: `main.ts`, `server.ts`, `widgets/` removed; `http.ts` imports the library assembly.
- `examples/mcp-server/`: stdio entry + widgets, importing only public widgentic entries.
- Production redeploy (v14): anonymous catalog narrows to built-ins; bootstrap/user catalogs unchanged.
- Tests: fixture imports repoint; assembly interop tests target the library; a new assertion pins the `./mcp-server` base entry SDK-free.
