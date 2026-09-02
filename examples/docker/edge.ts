/**
 * What a single-origin deployment needs from the web service, and nothing
 * else: forward `/mcp` to the MCP service when the environment names one
 * (one public origin, one certificate — a Container App with two containers,
 * a reverse-proxy-less VPS), and carry a Chrome origin-trial token into the
 * page when the environment supplies one, and tell the page where its MCP
 * endpoint is so the Keys section can show hosts what to connect to. All
 * inert when unset.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";

export type McpProxy = (req: IncomingMessage, res: ServerResponse, path: string, search: string) => boolean;

/**
 * A handler that forwards `/mcp` (and anything under it) to `upstream` with
 * method, headers, body and the streamed response untouched — Streamable HTTP
 * is SSE-shaped, so nothing is buffered. It adds no authorization: the MCP
 * service resolves the key exactly as when reached directly. Returns false
 * (nothing done) for other paths, and always when no upstream is configured.
 */
export function createMcpProxy(upstream: string | undefined): McpProxy {
  if (upstream === undefined || upstream === "") return () => false;
  const base = new URL(upstream);
  return (req, res, path, search) => {
    if (path !== "/mcp" && !path.startsWith("/mcp/")) return false;
    const target = new URL(path + search, base);
    const headers = { ...req.headers, host: target.host };
    delete headers.connection;
    const forward = httpRequest(target, { method: req.method, headers }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    forward.on("error", (error) => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: error.message } }));
    });
    res.on("close", () => forward.destroy());
    req.pipe(forward);
    return true;
  };
}

/**
 * The page with a Chrome origin-trial token, so Chrome 149+ / Edge 150 expose
 * `modelContext` on this origin without a flag. The token is origin-bound
 * configuration, never committed; nothing is inserted when it is unset.
 */
export function withOriginTrial(html: string, token: string | undefined): string {
  if (token === undefined || token.trim() === "") return html;
  const meta = `<meta http-equiv="origin-trial" content="${token.trim()}">`;
  const at = html.indexOf("<title>");
  return at === -1 ? `${meta}\n${html}` : `${html.slice(0, at)}${meta}\n${html.slice(at)}`;
}

/**
 * Where hosts reach this deployment's MCP endpoint, for the page to show:
 * the operator's explicit public URL wins; a deployment that forwards /mcp
 * serves it on its own origin (relative, the page resolves it); otherwise
 * nothing is known here and the page falls back to the compose default —
 * the MCP service's port on the app's host.
 */
export function mcpEndpointHint(env: { WIDGENTIC_MCP_PUBLIC_URL?: string | undefined; WIDGENTIC_MCP_UPSTREAM?: string | undefined }): string | undefined {
  const explicit = env.WIDGENTIC_MCP_PUBLIC_URL?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const upstream = env.WIDGENTIC_MCP_UPSTREAM?.trim();
  if (upstream !== undefined && upstream !== "") return "/mcp";
  return undefined;
}

/** The page with the endpoint hint as a meta tag; unchanged when nothing is known. */
export function withMcpEndpoint(html: string, endpoint: string | undefined): string {
  if (endpoint === undefined) return html;
  const meta = `<meta name="widgentic-mcp-endpoint" content="${endpoint.replace(/"/g, "&quot;")}">`;
  const at = html.indexOf("<title>");
  return at === -1 ? `${meta}\n${html}` : `${html.slice(0, at)}${meta}\n${html.slice(at)}`;
}
