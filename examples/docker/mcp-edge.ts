/**
 * The MCP service's request handling, apart from `mcp.ts` (which listens
 * when imported) so it is testable: Streamable HTTP through the SDK's
 * serving entry — protocol revision 2026-07-28 per request, 2025-era clients
 * statelessly, a fresh server per request either way — behind two doors:
 *
 *   /mcp         needs a credential: an API key (x-api-key or ?key=) or an
 *                access token from signing in. Anything else is a 401 that
 *                tells the host where to sign in.
 *   /mcp/public  needs none and reads none: the built-in catalog.
 *
 * The store handle is the READ-ONLY port; resolving a token is one read.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { NodeIncomingMessageLike } from "@modelcontextprotocol/node";
import { BodyTooLargeError, readBodyText } from "@widgentic/mcp";
import { protectedResourceMetadata, protectedResourceMetadataPaths, resolveCredential } from "@widgentic/mcp/oauth";
import { ANONYMOUS_PRINCIPAL } from "@widgentic/mcp/store";
import type { AccessGrantStore, Principal, WidgetStore } from "@widgentic/mcp/store";
import type { DeploymentKey } from "./deployment-key.js";
import type { OAuthOrigins } from "./oauth-config.js";
import { serverForPrincipal } from "./principal-server.js";
import type { PrincipalGate } from "./principal-server.js";

export interface McpEdgeOptions {
  store: WidgetStore & AccessGrantStore;
  origins: OAuthOrigins;
  gates: { execute: PrincipalGate; preview: PrincipalGate };
  maxBodyBytes: number;
  /** An operator-supplied key that survives an ephemeral store. */
  deploymentKey?: DeploymentKey;
  log?: (line: string) => void;
}

export function createMcpEdge(options: McpEdgeOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { store, origins, deploymentKey } = options;
  const log = options.log ?? ((line: string) => console.error(line));
  const protectedPath = new URL(origins.resource).pathname;
  const publicPath = new URL(origins.publicResource).pathname;
  const metadataPaths = protectedResourceMetadataPaths(origins.resource);
  const metadata = JSON.stringify(
    protectedResourceMetadata({ resource: origins.resource, authorizationServers: [origins.issuer] })
  );

  // The principal is decided before the SDK's handler runs, where the
  // credential is read; the per-request server factory picks it up here.
  const resolved = new AsyncLocalStorage<Principal>();
  const handler = createMcpHandler(
    async () => serverForPrincipal(store, resolved.getStore() ?? ANONYMOUS_PRINCIPAL, options.gates, log),
    { onerror: (error) => log(`request failed: ${String(error)}`) }
  );
  const serveMcp = toNodeHandler(handler, { onerror: (error) => log(`request failed: ${String(error)}`) });

  async function serve(req: IncomingMessage, res: ServerResponse, principal: Principal): Promise<void> {
    let raw: string;
    try {
      raw = await readBodyText(req, options.maxBodyBytes);
    } catch (error) {
      if (!(error instanceof BodyTooLargeError)) throw error;
      res.writeHead(413, { "Content-Type": "application/json" }).end(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: error.message }, id: null })
      );
      return;
    }
    const body: unknown = raw.length > 0 ? JSON.parse(raw) : undefined;
    // Node types `method` as `string | undefined` where the adapter's shape
    // declares it optional, which exactOptionalPropertyTypes keeps apart; the
    // object is exactly what the adapter reads.
    await resolved.run(principal, () => serveMcp(req as NodeIncomingMessageLike, res, body));
  }

  return async (req, res) => {
    // Permissive CORS for browser hosts (e.g. the MCP Apps basic host).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      // Mcp-Method and Mcp-Name ride every 2026-07-28 request.
      "Content-Type, Accept, Authorization, X-Api-Key, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name"
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (path === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }
    if (metadataPaths.includes(path)) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(metadata);
      return;
    }

    try {
      if (path === publicPath) {
        // No credential is read here: the path means the built-in catalog.
        await serve(req, res, ANONYMOUS_PRINCIPAL);
        return;
      }
      if (path !== protectedPath) {
        res.writeHead(404).end();
        return;
      }
      const header = req.headers["x-api-key"];
      const outcome = await resolveCredential(
        {
          apiKey: typeof header === "string" ? header : url.searchParams.get("key"),
          authorization: req.headers.authorization
        },
        {
          resource: origins.resource,
          resolveKey: async (key) => deploymentKey?.match(key) ?? (await store.resolvePrincipal(key)),
          resolveToken: (token, target) => store.resolveAccessToken(token, target)
        }
      );
      if ("challenge" in outcome) {
        // Only a PRESENTED credential that resolved to nobody is worth an
        // operator's attention — and never the credential itself.
        if (outcome.presented !== "none") log(`widgentic mcp: a presented ${outcome.presented} resolved to no principal.`);
        res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": outcome.challenge }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: `Authorization required: sign in through your MCP host, send an API key in the x-api-key header (or ?key=), or use ${origins.publicResource} for the built-in widgets without an account.`
            },
            id: null
          })
        );
        return;
      }
      await serve(req, res, outcome.principal);
    } catch (error) {
      log(`request failed: ${String(error)}`);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" }).end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null })
        );
      }
    }
  };
}
