/**
 * The MCP service: Streamable HTTP through the SDK's serving entry, which
 * answers protocol revision 2026-07-28 per request and 2025-era clients
 * statelessly — a fresh server per request either way. Holds a READ-ONLY handle on
 * the shared store (the type carries no write operation; the authoring app
 * is the only writer) and resolves the presented API key to a principal
 * exactly as production does: an unknown key degrades to the anonymous
 * catalog (built-ins), never to an error, and is never logged.
 *
 * Run with: npm run mcp   (WIDGENTIC_MCP_PORT, default 8081; endpoint /mcp)
 */
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { NodeIncomingMessageLike } from "@modelcontextprotocol/node";
import { createWidgenticServer } from "@widgentic/mcp/sdk";
import {
  BodyTooLargeError,
  createExecutionLimiter,
  DEFAULT_EXECUTIONS_PER_MINUTE,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_PREVIEWS_PER_MINUTE,
  positiveIntFromEnv,
  readBodyText
} from "@widgentic/mcp";
import { ANONYMOUS_PRINCIPAL, composeCatalog, composeThemes } from "@widgentic/mcp/store";
import type { Principal, WidgetStore } from "@widgentic/mcp/store";
import { loadDeploymentKey } from "./deployment-key.js";
import { openDeployment } from "./store.js";

const PORT = positiveIntFromEnv(process.env.WIDGENTIC_MCP_PORT, 8081);
const MAX_BODY_BYTES = positiveIntFromEnv(process.env.WIDGENTIC_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
const limiter = createExecutionLimiter(
  positiveIntFromEnv(process.env.WIDGENTIC_EXECUTE_RATE, DEFAULT_EXECUTIONS_PER_MINUTE)
);
// Separate bucket: a burst of streaming previews must never spend the
// principal's action executions, nor the reverse.
const previewLimiter = createExecutionLimiter(
  positiveIntFromEnv(process.env.WIDGENTIC_PREVIEW_RATE, DEFAULT_PREVIEWS_PER_MINUTE)
);

// The read-only port: this service can never write, by the type it holds.
const store: WidgetStore = openDeployment("mcp").store;
// An operator-supplied key that survives an ephemeral store (optional).
const deploymentKey = loadDeploymentKey(process.env);

function requestKey(request: Request): string | undefined {
  return request.headers.get("x-api-key") ?? new URL(request.url).searchParams.get("key") ?? undefined;
}

// One handler for every request: it builds a fresh server per request from
// this factory, which receives the inbound request.
const handler = createMcpHandler(
  async ({ requestInfo }) => {
    // Resolve the principal BEFORE building the server, so the trust
    // decision happens where the key is read. No key at all is the normal
    // anonymous path and logs nothing; only a PRESENTED key that resolves
    // to nobody is worth an operator's attention.
    let principal: Principal = ANONYMOUS_PRINCIPAL;
    const presentedKey = requestInfo === undefined ? undefined : requestKey(requestInfo);
    if (presentedKey !== undefined && presentedKey !== "") {
      const resolved = deploymentKey?.match(presentedKey) ?? (await store.resolvePrincipal(presentedKey));
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
    return createWidgenticServer({
      catalog: catalogResult.value,
      themes: themeResult.value,
      ...(catalogResult.actions === undefined ? {} : { actions: catalogResult.actions }),
      schemas: () => store.schemas(principalRef.id),
      sharedActions: () => store.actions(principalRef.id),
      secrets: (name: string) => store.secretValue(principalRef.id, name),
      scopes: principal.scopes,
      rateLimit: () => limiter.take(principalRef.id),
      previewRateLimit: () => previewLimiter.take(principalRef.id)
    });
  },
  { onerror: (error) => console.error("request failed:", error) }
);
const serveMcp = toNodeHandler(handler, { onerror: (error) => console.error("request failed:", error) });

const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Permissive CORS for browser hosts (e.g. the MCP Apps basic host).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    // Mcp-Method and Mcp-Name ride every 2026-07-28 request.
    "Content-Type, Accept, X-Api-Key, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name"
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
    // Node types `method` as `string | undefined` where the adapter's shape
    // declares it optional, which exactOptionalPropertyTypes keeps apart; the
    // object is exactly what the adapter reads.
    await serveMcp(req as NodeIncomingMessageLike, res, body);
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
  console.error(`widgentic MCP endpoint on http://localhost:${PORT}/mcp (2026-07-28 and 2025-era clients)`);
});
