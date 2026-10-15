// @vitest-environment node
/**
 * The designers' preview island: `GET /preview-frame` serves the app
 * template with the frame policy hosts apply for the same resource domains.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAppTemplate } from "../../server/app-template.js";
import { createMemoryStore } from "../../store/index.js";
import type { MemoryStore } from "../../store/index.js";
import { handleAuthoringRequest } from "../handler.js";
import { createAuthoringHttpHandler } from "../node.js";
import type { AuthoringDeps, PrincipalContext } from "../types.js";

/** The policy's directives by name. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name as string, sources];
    })
  );
}

describe("GET /preview-frame", () => {
  let store: MemoryStore;
  let context: PrincipalContext;
  let deps: AuthoringDeps;

  beforeAll(async () => {
    store = createMemoryStore();
    const principal = await store.ensurePrincipal("alice", "Alice");
    context = { principalId: principal.id, subject: "alice" };
    await store.putSettings(principal.id, { resourceDomains: ["cdn.example.com", "*.example.net", "assets.example.org"] });
    deps = { store, resourceDomains: ["assets.example.org", "http://refused.example.com"] };
  });

  it("serves the app template with the operator's then the principal's domains", async () => {
    const response = await handleAuthoringRequest({ method: "GET", path: "preview-frame", context }, deps);
    expect(response.status).toBe(200);
    expect(response.html).toBe(buildAppTemplate());
    const csp = directives(response.headers?.["Content-Security-Policy"] ?? "");
    const domains = ["https://assets.example.org", "https://cdn.example.com", "https://*.example.net"];
    expect(csp.get("img-src")).toEqual(["data:", ...domains]);
    expect(csp.get("style-src")).toEqual(["'unsafe-inline'", ...domains]);
    expect(csp.get("font-src")).toEqual(domains);
    expect(csp.get("media-src")).toEqual(domains);
    expect(csp.get("default-src")).toEqual(["'none'"]);
  });

  it("allows only the template's own inline scripts, each by its hash", async () => {
    const response = await handleAuthoringRequest({ method: "GET", path: "preview-frame", context }, deps);
    const scripts = [...(response.html ?? "").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
    expect(scripts.length).toBeGreaterThan(0);
    const expected = scripts.map((body) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`);
    expect(directives(response.headers?.["Content-Security-Policy"] ?? "").get("script-src")).toEqual(expected);
  });

  it("answers anyone, granting the operator's domains alone without a principal", async () => {
    const response = await handleAuthoringRequest({ method: "GET", path: "preview-frame" }, deps);
    expect(response.status).toBe(200);
    expect(directives(response.headers?.["Content-Security-Policy"] ?? "").get("img-src")).toEqual([
      "data:",
      "https://assets.example.org"
    ]);
    const bare = await handleAuthoringRequest({ method: "GET", path: "preview-frame" }, { store });
    const policy = directives(bare.headers?.["Content-Security-Policy"] ?? "");
    expect(policy.get("img-src")).toEqual(["data:"]);
    expect(policy.get("font-src")).toEqual(["'none'"]);
  });

  it("is framed only by its origin, never cached, and reaches nothing else", async () => {
    const response = await handleAuthoringRequest({ method: "GET", path: "preview-frame", context }, deps);
    const csp = directives(response.headers?.["Content-Security-Policy"] ?? "");
    expect(csp.get("frame-ancestors")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'none'"]);
    expect(csp.get("frame-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'none'"]);
    expect(response.headers?.["Cache-Control"]).toBe("no-store");
    expect(response.headers?.["X-Content-Type-Options"]).toBe("nosniff");
    expect(response.headers?.["Content-Type"]).toBe("text/html; charset=utf-8");
  });

  it("degrades to the operator's domains when the settings read fails, and logs it", async () => {
    const lines: string[] = [];
    const failing = { ...store, settings: () => Promise.reject(new Error("down")) } as unknown as MemoryStore;
    const response = await handleAuthoringRequest(
      { method: "GET", path: "preview-frame", context },
      { store: failing, resourceDomains: ["assets.example.org"], log: (line) => lines.push(line) }
    );
    expect(response.status).toBe(200);
    expect(directives(response.headers?.["Content-Security-Policy"] ?? "").get("img-src")).toEqual([
      "data:",
      "https://assets.example.org"
    ]);
    expect(lines.some((line) => line.includes("preview frame"))).toBe(true);
  });

  it("refuses API keys and other methods as every route does", async () => {
    const keyed = await handleAuthoringRequest({ method: "GET", path: "preview-frame", context, presentedApiKey: true }, deps);
    expect(keyed.status).toBe(401);
    expect(keyed.html).toBeUndefined();
    const posted = await handleAuthoringRequest({ method: "POST", path: "preview-frame", context }, deps);
    expect(posted.status).toBe(404);
    const anonymousPost = await handleAuthoringRequest({ method: "POST", path: "preview-frame" }, deps);
    expect(anonymousPost.status).toBe(401);
  });
});

describe("the Node adapter writes the frame as the core answers it", () => {
  let server: Server;
  let base: string;
  let store: MemoryStore;
  let deps: AuthoringDeps;

  beforeAll(async () => {
    store = createMemoryStore();
    deps = { store, resourceDomains: ["assets.example.org"] };
    const resolve = async (req: IncomingMessage): Promise<PrincipalContext | undefined> => {
      if (!/wg_test_session=alice/.test(req.headers.cookie ?? "")) return undefined;
      const principal = await store.ensurePrincipal("alice", "Alice");
      return { principalId: principal.id, subject: "alice" };
    };
    const handle = createAuthoringHttpHandler(deps, resolve);
    server = createServer((req, res) => void handle(req, res).then((handled) => !handled && res.writeHead(404).end()));
    await new Promise<void>((done) => server.listen(0, done));
    const address = server.address();
    base = `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
  });

  afterAll(() => server.close());

  it("sends the same status, headers and HTML body", async () => {
    const reply = await fetch(`${base}/api/preview-frame`, { headers: { cookie: "wg_test_session=alice" } });
    const principal = await store.ensurePrincipal("alice", "Alice");
    const core = await handleAuthoringRequest(
      { method: "GET", path: "preview-frame", context: { principalId: principal.id, subject: "alice" } },
      deps
    );
    expect(reply.status).toBe(core.status);
    for (const [name, value] of Object.entries(core.headers ?? {})) expect(reply.headers.get(name), name).toBe(value);
    expect(await reply.text()).toBe(core.html);
    expect(reply.headers.get("set-cookie")).toBeNull();
  });
});
