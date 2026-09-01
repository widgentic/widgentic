/**
 * The MCP service: Streamable HTTP, stateless — a fresh server + transport
 * per request, per the SDK's stateless pattern. Holds a READ-ONLY handle on
 * the shared store (the type carries no write operation; the authoring app
 * is the only writer) and resolves the presented API key to a principal
 * exactly as production does: an unknown key degrades to the anonymous
 * catalog (built-ins), never to an error, and is never logged.
 *
 * Run with: npm run mcp   (WIDGENTIC_MCP_PORT, default 8081; endpoint /mcp)
 */
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createWidgenticServer } from "@widgentic/mcp/sdk";
import {
  BodyTooLargeError,
  createExecutionLimiter,
  DEFAULT_EXECUTIONS_PER_MINUTE,
  DEFAULT_MAX_BODY_BYTES,
  positiveIntFromEnv,
  readBodyText
} from "@widgentic/mcp";
import { ANONYMOUS_PRINCIPAL, composeCatalog, composeThemes } from "@widgentic/mcp/store";
import type { Principal, WidgetStore } from "@widgentic/mcp/store";
import { openDeployment } from "./store.js";

const PORT = positiveIntFromEnv(process.env.WIDGENTIC_MCP_PORT, 8081);
const MAX_BODY_BYTES = positiveIntFromEnv(process.env.WIDGENTIC_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
const limiter = createExecutionLimiter(
  positiveIntFromEnv(process.env.WIDGENTIC_EXECUTE_RATE, DEFAULT_EXECUTIONS_PER_MINUTE)
);

// The read-only port: this service can never write, by the type it holds.
const store: WidgetStore = openDeployment("mcp").store;

function requestKey(req: IncomingMessage): string | undefined {
  const header = req.headers["x-api-key"];
  if (typeof header === "string") return header;
  const query = new URL(req.url ?? "/", "http://localhost").searchParams.get("key");
  return query ?? undefined;
}

const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Permissive CORS for browser hosts (e.g. the MCP Apps basic host).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, X-Api-Key, Mcp-Session-Id, Mcp-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end();
    return;
  }

  try {
    let raw: string;
    try {
      raw = await readBodyText(req, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        res.writeHead(413, { "Content-Type": "application/json" }).end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: error.message }, id: null })
        );
        return;
      }
      throw error;
    }
    const body: unknown = raw.length > 0 ? JSON.parse(raw) : undefined;

    // Resolve the principal BEFORE building the server, so the trust
    // decision happens where the key is read. No key at all is the normal
    // anonymous path and logs nothing; only a PRESENTED key that resolves
    // to nobody is worth an operator's attention.
    let principal: Principal = ANONYMOUS_PRINCIPAL;
    const presentedKey = requestKey(req);
    if (presentedKey !== undefined && presentedKey !== "") {
      const resolved = await store.resolvePrincipal(presentedKey);
      if (resolved === undefined) {
        console.error("widgentic mcp: presented key resolved to no principal; serving the anonymous catalog.");
      } else {
        principal = resolved;
      }
    }

    // Per-request composition, no caches: one principal's widgets can never
    // reach another's session.
    const executeAllowed = principal.scopes.includes("execute");
    const [catalogResult, themeResult] = await Promise.all([
      composeCatalog(store, principal.id, { executeAllowed }),
      composeThemes(store, principal.id)
    ]);
    for (const diagnostic of [...catalogResult.diagnostics, ...themeResult.diagnostics]) {
      console.error(`widgentic store [${principal.id}]: ${diagnostic}`);
    }

    const principalRef = principal;
    const server = createWidgenticServer({
      catalog: catalogResult.value,
      themes: themeResult.value,
      ...(catalogResult.actions === undefined ? {} : { actions: catalogResult.actions }),
      schemas: () => store.schemas(principalRef.id),
      sharedActions: () => store.actions(principalRef.id),
      secrets: (name: string) => store.secretValue(principalRef.id, name),
      scopes: principal.scopes,
      rateLimit: () => limiter.take(principalRef.id)
    });
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
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
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null })
      );
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`widgentic MCP endpoint on http://localhost:${PORT}/mcp (stateless)`);
});
