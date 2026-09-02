/**
 * The authoring service: the published authoring surface mounted under
 * `/api`, the app shell, the bundled client, and the page palette — wiring
 * only. Every authoring behavior (routes, refusal codes, write-only secrets,
 * one-time key reveal, the guarded test call, the API-key refusal) is
 * `@widgentic/mcp/authoring`'s, not this file's.
 *
 * Run with: npm run web   (WIDGENTIC_WEB_PORT, default 8080;
 * WIDGENTIC_MCP_UPSTREAM forwards /mcp to the MCP service for single-origin
 * deployments; WIDGENTIC_MCP_PUBLIC_URL names the endpoint the Keys section
 * shows when it is not this origin's /mcp; WIDGENTIC_ORIGIN_TRIAL_TOKEN puts a
 * Chrome origin-trial token on the page)
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { CHROME_DEFAULTS, chromeCss } from "@widgentic/designer";
import { createExecutionLimiter, DEFAULT_EXECUTIONS_PER_MINUTE, positiveIntFromEnv } from "@widgentic/mcp";
import { createAuthoringHttpHandler } from "@widgentic/mcp/authoring";
import { createMcpProxy, mcpEndpointHint, withMcpEndpoint, withOriginTrial } from "./edge.js";
import { createIdentity } from "./identity.js";
import { openDeployment } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = positiveIntFromEnv(process.env.WIDGENTIC_WEB_PORT, 8080);

const { store, secretsEnabled } = openDeployment("web");
const identity = await createIdentity(store);

// Test calls draw from a per-service bucket at the same rate as the MCP
// edge's — like production, budgets are per replica (see rate-limit.ts), so
// the two services each hold their own bucket.
const limiter = createExecutionLimiter(
  positiveIntFromEnv(process.env.WIDGENTIC_EXECUTE_RATE, DEFAULT_EXECUTIONS_PER_MINUTE)
);

const handleAuthoring = createAuthoringHttpHandler(
  { store, secretsEnabled, limiter },
  (req) => identity.resolve(req)
);

// The client is bundled once at boot; the page palette is DERIVED from the
// designer package's exported default, never written by hand (see the spec's
// "one palette, derived not copied" — the pattern widgentic.dev also uses).
const bundle = await build({
  entryPoints: [join(here, "main.ts")],
  bundle: true,
  format: "esm",
  write: false,
  logLevel: "warning"
});
// Single-origin deployments: forward /mcp to the MCP service and carry a
// Chrome origin-trial token into the page — both only when configured.
const proxyMcp = createMcpProxy(process.env.WIDGENTIC_MCP_UPSTREAM);
const page = withMcpEndpoint(
  withOriginTrial(readFileSync(join(here, "index.html"), "utf8"), process.env.WIDGENTIC_ORIGIN_TRIAL_TOKEN),
  mcpEndpointHint(process.env)
);
const ASSETS: Record<string, { body: string; type: string }> = {
  "/": { body: page, type: "text/html; charset=utf-8" },
  "/app.bundle.js": { body: bundle.outputFiles[0]?.text ?? "", type: "text/javascript; charset=utf-8" },
  "/palette.css": {
    body: `/* Generated from @widgentic/designer's CHROME_DEFAULTS — do not edit. */\n${chromeCss(CHROME_DEFAULTS, { prefix: "--host" })}`,
    type: "text/css; charset=utf-8"
  }
};

createServer((req, res) => {
  void (async () => {
    // Browser CSRF guard for the no-sign-in deployment: a cross-site page
    // must not be able to author through the operator's browser. Browsers
    // send Sec-Fetch-Site; same-origin traffic and non-browser clients
    // (curl, scripts — the header absent) pass untouched.
    if (req.method !== "GET" && req.headers["sec-fetch-site"] === "cross-site") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "CROSS_SITE", message: "Cross-site browser writes are refused." } }));
      return;
    }
    if (await handleAuthoring(req, res)) return;
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (proxyMcp(req, res, path, url.search)) return;
    if (path === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }
    const asset = ASSETS[path];
    if (asset === undefined) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-cache" }).end(asset.body);
  })().catch((error) => {
    console.error("request failed:", error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => {
  console.error(`widgentic authoring app on http://localhost:${PORT}/ (${identity.mode} mode)`);
});
