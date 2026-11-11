// @vitest-environment node
/**
 * Signing hosts in on the self-host deployment (self-host-example spec,
 * "Hosts sign in through the authoring app"; mcp-server spec, "A protected
 * endpoint challenges; a public endpoint is anonymous"): the real MCP edge
 * and the real sign-in wiring on two local servers, the app fronting the MCP
 * service as a single-origin deployment does, driven by an MCP client on
 * both protocol eras.
 */
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMemoryStore, generateKey } from "@widgentic/mcp/store";
import type {
  AccessGrantStore,
  StoredWidget,
  WidgetStore,
  WritableAccessGrantStore,
  WritableWidgetStore
} from "@widgentic/mcp/store";
import { createSqliteStore } from "@widgentic/mcp/store/sqlite";
import { loadDeploymentKey } from "../deployment-key.js";
import { createMcpProxy } from "../edge.js";
import { createIdentity } from "../identity.js";
import { createMcpEdge } from "../mcp-edge.js";
import { oauthOrigins, oauthSecret } from "../oauth-config.js";
import { createSignIn } from "../sign-in.js";

type Store = WritableWidgetStore & WritableAccessGrantStore;
type Era = "modern" | "legacy";

const VERIFIER = "sign-in-verifier-0123456789-0123456789-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "http://127.0.0.1:49152/callback";
const KEK = "ab".repeat(32);
const open = { take: () => true };

let closers: (() => Promise<void> | void)[] = [];
let savedHeader: string | undefined;
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
  if (savedHeader === undefined) delete process.env.WIDGENTIC_TRUSTED_USER_HEADER;
  else process.env.WIDGENTIC_TRUSTED_USER_HEADER = savedHeader;
});

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ url: string; server: Server }> {
  const server = createServer(handler);
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })
    )
  );
}

function widget(kind: string): StoredWidget {
  return {
    kind,
    template: { tag: "div", children: [{ bind: "title" }] },
    descriptor: { description: `fixture ${kind}`, dataShape: "{ title }" }
  };
}

interface Rig {
  /** The one public origin: the app, fronting the MCP service. */
  app: string;
  store: Store;
  logs: string[];
  /** What the MCP service was given: read methods only. */
  writesAttempted: string[];
}

/**
 * A single-origin deployment: the app (sign-in + the /mcp forward) and the
 * MCP service, over one store. The MCP service gets a handle that exposes
 * only the read ports and records any other access.
 */
async function rig(store: Store, extraEnv: Record<string, string> = {}): Promise<Rig> {
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);
  const writesAttempted: string[] = [];
  const READS = new Set([
    "resolvePrincipal", "widgets", "themes", "schemas", "actions", "listSecrets", "secretValue", "settings", "resolveAccessToken"
  ]);
  const readOnly = new Proxy(store, {
    get(target, property, receiver) {
      if (typeof property === "string" && !READS.has(property)) writesAttempted.push(property);
      return Reflect.get(target, property, receiver) as unknown;
    }
  }) as WidgetStore & AccessGrantStore;

  // The app's port is the public origin; it is known only once listening.
  let appHandler: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => void res.writeHead(503).end();
  const app = await listen((req, res) => appHandler(req, res));
  const env = { WIDGENTIC_PUBLIC_URL: app.url, WIDGENTIC_KEK: KEK, ...extraEnv };

  const deploymentKey = loadDeploymentKey(env, log);
  const edge = createMcpEdge({
    store: readOnly,
    origins: oauthOrigins(env),
    gates: { execute: open, preview: open },
    maxBodyBytes: 1_000_000,
    log,
    ...(deploymentKey === undefined ? {} : { deploymentKey })
  });
  const mcp = await listen((req, res) => void edge(req, res));

  const identity = await createIdentity(store);
  const signIn = createSignIn(store, identity, env, log);
  const proxy = createMcpProxy(mcp.url);
  appHandler = (req, res) => {
    void (async () => {
      if (await signIn.handle(req, res)) return;
      const url = new URL(req.url ?? "/", "http://localhost");
      if (proxy(req, res, url.pathname, url.search)) return;
      res.writeHead(404).end();
    })();
  };
  return { app: app.url, store, logs, writesAttempted };
}

async function client(era: Era, url: string, headers: Record<string, string> = {}): Promise<Client> {
  const mcp = new Client(
    { name: "sign-in-test", version: "0.0.0" },
    era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {}
  );
  await mcp.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
  closers.push(() => mcp.close());
  expect(mcp.getProtocolEra()).toBe(era);
  return mcp;
}

async function kinds(mcp: Client): Promise<string[]> {
  const result = await mcp.callTool({ name: "list_widgets", arguments: {} });
  const text = (result.content as { text: string }[])[0]?.text ?? "";
  return [...text.matchAll(/"kind":\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
}

const RPC = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-06-18"
};
const LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });

function form(fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString()
  };
}

/** What an MCP host does after a 401, by hand: discover, register, authorize. */
async function discoverAndAuthorize(app: string, headers: Record<string, string> = {}) {
  const challenged = await fetch(`${app}/mcp`, { method: "POST", headers: RPC, body: LIST });
  expect(challenged.status).toBe(401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenged.headers.get("www-authenticate") ?? "")?.[1] ?? "";
  const resource = (await (await fetch(metadataUrl)).json()) as { resource: string; authorization_servers: string[] };
  const issuer = resource.authorization_servers[0] ?? "";
  const server = (await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json()) as Record<string, string>;
  const registered = (await (
    await fetch(server.registration_endpoint ?? "", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Test host", redirect_uris: ["http://127.0.0.1/callback"] })
    })
  ).json()) as { client_id: string };
  const query = new URLSearchParams({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: REDIRECT,
    state: "s1",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: resource.resource
  });
  const page = await fetch(`${server.authorization_endpoint}?${query.toString()}`, { headers });
  const html = await page.text();
  return {
    resource: resource.resource,
    issuer,
    server,
    clientId: registered.client_id,
    status: page.status,
    html,
    decisionToken: /name="request" value="([^"]+)"/.exec(html)?.[1] ?? ""
  };
}

async function decide(app: string, fields: Record<string, string>, headers: Record<string, string> = {}): Promise<URL> {
  const init = form(fields);
  const response = await fetch(`${app}/oauth/authorize/decision`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...headers }
  });
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") ?? "");
}

async function tokens(app: string, fields: Record<string, string>) {
  const response = await fetch(`${app}/oauth/token`, form(fields));
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

/** The whole flow for whoever `headers` identifies, creating a key at consent. */
async function signIn(app: string, headers: Record<string, string> = {}, keyName = "Test host") {
  const flow = await discoverAndAuthorize(app, headers);
  const back = await decide(app, { request: flow.decisionToken, action: "approve", key: "new", name: keyName }, headers);
  const issued = await tokens(app, {
    grant_type: "authorization_code",
    code: back.searchParams.get("code") ?? "",
    code_verifier: VERIFIER,
    client_id: flow.clientId,
    redirect_uri: REDIRECT
  });
  expect(issued.status).toBe(200);
  return { ...flow, tokens: issued.body };
}

describe.each<Era>(["modern", "legacy"])("a protected endpoint challenges; a public endpoint is anonymous (%s era)", (era) => {
  it("no credential is a challenge, and nothing is composed for it", async () => {
    const store = createMemoryStore();
    let composed = 0;
    const counting = new Proxy(store, {
      get(target, property, receiver) {
        if (property === "widgets" || property === "themes" || property === "settings") composed++;
        return Reflect.get(target, property, receiver) as unknown;
      }
    });
    const { app } = await rig(counting);
    const response = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { ...RPC, origin: "https://host.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${app}/.well-known/oauth-protected-resource/mcp"`
    );
    const body = (await response.json()) as { jsonrpc: string; error: { code: number; message: string } };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toContain(`${app}/mcp/public`);
    expect(body.error.message).toContain("x-api-key");
    expect(composed).toBe(0);
    // A client that cannot sign in fails to connect instead of seeing a catalog.
    await expect(client(era, `${app}/mcp`)).rejects.toThrow();
  });

  it("a refused token says so, and an unknown key is challenged without the error", async () => {
    const { app, logs } = await rig(createMemoryStore());
    const unknownToken = `wga_${"0".repeat(64)}`;
    const withToken = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { ...RPC, authorization: `Bearer ${unknownToken}` },
      body: LIST
    });
    expect(withToken.status).toBe(401);
    expect(withToken.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${app}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`
    );
    const unknownKey = generateKey();
    const withKey = await fetch(`${app}/mcp?key=${unknownKey}`, { method: "POST", headers: RPC, body: LIST });
    expect(withKey.status).toBe(401);
    expect(withKey.headers.get("www-authenticate")).not.toContain("invalid_token");
    const logged = logs.join("\n");
    expect(logged).toContain("resolved to no principal");
    expect(logged).not.toContain(unknownToken);
    expect(logged).not.toContain(unknownKey);
  });

  it("the metadata is where hosts look for it", async () => {
    const { app } = await rig(createMemoryStore());
    const expected = {
      resource: `${app}/mcp`,
      authorization_servers: [app],
      scopes_supported: ["read", "execute"],
      bearer_methods_supported: ["header"]
    };
    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
      const response = await fetch(`${app}${path}`, { headers: { origin: "https://host.example" } });
      expect(response.status, path).toBe(200);
      expect(response.headers.get("access-control-allow-origin"), path).toBe("*");
      expect(await response.json(), path).toEqual(expected);
    }
  });

  it("the public endpoint never asks, and reads no credential", async () => {
    const store = createMemoryStore();
    const principal = await store.ensurePrincipal("local:default", "Self-hosted");
    await store.putWidget(principal.id, widget("invoice-card"));
    const key = await store.createKey(principal.id, "ops", ["read", "execute"]);
    const { app } = await rig(store);

    const anonymous = await client(era, `${app}/mcp/public`);
    const builtIns = await kinds(anonymous);
    expect(builtIns).toContain("card");
    expect(builtIns).not.toContain("invoice-card");
    const rendered = await anonymous.callTool({ name: "render_widget", arguments: { widget: "card", data: { title: "Hello" } } });
    expect(rendered.isError).not.toBe(true);
    const executed = await anonymous.callTool({ name: "execute_action", arguments: { widget: "card", action: "load", payload: { kind: "card", data: { title: "Hello" } } }
    });
    expect(JSON.stringify(executed.content)).toContain("FORBIDDEN_SCOPE");

    // A valid key changes nothing here: the path means the built-in catalog.
    const keyed = await client(era, `${app}/mcp/public?key=${key.key}`, { "x-api-key": key.key });
    expect(await kinds(keyed)).toEqual(builtIns);
  });

  it("keys keep working where they did", async () => {
    const store = createMemoryStore();
    const principal = await store.ensurePrincipal("local:default", "Self-hosted");
    await store.putWidget(principal.id, widget("invoice-card"));
    const key = await store.createKey(principal.id, "ops");
    const { app } = await rig(store);
    expect(await kinds(await client(era, `${app}/mcp`, { "x-api-key": key.key }))).toContain("invoice-card");
    expect(await kinds(await client(era, `${app}/mcp?key=${key.key}`))).toContain("invoice-card");
    // A key decides even beside a bad bearer token.
    expect(
      await kinds(await client(era, `${app}/mcp`, { "x-api-key": key.key, authorization: `Bearer wga_${"0".repeat(64)}` }))
    ).toContain("invoice-card");
  });

  it("a key and a token of the same key see the same catalog; another resource's token does not", async () => {
    const store = createMemoryStore();
    const principal = await store.ensurePrincipal("local:default", "Self-hosted");
    await store.putWidget(principal.id, widget("invoice-card"));
    const key = await store.createKey(principal.id, "ops", ["read", "execute"]);
    const { app } = await rig(store);
    const grant = async (resource: string) => {
      const code = await store.createAuthorizationCode(principal.id, {
        keyId: key.entry.id,
        clientId: "cid_test",
        clientName: "Test host",
        resource,
        redirectUri: REDIRECT,
        codeChallenge: CHALLENGE
      });
      const exchange = await store.exchangeAuthorizationCode(code, () => true);
      if (exchange.status !== "issued") throw new Error("exchange failed");
      return exchange.tokens.accessToken;
    };
    const byKey = await kinds(await client(era, `${app}/mcp`, { "x-api-key": key.key }));
    const byToken = await kinds(await client(era, `${app}/mcp`, { authorization: `Bearer ${await grant(`${app}/mcp`)}` }));
    expect(byToken).toEqual(byKey);
    expect(byToken).toContain("invoice-card");

    const foreign = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { ...RPC, authorization: `Bearer ${await grant("https://elsewhere.example/mcp")}` },
      body: LIST
    });
    expect(foreign.status).toBe(401);
  });

  it("a browser host can complete the challenge", async () => {
    const { app } = await rig(createMemoryStore());
    const preflight = await fetch(`${app}/mcp`, {
      method: "OPTIONS",
      headers: {
        origin: "https://host.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type, mcp-protocol-version"
      }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect((preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase()).toContain("authorization");
    const challenged = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { ...RPC, origin: "https://host.example" },
      body: LIST
    });
    expect(challenged.status).toBe(401);
    expect((challenged.headers.get("access-control-expose-headers") ?? "").toLowerCase()).toContain("www-authenticate");
  });
});

describe("hosts sign in through the authoring app", () => {
  it("adding the bare URL signs the host in, and the connection follows its key", async () => {
    const store = createMemoryStore();
    const principal = await store.ensurePrincipal("local:default", "Self-hosted");
    await store.putWidget(principal.id, widget("invoice-card"));
    const { app, writesAttempted } = await rig(store);

    const flow = await discoverAndAuthorize(app);
    // Single-principal mode: the consent page is the first page, with no sign-in step.
    expect(flow.status).toBe(200);
    expect(flow.html).toContain("Signed in as Self-hosted");
    expect(flow.html).toContain("Test host");
    expect(flow.html).not.toContain("Continue without an account");

    const back = await decide(app, { request: flow.decisionToken, action: "approve", key: "new", name: "Test host", execute: "on" });
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("iss")).toBe(app);
    const issued = await tokens(app, {
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: flow.clientId,
      redirect_uri: REDIRECT
    });
    expect(issued.status).toBe(200);
    expect(issued.body.scope).toBe("read execute");

    for (const era of ["modern", "legacy"] as const) {
      const mcp = await client(era, `${app}/mcp`, { authorization: `Bearer ${issued.body.access_token ?? ""}` });
      expect(await kinds(mcp)).toContain("invoice-card");
    }
    // The MCP service resolved all of that through its read-only ports.
    expect(writesAttempted).toEqual([]);

    // Refresh rotates; the old access token stops at once.
    const refreshed = await tokens(app, {
      grant_type: "refresh_token",
      refresh_token: issued.body.refresh_token ?? "",
      client_id: flow.clientId
    });
    expect(refreshed.status).toBe(200);
    const stale = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { ...RPC, authorization: `Bearer ${issued.body.access_token ?? ""}` },
      body: LIST
    });
    expect(stale.status).toBe(401);

    // The key made at consent is the connection's handle: revoke it and the host is cut off.
    const keys = await store.listKeys(principal.id);
    expect(keys.map((key) => [key.name, key.scopes])).toEqual([["Test host", ["read", "execute"]]]);
    await store.revokeKey(principal.id, keys[0]?.id ?? "");
    const cut = await fetch(`${app}/mcp`, {
      method: "POST",
      headers: { ...RPC, authorization: `Bearer ${refreshed.body.access_token ?? ""}` },
      body: LIST
    });
    expect(cut.status).toBe(401);
    expect(cut.headers.get("www-authenticate")).toContain('error="invalid_token"');
    const again = await tokens(app, {
      grant_type: "refresh_token",
      refresh_token: refreshed.body.refresh_token ?? "",
      client_id: flow.clientId
    });
    expect(again.body.error).toBe("invalid_grant");
  });

  it("the public URL needs nothing", async () => {
    const { app } = await rig(createMemoryStore());
    const mcp = await client("legacy", `${app}/mcp/public`);
    expect(await kinds(mcp)).toContain("card");
    expect((await mcp.listTools()).tools.length).toBeGreaterThan(0);
  });

  it("a proxied identity consents for its own account; without the header only the anonymous choice remains", async () => {
    savedHeader = process.env.WIDGENTIC_TRUSTED_USER_HEADER;
    process.env.WIDGENTIC_TRUSTED_USER_HEADER = "x-forwarded-user";
    const store = createMemoryStore();
    const { app } = await rig(store);
    const alice = await signIn(app, { "x-forwarded-user": "alice" });
    const bob = await signIn(app, { "x-forwarded-user": "bob" });
    const aliceId = (await store.ensurePrincipal("proxy:alice")).id;
    const bobId = (await store.ensurePrincipal("proxy:bob")).id;
    await store.putWidget(aliceId, widget("alice-report"));
    await store.putWidget(bobId, widget("bob-report"));

    const aliceKinds = await kinds(await client("modern", `${app}/mcp`, { authorization: `Bearer ${alice.tokens.access_token ?? ""}` }));
    const bobKinds = await kinds(await client("modern", `${app}/mcp`, { authorization: `Bearer ${bob.tokens.access_token ?? ""}` }));
    expect(aliceKinds).toContain("alice-report");
    expect(aliceKinds).not.toContain("bob-report");
    expect(bobKinds).toContain("bob-report");
    expect(bobKinds).not.toContain("alice-report");

    // No header: nobody is signed in, and nobody's catalog can be reached.
    const unsigned = await discoverAndAuthorize(app);
    expect(unsigned.status).toBe(200);
    expect(unsigned.html).toContain("Continue without an account");
    expect(unsigned.html).not.toContain("Signed in as");
    expect(unsigned.html).not.toContain('value="approve"');
    const back = await decide(app, { request: unsigned.decisionToken, action: "anonymous" });
    const issued = await tokens(app, {
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: unsigned.clientId,
      redirect_uri: REDIRECT
    });
    expect(issued.body.access_token).toMatch(/^wgn_/);
    expect(issued.body).not.toHaveProperty("refresh_token");
    const anonymousKinds = await kinds(
      await client("legacy", `${app}/mcp`, { authorization: `Bearer ${issued.body.access_token ?? ""}` })
    );
    expect(anonymousKinds).toContain("card");
    expect(anonymousKinds).not.toContain("alice-report");
    expect(anonymousKinds).not.toContain("bob-report");
  });

  it("connections survive a restart", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "wg-sign-in-")), "store.db");
    const first = createSqliteStore(path, { onDiagnostic: () => {} });
    const before = await rig(first);
    const connected = await signIn(before.app);
    first.close();

    // New processes over the same volume, with the same KEK: the secret is
    // derived from it, so nothing else had to be configured to survive.
    const second = createSqliteStore(path, { onDiagnostic: () => {} });
    closers.push(() => second.close());
    const after = await rig(second);
    const refreshed = await tokens(after.app, {
      grant_type: "refresh_token",
      refresh_token: connected.tokens.refresh_token ?? "",
      client_id: connected.clientId
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).toMatch(/^wga_/);
    // The client id registered before the restart is still recognised.
    const query = new URLSearchParams({
      response_type: "code",
      client_id: connected.clientId,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256"
    });
    const page = await fetch(`${after.app}/oauth/authorize?${query.toString()}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Test host");
  });

  it("the deployment key still resolves, and another unknown key is challenged", async () => {
    const store = createMemoryStore();
    const principal = await store.ensurePrincipal("local:default", "Self-hosted");
    await store.putWidget(principal.id, widget("seeded-widget"));
    const stored = await store.createKey(principal.id, "stored");
    const deploymentKey = generateKey();
    const { app } = await rig(store, { WIDGENTIC_DEFAULT_KEY: deploymentKey });
    expect(await kinds(await client("legacy", `${app}/mcp?key=${deploymentKey}`))).toContain("seeded-widget");
    expect(await kinds(await client("legacy", `${app}/mcp`, { "x-api-key": stored.key }))).toContain("seeded-widget");
    const unknown = await fetch(`${app}/mcp?key=${generateKey()}`, { method: "POST", headers: RPC, body: LIST });
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

describe("the sign-in configuration", () => {
  it("derives the issuer and the resource from the public origins, or from the local ports", () => {
    expect(oauthOrigins({})).toEqual({
      issuer: "http://localhost:8080",
      resource: "http://localhost:8081/mcp",
      publicResource: "http://localhost:8081/mcp/public"
    });
    expect(oauthOrigins({ WIDGENTIC_WEB_PORT: "9000", WIDGENTIC_MCP_PORT: "9001" }).resource).toBe("http://localhost:9001/mcp");
    expect(oauthOrigins({ WIDGENTIC_PUBLIC_URL: "https://demo.example.com/" })).toEqual({
      issuer: "https://demo.example.com",
      resource: "https://demo.example.com/mcp",
      publicResource: "https://demo.example.com/mcp/public"
    });
    expect(
      oauthOrigins({ WIDGENTIC_PUBLIC_URL: "https://app.example.com", WIDGENTIC_MCP_PUBLIC_URL: "https://mcp.example.com/mcp/" })
    ).toEqual({
      issuer: "https://app.example.com",
      resource: "https://mcp.example.com/mcp",
      publicResource: "https://mcp.example.com/mcp/public"
    });
    expect(oauthOrigins({ WIDGENTIC_PUBLIC_URL: " ", WIDGENTIC_MCP_PUBLIC_URL: "" }).issuer).toBe("http://localhost:8080");
  });

  it("takes the secret as given, derives it from the KEK, or says it will not survive a restart", () => {
    const logs: string[] = [];
    const explicit = "an-explicit-secret-of-sufficient-length-0123";
    expect(oauthSecret({ WIDGENTIC_OAUTH_SECRET: explicit, WIDGENTIC_KEK: KEK }, (line) => logs.push(line))).toBe(explicit);
    expect(() => oauthSecret({ WIDGENTIC_OAUTH_SECRET: "short" })).toThrow(/32/);
    const derived = oauthSecret({ WIDGENTIC_KEK: KEK }, (line) => logs.push(line));
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).toBe(oauthSecret({ WIDGENTIC_KEK: KEK }));
    expect(derived).not.toBe(KEK);
    expect(derived).not.toBe(oauthSecret({ WIDGENTIC_KEK: "cd".repeat(32) }));
    expect(logs).toEqual([]);
    const perBoot = oauthSecret({}, (line) => logs.push(line));
    expect(perBoot).toMatch(/^[0-9a-f]{64}$/);
    expect(perBoot).not.toBe(oauthSecret({}, () => {}));
    expect(logs.join("\n")).toContain("per-boot secret");
    expect(logs.join("\n")).not.toContain(perBoot);
  });
});
