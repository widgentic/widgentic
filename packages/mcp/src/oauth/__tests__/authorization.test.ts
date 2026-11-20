// @vitest-environment happy-dom
/**
 * The authorization surface through its core, with plain values and the
 * memory store (mcp-authorization spec). The node adapter has its own file.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../../store/index.js";
import type { MemoryStore } from "../../store/index.js";
import { AUTHORIZATION_PATHS, authorizationServerMetadata, createAuthorizationSurface } from "../handler.js";
import type { AuthorizationSurface } from "../handler.js";
import type { AuthorizationDeps, AuthorizationRequest, AuthorizationResponse, SignedInPrincipal } from "../types.js";

const ISSUER = "https://example.com";
const RESOURCE = "https://mcp.example.com/mcp";
const SECRET = "test-secret-that-is-long-enough-0123456789";
const REDIRECT = "https://host.example/cb";
const VERIFIER = "verifier-0123456789-0123456789-0123456789-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

interface Harness {
  surface: AuthorizationSurface;
  store: MemoryStore;
  deps: AuthorizationDeps;
  logs: string[];
  advance(seconds: number): void;
  state(): string;
}

function harness(overrides: Partial<AuthorizationDeps> = {}): Harness {
  const clock = { now: Date.parse("2026-11-01T00:00:00Z") };
  const logs: string[] = [];
  const store = createMemoryStore([], undefined, { now: () => clock.now });
  const deps: AuthorizationDeps = {
    issuer: ISSUER,
    resources: [RESOURCE, "https://mcp.example.com/other"],
    secret: SECRET,
    store,
    signIn: [{ label: "Sign in with email", href: "/auth/login" }],
    log: (line) => logs.push(line),
    now: () => clock.now,
    ...overrides
  };
  return {
    surface: createAuthorizationSurface(deps),
    store,
    deps,
    logs,
    advance: (seconds) => {
      clock.now += seconds * 1000;
    },
    state: () => JSON.stringify(store.snapshot())
  };
}

async function call(h: Harness, request: AuthorizationRequest): Promise<AuthorizationResponse> {
  const response = await h.surface.handle(request);
  if (response === undefined) throw new Error(`no route for ${request.path}`);
  return response;
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

async function register(h: Harness, metadata: Record<string, unknown> = { client_name: "Claude", redirect_uris: [REDIRECT] }) {
  const response = await call(h, { method: "POST", path: AUTHORIZATION_PATHS.register, json: metadata });
  return { response, body: JSON.parse(response.body) as Record<string, unknown> };
}

async function clientId(h: Harness): Promise<string> {
  return String((await register(h)).body.client_id);
}

function authorizeQuery(client: string, extra: Record<string, string | undefined> = {}): Record<string, string> {
  const query: Record<string, string | undefined> = {
    response_type: "code",
    client_id: client,
    redirect_uri: REDIRECT,
    state: "state-1",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
    ...extra
  };
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

async function authorize(h: Harness, client: string, principal?: SignedInPrincipal, extra: Record<string, string | undefined> = {}) {
  return call(h, {
    method: "GET",
    path: AUTHORIZATION_PATHS.authorize,
    query: authorizeQuery(client, extra),
    ...(principal === undefined ? {} : { principal })
  });
}

function decisionToken(page: AuthorizationResponse): string {
  const input = parse(page.body).querySelector('input[name="request"]');
  const value = input?.getAttribute("value");
  if (value === null || value === undefined) throw new Error("the page carries no decision token");
  return value;
}

async function decide(h: Harness, token: string, fields: Record<string, string>, principal?: SignedInPrincipal) {
  return call(h, {
    method: "POST",
    path: AUTHORIZATION_PATHS.decision,
    form: { request: token, ...fields },
    ...(principal === undefined ? {} : { principal })
  });
}

function location(response: AuthorizationResponse): URL {
  expect(response.status).toBe(302);
  return new URL(response.headers.Location ?? "");
}

async function exchange(h: Harness, form: Record<string, string>) {
  const response = await call(h, { method: "POST", path: AUTHORIZATION_PATHS.token, form });
  return { response, body: JSON.parse(response.body) as Record<string, string | number> };
}

async function signedIn(h: Harness, subject = "person:one", label = "Person One"): Promise<SignedInPrincipal> {
  const principal = await h.store.ensurePrincipal(subject, label);
  return { principalId: principal.id, label };
}

/** The whole signed-in flow with an existing key; returns the token response. */
async function connect(h: Harness, principal: SignedInPrincipal, keyId: string, client?: string) {
  const id = client ?? (await clientId(h));
  const page = await authorize(h, id, principal);
  const back = location(await decide(h, decisionToken(page), { action: "approve", key: keyId }, principal));
  const code = back.searchParams.get("code") ?? "";
  const tokens = await exchange(h, {
    grant_type: "authorization_code",
    code,
    code_verifier: VERIFIER,
    client_id: id,
    redirect_uri: REDIRECT
  });
  return { clientId: id, code, tokens: tokens.body, response: tokens.response };
}

describe("the host resolves who is signed in; the surface never does", () => {
  it("two hosts, two authentication schemes, one surface", async () => {
    const h = harness();
    const id = await clientId(h);
    // One host read a session, the other serves a fixed principal: the
    // surface sees only the resolved value either way.
    const fromSession = await signedIn(h, "session:alice", "Alice");
    const fixed = await signedIn(h, "local:default", "Self-hosted");
    for (const principal of [fromSession, fixed]) {
      const page = await authorize(h, id, principal);
      expect(page.status).toBe(200);
      const doc = parse(page.body);
      expect(doc.querySelector(".who")?.textContent).toContain(principal.label);
      expect(doc.querySelector('button[value="approve"]')).not.toBeNull();
    }
  });

  it("an unsigned visitor is offered sign-in and the anonymous choice, and nothing is written", async () => {
    const h = harness();
    const id = await clientId(h);
    const before = h.state();
    const page = await authorize(h, id);
    expect(page.status).toBe(200);
    const doc = parse(page.body);
    const link = doc.querySelector("ul.signin a");
    expect(link?.textContent).toBe("Sign in with email");
    const href = new URL(link?.getAttribute("href") ?? "", ISSUER);
    expect(href.pathname).toBe("/auth/login");
    // The return address is the same authorize request, on this origin.
    const returnTo = new URL(href.searchParams.get("return_to") ?? "", ISSUER);
    expect(returnTo.pathname).toBe(AUTHORIZATION_PATHS.authorize);
    expect(Object.fromEntries(returnTo.searchParams)).toEqual(authorizeQuery(id));
    expect(doc.querySelector('button[value="anonymous"]')).not.toBeNull();
    expect(doc.querySelector('button[value="approve"]')).toBeNull();
    expect(h.state()).toBe(before);
  });

  it("the request cannot name a principal", async () => {
    const h = harness();
    const alice = await signedIn(h, "person:alice", "Alice");
    const bob = await signedIn(h, "person:bob", "Bob");
    const aliceKey = await h.store.createKey(alice.principalId, "alice-key");
    const id = await clientId(h);
    const page = await authorize(h, id, alice, { principal_id: bob.principalId, principalId: bob.principalId });
    const back = location(
      await decide(
        h,
        decisionToken(page),
        { action: "approve", key: aliceKey.entry.id, principal_id: bob.principalId, principalId: bob.principalId },
        alice
      )
    );
    const tokens = await exchange(h, {
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: id,
      principal_id: bob.principalId
    });
    const resolved = await h.store.resolveAccessToken(String(tokens.body.access_token), { resource: RESOURCE });
    expect(resolved?.id).toBe(alice.principalId);
    expect(await h.store.listGrants(bob.principalId)).toEqual([]);
  });
});

describe("authorization-server metadata is derived from the surface", () => {
  it("the document matches the mounted routes", async () => {
    const h = harness();
    const response = await call(h, { method: "GET", path: AUTHORIZATION_PATHS.metadata });
    const document = JSON.parse(response.body) as Record<string, unknown>;
    expect(document).toEqual(authorizationServerMetadata(ISSUER));
    expect(document.issuer).toBe(ISSUER);
    for (const name of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"]) {
      const endpoint = new URL(String(document[name]));
      expect(endpoint.origin, name).toBe(ISSUER);
      expect(h.surface.owns(endpoint.pathname), name).toBe(true);
    }
    expect(document.code_challenge_methods_supported).toEqual(["S256"]);
    expect(document.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(document.response_types_supported).toEqual(["code"]);
    expect(document.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(document.scopes_supported).toEqual(["read", "execute"]);
    expect(document.client_id_metadata_document_supported).toBe(true);
    expect(document.authorization_response_iss_parameter_supported).toBe(true);
  });

  it("browser clients can reach the token endpoint, not the authorize pages", async () => {
    const h = harness();
    const id = await clientId(h);
    for (const path of [AUTHORIZATION_PATHS.metadata, AUTHORIZATION_PATHS.register, AUTHORIZATION_PATHS.token, AUTHORIZATION_PATHS.revoke]) {
      const preflight = await call(h, { method: "OPTIONS", path });
      expect(preflight.status, path).toBe(204);
      expect(preflight.headers["Access-Control-Allow-Origin"], path).toBe("*");
      expect(preflight.headers["Access-Control-Allow-Headers"], path).toBe("*");
    }
    const refused = await exchange(h, { grant_type: "refresh_token", client_id: id, refresh_token: "x" });
    expect(refused.response.headers["Access-Control-Allow-Origin"]).toBe("*");

    const page = await authorize(h, id);
    expect(page.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    const decision = await decide(h, decisionToken(page), { action: "deny" });
    expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    for (const path of [AUTHORIZATION_PATHS.authorize, AUTHORIZATION_PATHS.decision]) {
      const preflight = await call(h, { method: "OPTIONS", path });
      expect(preflight.status, path).toBe(405);
      expect(preflight.headers["Access-Control-Allow-Origin"], path).toBeUndefined();
    }
  });

  it("the surface refuses a secret or issuer it cannot stand on", () => {
    const store = createMemoryStore();
    const base = { resources: [RESOURCE], store };
    expect(() => createAuthorizationSurface({ ...base, issuer: ISSUER, secret: "short" })).toThrow(/secret/);
    expect(() => createAuthorizationSurface({ ...base, issuer: "https://example.com/app", secret: SECRET })).toThrow(/issuer/);
    expect(() => createAuthorizationSurface({ issuer: ISSUER, secret: SECRET, store, resources: [] })).toThrow(/resource/);
  });
});

describe("clients register without the server storing them", () => {
  it("a registered client is recognised without a record", async () => {
    const h = harness();
    const before = h.state();
    const { response, body } = await register(h);
    expect(response.status).toBe(201);
    expect(body.client_name).toBe("Claude");
    expect(body.redirect_uris).toEqual([REDIRECT]);
    expect(body.token_endpoint_auth_method).toBe("none");
    expect(String(body.client_id)).toMatch(/^wgd_/);
    expect(h.state()).toBe(before);

    const page = await authorize(h, String(body.client_id));
    expect(page.status).toBe(200);
    const app = parse(page.body).querySelector(".app");
    expect(app?.querySelector("strong")?.textContent).toBe("Claude");
    expect(app?.textContent).toContain("host.example");
    expect(app?.textContent).toContain("not verified");
    expect(h.state()).toBe(before);
  });

  it("a client's name is bounded and shown as text", async () => {
    const h = harness();
    const { body } = await register(h, { client_name: `<img src=x onerror=alert(1)>${"n".repeat(200)}`, redirect_uris: [REDIRECT] });
    expect(String(body.client_name)).toHaveLength(80);
    const page = await authorize(h, String(body.client_id));
    const doc = parse(page.body);
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelector(".app strong")?.textContent).toBe(body.client_name);
    const unnamed = await register(h, { redirect_uris: [REDIRECT] });
    expect(unnamed.body.client_name).toBe("Unnamed application");
  });

  it("a forged client id is refused without redirecting", async () => {
    const h = harness();
    const id = await clientId(h);
    const tampered = `${id.slice(0, 20)}${id[20] === "A" ? "B" : "A"}${id.slice(21)}`;
    const foreign = String(
      (await register(harness({ secret: "another-deployments-secret-0123456789abcdef" }))).body.client_id
    );
    for (const candidate of [tampered, foreign, "wgd_garbage", "plain-client", ""]) {
      const response = await authorize(h, candidate);
      expect(response.status, candidate).toBe(400);
      expect(response.headers.Location, candidate).toBeUndefined();
      expect(response.headers["Content-Type"]).toContain("text/html");
    }
  });

  it("a metadata-document client is fetched under the guard", async () => {
    const url = "https://host.example/client.json";
    const document = { client_id: url, client_name: "Document client", redirect_uris: [REDIRECT] };
    const calls: { url: string; redirect: unknown; address: string }[] = [];
    const respond = (body: unknown, init: ResponseInit = {}): Response =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init
      });
    const withFetch = (answer: () => Response, addresses = ["93.184.216.34"]) =>
      harness({
        fetchDeps: {
          lookupImpl: async () => addresses,
          fetchImpl: async (target, init) => {
            calls.push({ url: target, redirect: init.redirect, address: init.address });
            return answer();
          }
        }
      });

    const good = withFetch(() => respond(document));
    const page = await authorize(good, url);
    expect(page.status).toBe(200);
    expect(parse(page.body).querySelector(".app strong")?.textContent).toBe("Document client");
    expect(calls).toEqual([{ url, redirect: "manual", address: "93.184.216.34" }]);

    const refused: [string, Harness][] = [
      ["private address", withFetch(() => respond(document), ["10.0.0.5"])],
      ["redirect", withFetch(() => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }))],
      ["not json", withFetch(() => respond("<html></html>", { headers: { "content-type": "text/html" } }))],
      ["too large", withFetch(() => respond(document, { headers: { "content-type": "application/json", "content-length": "9999999" } }))],
      ["another client id", withFetch(() => respond({ ...document, client_id: "https://host.example/other.json" }))],
      ["no redirect uris", withFetch(() => respond({ client_id: url, client_name: "x" }))],
      ["not found", withFetch(() => respond({ error: "nope" }, { status: 404 }))]
    ];
    for (const [name, h] of refused) {
      const response = await authorize(h, url);
      expect(response.status, name).toBe(400);
      expect(response.headers.Location, name).toBeUndefined();
    }
    // Only https URLs are documents; anything else is simply unknown.
    const plain = await authorize(good, "http://host.example/client.json");
    expect(plain.status).toBe(400);
  });

  it("redirect URIs are checked at the door and matched exactly", async () => {
    const h = harness();
    const bad: unknown[] = [
      ["javascript:alert(1)"],
      ["data:text/html,x"],
      ["file:///etc/passwd"],
      ["http://example.com/cb"],
      ["https://host.example/cb#fragment"],
      ["not a url"],
      [],
      undefined,
      Array.from({ length: 11 }, (_, i) => `https://host.example/cb${i}`),
      [REDIRECT, 5]
    ];
    for (const redirect_uris of bad) {
      const { response, body } = await register(h, { client_name: "x", redirect_uris });
      expect(response.status, JSON.stringify(redirect_uris)).toBe(400);
      expect(body.error, JSON.stringify(redirect_uris)).toBe("invalid_redirect_uri");
    }
    expect((await call(h, { method: "POST", path: AUTHORIZATION_PATHS.register, json: "nope" })).status).toBe(400);

    const allowed = await register(h, {
      client_name: "Native",
      redirect_uris: ["http://127.0.0.1/cb", "http://localhost:3000/cb", "cursor://anysphere.cursor/callback", REDIRECT]
    });
    expect(allowed.response.status).toBe(201);
    const id = String(allowed.body.client_id);

    for (const redirect_uri of ["https://host.example/other", "https://host.example/cb?x=1", "https://evil.example/cb", "http://127.0.0.1/other"]) {
      const response = await authorize(h, id, undefined, { redirect_uri });
      expect(response.status, redirect_uri).toBe(400);
      expect(response.headers.Location, redirect_uri).toBeUndefined();
    }
    // Loopback ports are chosen at run time; everything else must be exact.
    expect((await authorize(h, id, undefined, { redirect_uri: "http://127.0.0.1:53123/cb" })).status).toBe(200);
    expect((await authorize(h, id, undefined, { redirect_uri: "http://localhost:9/cb" })).status).toBe(200);
    expect((await authorize(h, id, undefined, { redirect_uri: "cursor://anysphere.cursor/callback" })).status).toBe(200);
    // With several registered, the request must say which.
    expect((await authorize(h, id, undefined, { redirect_uri: undefined })).status).toBe(400);
    expect((await authorize(h, await clientId(h), undefined, { redirect_uri: undefined })).status).toBe(200);
  });
});

describe("the authorize step validates before it shows anything", () => {
  /** The link an error page offers back to the client; the page itself never redirects. */
  function backLink(response: AuthorizationResponse): URL {
    expect(response.status).toBe(400);
    expect(response.headers.Location).toBeUndefined();
    expect(response.headers["Content-Type"]).toContain("text/html");
    const link = parse(response.body).querySelector("a.button");
    expect(link?.textContent).toBe("Return to host.example");
    return new URL(link?.getAttribute("href") ?? "");
  }

  it("a request without PKCE is refused to the client", async () => {
    const h = harness();
    const id = await clientId(h);
    for (const extra of [
      { code_challenge: undefined },
      { code_challenge_method: "plain" },
      { code_challenge_method: undefined },
      { code_challenge: "short" }
    ]) {
      const back = backLink(await authorize(h, id, undefined, extra));
      expect(back.origin + back.pathname).toBe(REDIRECT);
      expect(back.searchParams.get("error")).toBe("invalid_request");
      expect(back.searchParams.get("state")).toBe("state-1");
      expect(back.searchParams.get("iss")).toBe(ISSUER);
      expect(back.searchParams.get("code")).toBeNull();
    }
    const wrongType = backLink(await authorize(h, id, undefined, { response_type: "token" }));
    expect(wrongType.searchParams.get("error")).toBe("unsupported_response_type");
  });

  it("a refused request never sends the browser to the client by itself", async () => {
    // Registration is open: a link to this origin must not become a
    // redirect to an address of the linker's choosing.
    const h = harness();
    const evil = String(
      (await register(h, { client_name: "Totally Legit", redirect_uris: ["https://evil.example/landing"] })).body.client_id
    );
    const response = await call(h, {
      method: "GET",
      path: AUTHORIZATION_PATHS.authorize,
      query: { client_id: evil, response_type: "code" }
    });
    expect(response.status).toBe(400);
    expect(response.headers.Location).toBeUndefined();
    const doc = parse(response.body);
    expect(doc.querySelector("meta[http-equiv]")).toBeNull();
    expect(doc.querySelector("a.button")?.textContent).toBe("Return to evil.example");
    expect(doc.querySelector(".note")?.textContent).toContain("not verified");
  });

  it("an unknown resource is refused, and an absent one defaults to the first", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const id = await clientId(h);
    const back = backLink(await authorize(h, id, person, { resource: "https://elsewhere.example/mcp" }));
    expect(back.searchParams.get("error")).toBe("invalid_target");
    expect(back.searchParams.get("state")).toBe("state-1");

    const page = await authorize(h, id, person, { resource: undefined });
    expect(page.status).toBe(200);
    const approved = location(await decide(h, decisionToken(page), { action: "approve", key: key.entry.id }, person));
    const tokens = await exchange(h, {
      grant_type: "authorization_code",
      code: approved.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: id
    });
    expect(await h.store.resolveAccessToken(String(tokens.body.access_token), { resource: RESOURCE })).toBeDefined();
    expect(
      await h.store.resolveAccessToken(String(tokens.body.access_token), { resource: "https://mcp.example.com/other" })
    ).toBeUndefined();
  });

  it("pages cannot be framed or cached and load nothing from elsewhere", async () => {
    const h = harness();
    const person = await signedIn(h);
    await h.store.createKey(person.principalId, "ops");
    const id = await clientId(h);
    const pages = [await authorize(h, id), await authorize(h, id, person), await authorize(h, "wgd_forged")];
    expect(pages.map((page) => page.status)).toEqual([200, 200, 400]);
    for (const page of pages) {
      const csp = page.headers["Content-Security-Policy"] ?? "";
      const directives = Object.fromEntries(
        csp.split(";").map((part) => {
          const [name, ...values] = part.trim().split(/\s+/);
          return [name, values];
        })
      ) as Record<string, string[]>;
      expect(directives["default-src"]).toEqual(["'none'"]);
      expect(directives["frame-ancestors"]).toEqual(["'none'"]);
      expect(directives["base-uri"]).toEqual(["'none'"]);
      expect(directives["script-src"]).toBeUndefined();
      // Styles: exactly the page's own inline block, by hash.
      const doc = parse(page.body);
      const styles = [...doc.querySelectorAll("style")].map((style) => style.textContent ?? "");
      expect(directives["style-src"]).toEqual(
        styles.map((text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`)
      );
      expect(page.headers["X-Frame-Options"]).toBe("DENY");
      expect(page.headers["Cache-Control"]).toBe("no-store");
      expect(page.headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(doc.querySelectorAll("script, link, img, iframe, object, embed, video, audio").length).toBe(0);
      expect(doc.querySelectorAll("[style], [onclick], [onload]").length).toBe(0);
      for (const form of doc.querySelectorAll("form")) {
        expect(form.getAttribute("action")).toBe(AUTHORIZATION_PATHS.decision);
        expect(form.getAttribute("method")).toBe("post");
      }
    }
  });

  it("a host's own page markup is served under the same policy", async () => {
    const h = harness({
      renderPage: (page) => `<!doctype html><title>${page.kind}</title><style>body{color:red}</style><p id="kind">${page.kind}</p>`
    });
    const page = await authorize(h, await clientId(h));
    expect(parse(page.body).querySelector("#kind")?.textContent).toBe("sign-in");
    expect(page.headers["Content-Security-Policy"]).toContain(
      `'sha256-${createHash("sha256").update("body{color:red}").digest("base64")}'`
    );
    expect(page.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("consent binds the host to an API key the person selects or creates", () => {
  it("the person selects an existing key", async () => {
    const h = harness();
    const person = await signedIn(h);
    await h.store.createKey(person.principalId, "laptop");
    const ops = await h.store.createKey(person.principalId, "ops", ["read", "execute"]);
    const retired = await h.store.createKey(person.principalId, "retired");
    await h.store.revokeKey(person.principalId, retired.entry.id);
    const id = await clientId(h);

    const page = await authorize(h, id, person);
    const doc = parse(page.body);
    const options = [...doc.querySelectorAll('input[name="key"]')].map((input) => input.getAttribute("value"));
    expect(options).toHaveLength(3);
    expect(options).toContain(ops.entry.id);
    expect(options).toContain("new");
    expect(options).not.toContain(retired.entry.id);
    expect(doc.querySelector("fieldset")?.textContent).toContain("laptop");
    expect(doc.querySelector("fieldset")?.textContent).toContain(ops.entry.digestPreview);
    expect(page.body).not.toContain(ops.key);

    const back = location(await decide(h, decisionToken(page), { action: "approve", key: ops.entry.id }, person));
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("state")).toBe("state-1");
    expect(back.searchParams.get("iss")).toBe(ISSUER);
    const code = back.searchParams.get("code") ?? "";
    expect(code).toMatch(/^wgc_/);
    const tokens = await exchange(h, { grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: id });
    expect(tokens.body.scope).toBe("read execute");
    const grants = await h.store.listGrants(person.principalId);
    expect(grants.map((grant) => [grant.keyId, grant.clientName, grant.scopes])).toEqual([
      [ops.entry.id, "Claude", ["read", "execute"]]
    ]);
  });

  it("the person creates a key at consent, and no response carries a raw key", async () => {
    const h = harness();
    const person = await signedIn(h);
    const id = await clientId(h);
    const page = await authorize(h, id, person);
    // With no keys yet, creating one is the preselected choice.
    expect(parse(page.body).querySelector('input[name="key"][value="new"]')?.hasAttribute("checked")).toBe(true);
    const decision = await decide(h, decisionToken(page), { action: "approve", key: "new", name: "Claude" }, person);
    const back = location(decision);
    const tokens = await exchange(h, {
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: id
    });
    const keys = await h.store.listKeys(person.principalId);
    expect(keys.map((key) => [key.name, key.scopes])).toEqual([["Claude", ["read"]]]);
    expect((await h.store.listGrants(person.principalId)).map((grant) => grant.keyId)).toEqual([keys[0]?.id]);
    for (const text of [page.body, decision.body, JSON.stringify(decision.headers), tokens.response.body, h.logs.join("\n")]) {
      expect(text).not.toMatch(/wgk_/);
    }

    // Execute is opt-in for a new key too.
    const second = await authorize(h, id, person);
    const withExecute = location(
      await decide(h, decisionToken(second), { action: "approve", key: "new", name: "Runner", execute: "on" }, person)
    );
    expect(withExecute.searchParams.get("code")).toMatch(/^wgc_/);
    expect((await h.store.listKeys(person.principalId)).find((key) => key.name === "Runner")?.scopes).toEqual(["read", "execute"]);
  });

  it("a store refusal is reported, not bypassed", async () => {
    const h = harness();
    const person = await signedIn(h);
    const existing = await h.store.createKey(person.principalId, "ops");
    const id = await clientId(h);
    const page = await authorize(h, id, person);
    const token = decisionToken(page);

    const cases: [Record<string, string>, RegExp][] = [
      [{ action: "approve", key: "new", name: "   " }, /name/i],
      [{ action: "approve", key: "new", name: "Admin", scopes: "write" }, /permission/i],
      [{ action: "approve", key: "key_does_not_exist" }, /no longer available/i],
      [{ action: "approve" }, /choose a key/i]
    ];
    for (const [fields, message] of cases) {
      const before = h.state();
      const response = await decide(h, token, fields, person);
      expect(response.status, JSON.stringify(fields)).toBe(422);
      expect(response.headers.Location).toBeUndefined();
      expect(parse(response.body).querySelector(".problem")?.textContent).toMatch(message);
      expect(h.state(), JSON.stringify(fields)).toBe(before);
      // The page shown again is answerable: an existing key still works.
      const retry = location(await decide(h, decisionToken(response), { action: "approve", key: existing.entry.id }, person));
      expect(retry.searchParams.get("code")).toMatch(/^wgc_/);
    }
  });

  it("a requested scope narrows the grant", async () => {
    const h = harness();
    const person = await signedIn(h);
    const ops = await h.store.createKey(person.principalId, "ops", ["read", "execute"]);
    const id = await clientId(h);
    const page = await authorize(h, id, person, { scope: "read offline_access" });
    expect(parse(page.body).querySelector("form")?.textContent).toContain("It asked for: read");
    const back = location(await decide(h, decisionToken(page), { action: "approve", key: ops.entry.id }, person));
    const tokens = await exchange(h, {
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: id
    });
    expect(tokens.body.scope).toBe("read");
    const resolved = await h.store.resolveAccessToken(String(tokens.body.access_token), { resource: RESOURCE });
    expect(resolved?.scopes).toEqual(["read"]);
  });

  it("a forged decision writes nothing", async () => {
    const h = harness();
    const alice = await signedIn(h, "person:alice", "Alice");
    const mallory = await signedIn(h, "person:mallory", "Mallory");
    const aliceKey = await h.store.createKey(alice.principalId, "alice-key");
    const malloryKey = await h.store.createKey(mallory.principalId, "mallory-key");
    const id = await clientId(h);
    const alicePage = await authorize(h, id, alice);
    const aliceToken = decisionToken(alicePage);
    const before = h.state();
    const refused = async (response: AuthorizationResponse, name: string) => {
      expect(response.status, name).toBe(400);
      expect(response.headers.Location, name).toBeUndefined();
      expect(h.state(), name).toBe(before);
    };

    await refused(await decide(h, "", { action: "approve", key: aliceKey.entry.id }, alice), "no token");
    await refused(await decide(h, "not.sealed", { action: "approve", key: aliceKey.entry.id }, alice), "garbage");
    await refused(await decide(h, `${aliceToken}x`, { action: "approve", key: aliceKey.entry.id }, alice), "tampered");
    // A page shown to Alice answers for nobody else, signed in or not.
    await refused(await decide(h, aliceToken, { action: "approve", key: malloryKey.entry.id }, mallory), "another principal");
    await refused(await decide(h, aliceToken, { action: "approve", key: aliceKey.entry.id }), "signed out");
    // A page shown to an unsigned visitor cannot approve for anyone.
    const unsignedToken = decisionToken(await authorize(h, id));
    await refused(await decide(h, unsignedToken, { action: "approve", key: aliceKey.entry.id }, alice), "unsigned page");
    // A signed-in page offers no anonymous way out.
    await refused(await decide(h, aliceToken, { action: "anonymous" }, alice), "anonymous on a signed-in page");

    // A token sealed for another client or redirect is a different request:
    // its code is bound to what was sealed, so the first client cannot use it.
    const other = String((await register(h, { client_name: "Other", redirect_uris: ["https://other.example/cb"] })).body.client_id);
    const otherPage = await authorize(h, other, alice, { redirect_uri: "https://other.example/cb" });
    const back = location(await decide(h, decisionToken(otherPage), { action: "approve", key: aliceKey.entry.id }, alice));
    expect(back.origin).toBe("https://other.example");
    const stolen = await exchange(h, {
      grant_type: "authorization_code",
      code: back.searchParams.get("code") ?? "",
      code_verifier: VERIFIER,
      client_id: id,
      redirect_uri: REDIRECT
    });
    expect(stolen.body.error).toBe("invalid_grant");

    // And after ten minutes the page no longer answers at all.
    h.advance(601);
    const expired = await decide(h, aliceToken, { action: "approve", key: aliceKey.entry.id }, alice);
    expect(expired.status).toBe(400);
    expect(expired.headers.Location).toBeUndefined();
  });

  it("denial returns to the client and writes nothing", async () => {
    const h = harness();
    const person = await signedIn(h);
    await h.store.createKey(person.principalId, "ops");
    const id = await clientId(h);
    const before = h.state();
    const back = location(await decide(h, decisionToken(await authorize(h, id, person)), { action: "deny" }, person));
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("state")).toBe("state-1");
    expect(back.searchParams.get("code")).toBeNull();
    expect(h.state()).toBe(before);
  });
});

describe("continuing without an account yields the anonymous catalog", () => {
  it("a declined login still connects, with no store write", async () => {
    const h = harness();
    const id = await clientId(h);
    const before = h.state();
    const back = location(await decide(h, decisionToken(await authorize(h, id)), { action: "anonymous" }));
    expect(back.searchParams.get("state")).toBe("state-1");
    expect(back.searchParams.get("iss")).toBe(ISSUER);
    const code = back.searchParams.get("code") ?? "";
    const { response, body } = await exchange(h, {
      grant_type: "authorization_code",
      code,
      code_verifier: VERIFIER,
      client_id: id,
      redirect_uri: REDIRECT
    });
    expect(response.status).toBe(200);
    expect(String(body.access_token)).toMatch(/^wgn_[0-9a-f]{64}$/);
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("read");
    expect(body).not.toHaveProperty("refresh_token");
    expect(h.state()).toBe(before);

    // The anonymous token is the anonymous principal.
    expect(await h.store.resolveAccessToken(String(body.access_token), { resource: RESOURCE })).toEqual({
      id: "anonymous",
      label: "Anonymous",
      scopes: ["read"]
    });
  });

  it("PKCE, the client and the lifetime still guard the anonymous exchange", async () => {
    const h = harness();
    const id = await clientId(h);
    const other = String((await register(h, { client_name: "Other", redirect_uris: [REDIRECT] })).body.client_id);
    const code = location(await decide(h, decisionToken(await authorize(h, id)), { action: "anonymous" })).searchParams.get("code") ?? "";
    const base = { grant_type: "authorization_code", code, client_id: id };
    for (const form of [
      { ...base, code_verifier: "another-verifier-0123456789-0123456789-0123456789" },
      { ...base, code_verifier: VERIFIER, client_id: other },
      { ...base, code_verifier: VERIFIER, redirect_uri: "https://host.example/elsewhere" },
      { ...base, code_verifier: VERIFIER, code: `${code}x` }
    ]) {
      const { response, body } = await exchange(h, form);
      expect(response.status).toBe(400);
      expect(body.error).toBe("invalid_grant");
    }
    h.advance(61);
    expect((await exchange(h, { ...base, code_verifier: VERIFIER })).body.error).toBe("invalid_grant");
  });
});

describe("the token endpoint exchanges codes and rotates refresh tokens", () => {
  it("a code becomes a token pair", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops", ["read", "execute"]);
    const { tokens, response } = await connect(h, person, key.entry.id);
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(tokens.token_type).toBe("Bearer");
    expect(String(tokens.access_token)).toMatch(/^wga_/);
    expect(String(tokens.refresh_token)).toMatch(/^wgr_/);
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.scope).toBe("read execute");
  });

  it("a code works once, and a second use ends the first's grant", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const first = await connect(h, person, key.entry.id);
    const again = await exchange(h, {
      grant_type: "authorization_code",
      code: first.code,
      code_verifier: VERIFIER,
      client_id: first.clientId
    });
    expect(again.response.status).toBe(400);
    expect(again.body.error).toBe("invalid_grant");
    expect(await h.store.resolveAccessToken(String(first.tokens.access_token), { resource: RESOURCE })).toBeUndefined();
    expect(await h.store.listGrants(person.principalId)).toEqual([]);
  });

  it("a wrong verifier, client or redirect is refused, and a late code too", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const id = await clientId(h);
    const other = String((await register(h, { client_name: "Other", redirect_uris: [REDIRECT] })).body.client_id);
    const freshCode = async () =>
      location(
        await decide(h, decisionToken(await authorize(h, id, person)), { action: "approve", key: key.entry.id }, person)
      ).searchParams.get("code") ?? "";
    const code = await freshCode();
    const base = { grant_type: "authorization_code", code, client_id: id };
    for (const form of [
      { ...base, code_verifier: "another-verifier-0123456789-0123456789-0123456789" },
      { ...base, code_verifier: "short" },
      { ...base, code_verifier: VERIFIER, client_id: other },
      { ...base, code_verifier: VERIFIER, redirect_uri: "https://host.example/elsewhere" }
    ]) {
      const { response, body } = await exchange(h, form);
      expect(response.status).toBe(400);
      expect(body.error).toBe("invalid_grant");
      expect(body).not.toHaveProperty("access_token");
    }
    // None of those consumed it: the rightful exchange still works.
    expect((await exchange(h, { ...base, code_verifier: VERIFIER })).response.status).toBe(200);

    const late = await freshCode();
    h.advance(61);
    expect((await exchange(h, { ...base, code: late, code_verifier: VERIFIER })).body.error).toBe("invalid_grant");

    expect((await exchange(h, { grant_type: "password", client_id: id })).body.error).toBe("unsupported_grant_type");
    expect((await exchange(h, { grant_type: "authorization_code", code, code_verifier: VERIFIER })).body.error).toBe("invalid_client");
    expect((await exchange(h, { grant_type: "authorization_code", client_id: id })).body.error).toBe("invalid_request");
    expect((await exchange(h, { grant_type: "refresh_token", client_id: id })).body.error).toBe("invalid_request");
    const noForm = await call(h, { method: "POST", path: AUTHORIZATION_PATHS.token });
    expect((JSON.parse(noForm.body) as { error: string }).error).toBe("invalid_request");
  });

  it("refresh rotates the pair", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const first = await connect(h, person, key.entry.id);
    h.advance(1800);
    const rotated = await exchange(h, {
      grant_type: "refresh_token",
      refresh_token: String(first.tokens.refresh_token),
      client_id: first.clientId
    });
    expect(rotated.response.status).toBe(200);
    expect(rotated.body.access_token).not.toBe(first.tokens.access_token);
    expect(rotated.body.refresh_token).not.toBe(first.tokens.refresh_token);
    expect(rotated.body.expires_in).toBe(3600);
    expect(await h.store.resolveAccessToken(String(rotated.body.access_token), { resource: RESOURCE })).toBeDefined();
    expect(await h.store.resolveAccessToken(String(first.tokens.access_token), { resource: RESOURCE })).toBeUndefined();
    // Another client cannot use it.
    const other = String((await register(h, { client_name: "Other", redirect_uris: [REDIRECT] })).body.client_id);
    const stolen = await exchange(h, { grant_type: "refresh_token", refresh_token: String(rotated.body.refresh_token), client_id: other });
    expect(stolen.body.error).toBe("invalid_grant");
  });

  it("a replayed refresh token ends the grant, after a sixty-second grace", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const first = await connect(h, person, key.entry.id);
    const refresh = { grant_type: "refresh_token", refresh_token: String(first.tokens.refresh_token), client_id: first.clientId };
    await exchange(h, refresh);
    h.advance(30);
    const withinGrace = await exchange(h, refresh);
    expect(withinGrace.response.status).toBe(200);
    expect(await h.store.listGrants(person.principalId)).toHaveLength(1);

    h.advance(61);
    const replay = await exchange(h, refresh);
    expect(replay.response.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    expect(await h.store.resolveAccessToken(String(withinGrace.body.access_token), { resource: RESOURCE })).toBeUndefined();
    expect(await h.store.listGrants(person.principalId)).toEqual([]);
  });

  it("nothing secret is logged", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const first = await connect(h, person, key.entry.id);
    const refresh = { grant_type: "refresh_token", refresh_token: String(first.tokens.refresh_token), client_id: first.clientId };
    const rotated = await exchange(h, refresh);
    // Failures of every kind: a used code, a wrong verifier, a replay, a store that throws.
    await exchange(h, { grant_type: "authorization_code", code: first.code, code_verifier: VERIFIER, client_id: first.clientId });
    const second = await connect(h, person, key.entry.id);
    h.advance(120);
    await exchange(h, { grant_type: "refresh_token", refresh_token: String(second.tokens.refresh_token), client_id: second.clientId });
    h.advance(120);
    await exchange(h, { grant_type: "refresh_token", refresh_token: String(second.tokens.refresh_token), client_id: second.clientId });
    await call(h, { method: "POST", path: AUTHORIZATION_PATHS.revoke, form: { token: String(rotated.body.access_token) } });

    const failing = harness({
      store: {
        ...h.store,
        exchangeAuthorizationCode: async (code) => {
          throw new Error(`store exploded while reading ${code}`);
        }
      }
    });
    const exploded = await exchange(failing, {
      grant_type: "authorization_code",
      code: `wgc_${"a".repeat(64)}`,
      code_verifier: VERIFIER,
      client_id: first.clientId
    });
    expect(exploded.response.status).toBe(500);
    expect(exploded.body.error).toBe("server_error");
    expect(exploded.response.body).not.toContain("exploded");
    // The failing surface's OWN log: the store's message named the code, the log line must not.
    expect(failing.logs).toHaveLength(1);
    expect(failing.logs[0]).toContain("failed (Error)");
    expect(failing.logs.join("\n")).not.toMatch(/wgc_/);
    expect(failing.logs.join("\n")).not.toContain("exploded");

    const secrets = [
      first.code,
      VERIFIER,
      String(first.tokens.access_token),
      String(first.tokens.refresh_token),
      String(rotated.body.access_token),
      String(rotated.body.refresh_token),
      String(second.tokens.access_token),
      String(second.tokens.refresh_token),
      key.key
    ];
    const logged = h.logs.join("\n");
    expect(h.logs.length).toBeGreaterThan(0);
    for (const secret of secrets) expect(logged).not.toContain(secret);
    expect(logged).not.toMatch(/wg[acrk]_[0-9a-f]{8}/);
  });
});

describe("revocation ends a grant", () => {
  it("a client signs out, and unknown tokens are not revealed", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const first = await connect(h, person, key.entry.id);
    const known = await call(h, {
      method: "POST",
      path: AUTHORIZATION_PATHS.revoke,
      form: { token: String(first.tokens.refresh_token) }
    });
    expect(known.status).toBe(200);
    expect(await h.store.resolveAccessToken(String(first.tokens.access_token), { resource: RESOURCE })).toBeUndefined();
    const refresh = await exchange(h, {
      grant_type: "refresh_token",
      refresh_token: String(first.tokens.refresh_token),
      client_id: first.clientId
    });
    expect(refresh.body.error).toBe("invalid_grant");

    for (const form of [{ token: `wgr_${"9".repeat(64)}` }, { token: "garbage" }, {}]) {
      const unknown = await call(h, { method: "POST", path: AUTHORIZATION_PATHS.revoke, form });
      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toBe(known.body);
      expect(unknown.headers).toEqual(known.headers);
    }
  });

  it("revoking the key ends the connection", async () => {
    const h = harness();
    const person = await signedIn(h);
    const key = await h.store.createKey(person.principalId, "ops");
    const other = await h.store.createKey(person.principalId, "laptop");
    const first = await connect(h, person, key.entry.id);
    const second = await connect(h, person, other.entry.id);
    await h.store.revokeKey(person.principalId, key.entry.id);
    expect(await h.store.resolveAccessToken(String(first.tokens.access_token), { resource: RESOURCE })).toBeUndefined();
    const refresh = await exchange(h, {
      grant_type: "refresh_token",
      refresh_token: String(first.tokens.refresh_token),
      client_id: first.clientId
    });
    expect(refresh.body.error).toBe("invalid_grant");
    expect(await h.store.resolveAccessToken(String(second.tokens.access_token), { resource: RESOURCE })).toBeDefined();
  });
});

describe("routing", () => {
  it("answers only its own paths and methods", async () => {
    const h = harness();
    expect(await h.surface.handle({ method: "GET", path: "/oauth/unknown" })).toBeUndefined();
    expect(await h.surface.handle({ method: "GET", path: "/" })).toBeUndefined();
    // Another route's preflight is that route's to answer.
    expect(await h.surface.handle({ method: "OPTIONS", path: "/api/widgets" })).toBeUndefined();
    expect(await h.surface.handle({ method: "POST", path: "/api/keys" })).toBeUndefined();
    expect(h.surface.owns("/api/keys")).toBe(false);
    expect((await call(h, { method: "POST", path: AUTHORIZATION_PATHS.metadata })).status).toBe(405);
    expect((await call(h, { method: "GET", path: AUTHORIZATION_PATHS.token })).status).toBe(405);
    expect((await call(h, { method: "POST", path: AUTHORIZATION_PATHS.authorize })).status).toBe(405);
    expect((await call(h, { method: "GET", path: AUTHORIZATION_PATHS.decision })).status).toBe(405);
    expect(h.surface.needsPrincipal(AUTHORIZATION_PATHS.authorize)).toBe(true);
    expect(h.surface.needsPrincipal(AUTHORIZATION_PATHS.token)).toBe(false);
  });
});
