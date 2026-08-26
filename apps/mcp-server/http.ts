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
import { createWidgenticServer } from "widgentic/mcp-server/sdk";
import {
  ANONYMOUS_PRINCIPAL,
  composeCatalog,
  composeThemes,
  createFileStore
} from "widgentic/store";
import type { ActionSource, Principal, WidgetStore } from "widgentic/store";
import type { WidgetCatalog } from "widgentic/catalog";
import type { ThemeRegistry } from "widgentic/theming";
import type { SecretCipher } from "widgentic/secrets";

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Secret cipher, in configuration order:
 *   - WIDGENTIC_KEK_ID: a Key Vault key identifier — data keys are wrapped
 *     and unwrapped by the vault through the app's managed identity (the
 *     `Key Vault Crypto Service Encryption User` role); the KEK never
 *     enters this process.
 *   - WIDGENTIC_LOCAL_KEK: 64 hex chars — the development cipher for rigs.
 *   - neither: secrets are unavailable (execution of secret-bearing
 *     actions fails cleanly; everything else works).
 */
const KEK_ID = process.env.WIDGENTIC_KEK_ID;
const LOCAL_KEK = process.env.WIDGENTIC_LOCAL_KEK;
let cipher: SecretCipher | undefined;
if (KEK_ID !== undefined) {
  const { createKeyVaultCipher } = await import("widgentic/secrets/keyvault");
  const { DefaultAzureCredential } = await import("@azure/identity");
  cipher = await createKeyVaultCipher({ keyId: KEK_ID, credential: new DefaultAzureCredential() });
  console.error("widgentic mcp: secrets unwrap through Key Vault");
} else if (LOCAL_KEK !== undefined) {
  const { createLocalCipher } = await import("widgentic/secrets");
  cipher = createLocalCipher(LOCAL_KEK);
  console.error("widgentic mcp: secrets use the LOCAL development cipher");
}

/**
 * Per-principal token bucket for execute_action: `WIDGENTIC_EXECUTE_RATE`
 * executions per minute (default 60), per replica. A hostile client
 * looping on the tool is bounded here; the frame's disable-while-in-flight
 * is UX, not a control.
 */
const EXECUTE_RATE = Math.max(1, Number(process.env.WIDGENTIC_EXECUTE_RATE ?? 60));
const buckets = new Map<string, { tokens: number; refilledAt: number }>();
function takeExecutionToken(principalId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(principalId) ?? { tokens: EXECUTE_RATE, refilledAt: now };
  const refill = ((now - bucket.refilledAt) / 60_000) * EXECUTE_RATE;
  bucket.tokens = Math.min(EXECUTE_RATE, bucket.tokens + refill);
  bucket.refilledAt = now;
  if (bucket.tokens < 1) {
    buckets.set(principalId, bucket);
    console.error("widgentic mcp: execute_action rate-limited for a principal (outcome only).");
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(principalId, bucket);
  if (buckets.size > 10_000) buckets.clear(); // bounded memory; a reset is benign
  return true;
}

/**
 * Optional per-principal store, in configuration order:
 *   - WIDGENTIC_COSMOS_ENDPOINT: the Cosmos adapter via managed identity
 *     (read-only role — this server can never write, by RBAC and by the
 *     narrow WidgetStore type it holds).
 *   - WIDGENTIC_STORE_DIR: the file store (local rig).
 *   - neither: every caller shares the compiled-in set — exactly the
 *     behavior before per-principal catalogs existed.
 */
const COSMOS_ENDPOINT = process.env.WIDGENTIC_COSMOS_ENDPOINT;
const STORE_DIR = process.env.WIDGENTIC_STORE_DIR;
let store: WidgetStore | undefined;
if (COSMOS_ENDPOINT !== undefined) {
  const { createCosmosStore } = await import("widgentic/store/cosmos");
  const { DefaultAzureCredential } = await import("@azure/identity");
  store = createCosmosStore({
    endpoint: COSMOS_ENDPOINT,
    credential: new DefaultAzureCredential(),
    ...(cipher === undefined ? {} : { cipher })
  });
  console.error(`widgentic mcp: per-principal store on Cosmos at ${COSMOS_ENDPOINT}`);
} else if (STORE_DIR !== undefined) {
  store = createFileStore(STORE_DIR, cipher === undefined ? {} : { cipher });
}

/**
 * Optional API-key guard: when WIDGENTIC_API_KEY is set (e.g. from an Azure
 * Container Apps secret), every /mcp request must carry a matching key —
 * either an `x-api-key` header, or `?key=` in the URL for hosts whose
 * connector settings cannot send custom headers (claude.ai / Claude Desktop
 * remote connectors). Unset (local development) leaves the endpoint open.
 */
const API_KEY = process.env.WIDGENTIC_API_KEY;
// Comma-separated hostnames the operator trusts the app frame to load
// assets from (flows to _meta.ui.resourceDomains + the inliner skip).
const RESOURCE_DOMAINS = (process.env.WIDGENTIC_RESOURCE_DOMAINS ?? "")
  .split(",")
  .map((domain) => domain.trim())
  .filter((domain) => domain.length > 0);

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
  // The static key gate guards NO-STORE deployments (one shared secret).
  // With a store configured, per-user keys are the access model: the
  // store resolves them, and an unknown key serves the anonymous catalog
  // (built-ins) rather than an error — per the widget-store spec. The
  // static key stays valid there too, as the seeded bootstrap principal.
  if (store === undefined && API_KEY && requestKey(req) !== API_KEY) {
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
    let composed:
      | { catalog: WidgetCatalog; themes: ThemeRegistry; actions?: ActionSource }
      | undefined;
    // The key's scopes decide, per request, whether http actions render
    // enabled and whether execute_action may run at all.
    const executeAllowed = principal.scopes.includes("execute");
    if (store !== undefined) {
      // Nothing is compiled into production: anonymous callers get the
      // built-ins, and custom widgets come from principals' stores. The
      // guiding example for compiled-in widgets is examples/mcp-server.
      const catalogResult = await composeCatalog(store, principal.id, { executeAllowed });
      const themeResult = await composeThemes(store, principal.id);
      for (const diagnostic of [
        ...catalogResult.diagnostics,
        ...themeResult.diagnostics
      ]) {
        console.error(`widgentic store [${principal.id}]: ${diagnostic}`);
      }
      composed = {
        catalog: catalogResult.value,
        themes: themeResult.value,
        ...(catalogResult.actions === undefined ? {} : { actions: catalogResult.actions })
      };
    }

    // The schema source is LAZY: list_schemas reads it when called, so
    // renders never pay the extra store query.
    const storeRef = store;
    const principalRef = principal;
    const server = createWidgenticServer({
      ...(composed ?? {}),
      ...(storeRef === undefined
        ? {}
        : {
            schemas: () => storeRef.schemas(principalRef.id),
            secrets: (name: string) => storeRef.secretValue(principalRef.id, name)
          }),
      scopes: principal.scopes,
      rateLimit: () => takeExecutionToken(principalRef.id),
      ...(RESOURCE_DOMAINS.length > 0 ? { resourceDomains: RESOURCE_DOMAINS } : {})
    });
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
