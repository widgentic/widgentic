// @vitest-environment node
/**
 * The single-origin extras (self-host-example spec, "One image, two services,
 * one store" and "The app mounts …"): /mcp is forwarded verbatim and streamed
 * only when an upstream is configured; the origin-trial meta appears only
 * when a token is configured.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpProxy, withOriginTrial } from "../edge.js";

let servers: Server[] = [];
afterEach(() => {
  for (const server of servers) server.close();
  servers = [];
});

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}` : "");
    });
  });
}

interface Seen { method: string | undefined; url: string | undefined; key: string | undefined; body: string }

/** An MCP-shaped upstream: records the request, answers in two SSE chunks. */
async function upstream(seen: Seen[]): Promise<string> {
  return listen((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, key: req.headers["x-api-key"] as string | undefined, body });
      res.writeHead(200, { "Content-Type": "text/event-stream", "x-upstream": "mcp" });
      res.write("event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\n");
      setTimeout(() => res.end("event: message\ndata: done\n\n"), 20);
    });
  });
}

function app(proxy: ReturnType<typeof createMcpProxy>): Promise<string> {
  return listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (proxy(req, res, url.pathname, url.search)) return;
    res.writeHead(404).end();
  });
}

describe("the /mcp forward", () => {
  it("streams an MCP request to the upstream unchanged when configured", async () => {
    const seen: Seen[] = [];
    const mcp = await upstream(seen);
    const origin = await app(createMcpProxy(mcp));
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const response = await fetch(`${origin}/mcp?key=abc`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "k-123", accept: "application/json, text/event-stream" },
      body
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-upstream")).toBe("mcp");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const text = await response.text();
    expect(text).toContain('"result":{}');
    expect(text).toContain("data: done");
    expect(seen).toEqual([{ method: "POST", url: "/mcp?key=abc", key: "k-123", body }]);
  });

  it("does nothing for other paths, and for everything when unset", async () => {
    const seen: Seen[] = [];
    const mcp = await upstream(seen);
    const configured = await app(createMcpProxy(mcp));
    expect((await fetch(`${configured}/healthz-not-proxied`)).status).toBe(404);
    expect((await fetch(`${configured}/mcpx`)).status).toBe(404);
    const unset = await app(createMcpProxy(undefined));
    expect((await fetch(`${unset}/mcp`, { method: "POST", body: "{}" })).status).toBe(404);
    expect(seen).toEqual([]);
  });

  it("answers 502 with a structured error when the upstream is down", async () => {
    const origin = await app(createMcpProxy("http://127.0.0.1:9"));
    const response = await fetch(`${origin}/mcp`, { method: "POST", body: "{}" });
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});

describe("the origin-trial meta", () => {
  const page = "<!doctype html>\n<meta charset=\"utf-8\">\n<title>t</title>\n<body></body>";
  it("is inserted before the title only when a token is set", () => {
    expect(withOriginTrial(page, undefined)).toBe(page);
    expect(withOriginTrial(page, "  ")).toBe(page);
    const withToken = withOriginTrial(page, "AbC123==");
    expect(withToken).toContain('<meta http-equiv="origin-trial" content="AbC123==">\n<title>');
    expect(withToken.indexOf("origin-trial")).toBeLessThan(withToken.indexOf("<title>"));
  });
});
