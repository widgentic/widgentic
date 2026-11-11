/**
 * The MCP service: the request handling of `mcp-edge.ts` on a port. Holds a
 * READ-ONLY handle on the shared store (the type carries no write operation;
 * the authoring app is the only writer).
 *
 * Run with: npm run mcp   (WIDGENTIC_MCP_PORT, default 8081; endpoints /mcp
 * and /mcp/public; WIDGENTIC_PUBLIC_URL and WIDGENTIC_MCP_PUBLIC_URL name the
 * public origins hosts sign in against — see oauth-config.ts)
 */
import { createServer as createHttpServer } from "node:http";
import {
  createExecutionLimiter,
  DEFAULT_EXECUTIONS_PER_MINUTE,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_PREVIEWS_PER_MINUTE,
  positiveIntFromEnv
} from "@widgentic/mcp";
import type { AccessGrantStore, WidgetStore } from "@widgentic/mcp/store";
import { loadDeploymentKey } from "./deployment-key.js";
import { createMcpEdge } from "./mcp-edge.js";
import { oauthOrigins } from "./oauth-config.js";
import { openDeployment } from "./store.js";

const PORT = positiveIntFromEnv(process.env.WIDGENTIC_MCP_PORT, 8081);
// The read-only ports: this service can never write, by the type it holds.
const store: WidgetStore & AccessGrantStore = openDeployment("mcp").store;
// An operator-supplied key that survives an ephemeral store (optional).
const deploymentKey = loadDeploymentKey(process.env);
const origins = oauthOrigins(process.env);

const edge = createMcpEdge({
  store,
  origins,
  gates: {
    execute: createExecutionLimiter(positiveIntFromEnv(process.env.WIDGENTIC_EXECUTE_RATE, DEFAULT_EXECUTIONS_PER_MINUTE)),
    // Separate bucket: a burst of streaming previews must never spend the
    // principal's action executions, nor the reverse.
    preview: createExecutionLimiter(positiveIntFromEnv(process.env.WIDGENTIC_PREVIEW_RATE, DEFAULT_PREVIEWS_PER_MINUTE))
  },
  maxBodyBytes: positiveIntFromEnv(process.env.WIDGENTIC_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
  ...(deploymentKey === undefined ? {} : { deploymentKey })
});

createHttpServer((req, res) => void edge(req, res)).listen(PORT, () => {
  console.error(
    `widgentic MCP endpoint on http://localhost:${PORT}/mcp (sign-in at ${origins.issuer}; public at /mcp/public; 2026-07-28 and 2025-era clients)`
  );
});
