---
"@widgentic/mcp": minor
---

`@widgentic/mcp/sdk` moves to the MCP TypeScript SDK 2.x and serves protocol revision 2026-07-28 next to the 2025-era revisions. **Breaking for `./sdk` hosts:**

- `createWidgenticServer()` now returns a 2.x `McpServer` from `@modelcontextprotocol/server`.
- The optional peers are now `@modelcontextprotocol/server` `^2.3.0`, `@modelcontextprotocol/ext-apps` `^2` and `zod` `^4.2.0`. `@modelcontextprotocol/sdk` (1.x) is no longer one: the two SDKs share no classes, so a 1.x transport cannot carry a 2.x server.

The base entry and every other subpath are unchanged.

Moving a host:

- **stdio.** Replace `await server.connect(new StdioServerTransport())` with `serveStdio(() => createWidgenticServer(options))`, imported from `@modelcontextprotocol/server/stdio`. One factory serves both eras, pinned per connection.
- **Streamable HTTP.** Replace the per-request `StreamableHTTPServerTransport` with one `createMcpHandler(factory)` from `@modelcontextprotocol/server`, wrapped with `toNodeHandler` from `@modelcontextprotocol/node` on Node.
  - The factory runs once per request and receives the inbound `Request` as `requestInfo`. Read the API key there, compose, and return `createWidgenticServer(...)`.
  - Pass an already-read body as the adapter's third argument.
  - Allow the `Mcp-Method` and `Mcp-Name` headers in CORS for browser hosts.
  - 2025-era clients are still served statelessly, now with single-event SSE responses.

Slimming is now decided per call:

1. the capabilities a 2025-era session negotiated at `initialize`;
2. otherwise the capabilities a 2026-07-28 request carries in `_meta["io.modelcontextprotocol/clientCapabilities"]`;
3. otherwise `WIDGENTIC_ASSUME_UI`.

Before this release, an MCP Apps host on 2026-07-28 would have received the full HTML in model context. Tool names, descriptions and input properties are unchanged. The input schemas now declare JSON Schema 2020-12. Two behaviors come from SDK 2.x itself:
- A call to an unregistered tool is answered with JSON-RPC `-32602`, where it used to be an `isError` result.
- `CallToolResult.structuredContent` is typed as any JSON value.
