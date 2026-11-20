// @vitest-environment node
/**
 * The node adapter over a real server: the same request through the core
 * and through the adapter yields the same status, headers and body, and a
 * failing host callback is answered by the surface.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../../store/index.js";
import { AUTHORIZATION_PATHS, createAuthorizationSurface } from "../handler.js";
import { createAuthorizationHttpHandler } from "../node.js";
import type { AuthorizationDeps, AuthorizationRequest, AuthorizationResponse } from "../types.js";

const ISSUER = "https://example.com";
const RESOURCE = "https://mcp.example.com/mcp";
const REDIRECT = "https://host.example/cb";
const VERIFIER = "verifier-0123456789-0123456789-0123456789-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function harness() {
  const clock = { now: Date.parse("2026-11-01T00:00:00Z") };
  const logs: string[] = [];
  const store = createMemoryStore([], undefined, { now: () => clock.now });
  const deps: AuthorizationDeps = {
    issuer: ISSUER,
    resources: [RESOURCE],
    secret: "test-secret-that-is-long-enough-0123456789",
    store,
    signIn: [{ label: "Sign in", href: "/auth/login" }],
    log: (line) => logs.push(line),
    now: () => clock.now
  };
  const surface = createAuthorizationSurface(deps);
  const call = async (request: AuthorizationRequest): Promise<AuthorizationResponse> => {
    const response = await surface.handle(request);
    if (response === undefined) throw new Error(`no route for ${request.path}`);
    return response;
  };
  return { deps, store, logs, call };
}

function authorizeQuery(client: string): Record<string, string> {
  return {
    response_type: "code",
    client_id: client,
    redirect_uri: REDIRECT,
    state: "state-1",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE
  };
}

function decisionToken(page: AuthorizationResponse): string {
  const value = /name="request" value="([^"]+)"/.exec(page.body)?.[1];
  if (value === undefined) throw new Error("the page carries no decision token");
  return value;
}

describe("the node adapter", () => {
  it("the core needs no server, and the node adapter adds no behavior", async () => {
    const h = harness();
    const created = await h.store.ensurePrincipal("person:one", "Person One");
    const person = { principalId: created.id, label: "Person One" };
    const key = await h.store.createKey(person.principalId, "ops");
    const handler = createAuthorizationHttpHandler(h.deps, async (req) =>
      req.headers.cookie === "session=ok" ? person : undefined
    );
    const server = createServer((req, res) => {
      void handler(req, res).then((handled) => {
        if (!handled) res.writeHead(404).end("not ours");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const compare = async (core: AuthorizationRequest, init: RequestInit & { path: string }) => {
        const expected = await h.call(core);
        const actual = await fetch(`${base}${init.path}`, { redirect: "manual", ...init });
        expect(actual.status, init.path).toBe(expected.status);
        for (const [name, value] of Object.entries(expected.headers)) {
          expect(actual.headers.get(name), `${init.path} ${name}`).toBe(value);
        }
        return { expected, text: await actual.text() };
      };

      const metadata = await compare(
        { method: "GET", path: AUTHORIZATION_PATHS.metadata },
        { path: AUTHORIZATION_PATHS.metadata }
      );
      expect(metadata.text).toBe(metadata.expected.body);

      const registration = { client_name: "Claude", redirect_uris: [REDIRECT] };
      const registered = await compare(
        { method: "POST", path: AUTHORIZATION_PATHS.register, json: registration },
        {
          path: AUTHORIZATION_PATHS.register,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(registration)
        }
      );
      // Same clock, same secret: the sealed client id is the same value.
      expect(registered.text).toBe(registered.expected.body);
      const id = String((JSON.parse(registered.text) as { client_id: string }).client_id);

      const query = new URLSearchParams(authorizeQuery(id)).toString();
      const unsigned = await compare(
        { method: "GET", path: AUTHORIZATION_PATHS.authorize, query: authorizeQuery(id) },
        { path: `${AUTHORIZATION_PATHS.authorize}?${query}` }
      );
      expect(unsigned.text).toBe(unsigned.expected.body);
      const consent = await compare(
        { method: "GET", path: AUTHORIZATION_PATHS.authorize, query: authorizeQuery(id), principal: person },
        { path: `${AUTHORIZATION_PATHS.authorize}?${query}`, headers: { cookie: "session=ok" } }
      );
      expect(consent.text).toBe(consent.expected.body);

      const token = decisionToken(consent.expected);
      const denied = await compare(
        { method: "POST", path: AUTHORIZATION_PATHS.decision, form: { request: token, action: "deny" }, principal: person },
        {
          path: AUTHORIZATION_PATHS.decision,
          method: "POST",
          headers: { cookie: "session=ok", "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ request: token, action: "deny" }).toString()
        }
      );
      expect(denied.expected.status).toBe(302);

      const badToken = { grant_type: "refresh_token", client_id: id, refresh_token: "nope" };
      const refused = await compare(
        { method: "POST", path: AUTHORIZATION_PATHS.token, form: badToken },
        {
          path: AUTHORIZATION_PATHS.token,
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(badToken).toString()
        }
      );
      expect(refused.text).toBe(refused.expected.body);
      const revoked = await compare(
        { method: "POST", path: AUTHORIZATION_PATHS.revoke, form: { token: "nope" } },
        {
          path: AUTHORIZATION_PATHS.revoke,
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "token=nope"
        }
      );
      expect(revoked.text).toBe("{}");

      // A full approve through the adapter ends in a working token.
      const approved = await fetch(`${base}${AUTHORIZATION_PATHS.decision}`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie: "session=ok", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ request: token, action: "approve", key: key.entry.id }).toString()
      });
      const code = new URL(approved.headers.get("location") ?? "").searchParams.get("code") ?? "";
      const issued = await fetch(`${base}${AUTHORIZATION_PATHS.token}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: id }).toString()
      });
      const body = (await issued.json()) as { access_token: string };
      expect((await h.store.resolveAccessToken(body.access_token, { resource: RESOURCE }))?.id).toBe(person.principalId);

      // Another path is not the surface's.
      expect((await fetch(`${base}/elsewhere`)).status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("a failing host callback is answered by the surface and never escapes", async () => {
    const h = harness();
    const handler = createAuthorizationHttpHandler(h.deps, async () => {
      throw new Error("session store unreachable at 10.1.2.3");
    });
    const server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}${AUTHORIZATION_PATHS.authorize}?client_id=x`
      );
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).not.toContain("10.1.2.3");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(h.logs.join("\n")).toContain("session store unreachable");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
