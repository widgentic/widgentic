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
import { customWidgets } from "./widgets/index.js";
import {
  ANONYMOUS_PRINCIPAL,
  composeCatalog,
  composeThemes,
  createFileStore
} from "widgentic/store";
import type { Principal, WidgetStore } from "widgentic/store";
import type { WidgetCatalog } from "widgentic/catalog";
import type { ThemeRegistry } from "widgentic/theming";

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Optional per-principal store: with WIDGENTIC_STORE_DIR set, the key
 * identifies a principal and the request is served that principal's
 * catalog and themes. Unset, every caller shares the compiled-in set —
 * exactly the behavior before per-principal catalogs existed.
 */
const STORE_DIR = process.env.WIDGENTIC_STORE_DIR;
const store: WidgetStore | undefined =
  STORE_DIR === undefined ? undefined : createFileStore(STORE_DIR);

/**
 * Optional API-key guard: when WIDGENTIC_API_KEY is set (e.g. from an Azure
 * Container Apps secret), every /mcp request must carry a matching key —
 * either an `x-api-key` header, or `?key=` in the URL for hosts whose
 * connector settings cannot send custom headers (claude.ai / Claude Desktop
 * remote connectors). Unset (local development) leaves the endpoint open.
 */
const API_KEY = process.env.WIDGENTIC_API_KEY;

function requestKey(req: IncomingMessage): string | undefined {
  const header = req.headers["x-api-key"];
  if (typeof header === "string") return header;
  const query = new URL(req.url ?? "/", "http://localhost").searchParams.get("key");
  return query ?? undefined;
}

const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Permissive CORS for browser hosts (e.g. basic-host on another origin).
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
    // Unauthenticated liveness probe for the container platform.
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404).end();
    return;
  }
  if (API_KEY && requestKey(req) !== API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Unauthorized: provide the API key via the x-api-key header or a ?key= query parameter."
        },
        id: null
      })
    );
    return;
  }

  try {
    req.setEncoding("utf8");
    let raw = "";
    for await (const chunk of req) raw += chunk as string;
    const body = raw.length > 0 ? JSON.parse(raw) : undefined;

    // Resolve the principal BEFORE building the server, so the trust
    // decision happens where the key is read. An unknown key degrades to
    // the anonymous catalog rather than failing — and the key itself is
    // never logged, only the outcome.
    let principal: Principal = ANONYMOUS_PRINCIPAL;
    if (store !== undefined) {
      const resolved = await store.resolvePrincipal(requestKey(req) ?? "");
      if (resolved === undefined) {
        console.error(
          "widgentic: presented key resolved to no principal; serving the anonymous catalog."
        );
      } else {
        principal = resolved;
      }
    }
    let composed: { catalog: WidgetCatalog; themes: ThemeRegistry } | undefined;
    if (store !== undefined) {
      // The widgets compiled into this image are the ANONYMOUS principal's
      // set, so unauthenticated callers and the demo rig keep working.
      const catalogResult = await composeCatalog(store, principal.id, {
        ...(principal.id === ANONYMOUS_PRINCIPAL.id
          ? { extraWidgets: customWidgets }
          : {})
      });
      const themeResult = await composeThemes(store, principal.id);
      for (const diagnostic of [
        ...catalogResult.diagnostics,
        ...themeResult.diagnostics
      ]) {
        console.error(`widgentic store [${principal.id}]: ${diagnostic}`);
      }
      composed = { catalog: catalogResult.value, themes: themeResult.value };
    }

    const server = createWidgenticServer(composed ?? {});
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
