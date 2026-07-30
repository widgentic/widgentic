/**
 * Streamable HTTP entry for the Widgentic MCP server — stateless mode: a
 * fresh server + transport per request, per the SDK's stateless pattern.
 *
 * Run with: npm run mcp:http   (PORT env, default 3001; endpoint /mcp)
 * Pairs with the official MCP Apps basic-host example for local inline
 * widget testing without an Apps-capable desktop client.
 */
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createWidgenticServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3001);

const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Permissive CORS for local testing (basic-host runs on another port).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end();
    return;
  }

  try {
    req.setEncoding("utf8");
    let raw = "";
    for await (const chunk of req) raw += chunk as string;
    const body = raw.length > 0 ? JSON.parse(raw) : undefined;

    const server = createWidgenticServer();
    // Stateless mode: no sessionIdGenerator (omitted — exactOptionalPropertyTypes
    // forbids an explicit undefined against the SDK's optional property).
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    // Cast: the transport's accessor types clash with the Transport
    // interface under exactOptionalPropertyTypes; runtime shape is correct.
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("request failed:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        })
      );
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(
    `widgentic MCP server ready on http://localhost:${PORT}/mcp (stateless)`
  );
});
