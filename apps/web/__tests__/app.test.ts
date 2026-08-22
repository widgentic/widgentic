// @vitest-environment node
/**
 * End to end over real HTTP: sign in (stubbed issuer via the auth
 * module's own callback flow), save a widget and a theme through the
 * router, then prove the design-is-publish loop — the entries appear in
 * THAT principal's composed catalog/registry and in nobody else's.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeCatalog, composeThemes, createMemoryStore } from "widgentic/store";
import type { MemoryStore } from "widgentic/store";
import { createWebAppHandler } from "../app.js";
import { createAuth } from "../auth.js";

const ISSUER = "https://widgentictest.ciamlogin.com/tid/v2.0";
const CLIENT_ID = "app-e2e";
const REDIRECT = "http://localhost/auth/callback";
const KID = "e2e-key";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function mintIdToken(sub: string, name: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const payload = { iss: ISSUER, aud: CLIENT_ID, exp: nowSec + 3600, sub, name };
  const signed = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${signed}.${b64url(sign("RSA-SHA256", Buffer.from(signed, "utf8"), privateKey))}`;
}

/** The issuer, as far as the app can tell. Each token exchange mints for
 *  whichever subject the test set as "next". */
let nextSubject = { sub: "sub-alice", name: "Alice" };
const issuerFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.endsWith("/.well-known/openid-configuration")) {
    return Response.json({
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/keys`
    });
  }
  if (url === `${ISSUER}/keys`) {
    return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID }] });
  }
  if (url === `${ISSUER}/token`) {
    return Response.json({ id_token: mintIdToken(nextSubject.sub, nextSubject.name) });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

let server: Server;
let base: string;
let store: MemoryStore;

beforeAll(async () => {
  store = createMemoryStore();
  const auth = createAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    sessionSecret: "e".repeat(64),
    fetchImpl: issuerFetch
  });
  const handle = createWebAppHandler({
    store,
    auth,
    assets: { "/": { body: "<!doctype html>shell", contentType: "text/html" } },
    log: () => {}
  });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  base = `http://localhost:${typeof address === "object" && address !== null ? address.port : 0}`;
});

afterAll(() => server.close());

/** Run the full login flow for a subject; returns the session cookie. */
async function signIn(sub: string, name: string): Promise<string> {
  nextSubject = { sub, name };
  const login = await fetch(`${base}/auth/login`, { redirect: "manual" });
  expect(login.status).toBe(302);
  const flowCookie = (login.headers.get("set-cookie") ?? "").split(";")[0] as string;
  const state = new URL(login.headers.get("location") as string).searchParams.get("state");
  const callback = await fetch(
    `${base}/auth/callback?code=e2e-code&state=${state}`,
    { redirect: "manual", headers: { cookie: flowCookie } }
  );
  expect(callback.status).toBe(302);
  return (callback.headers.get("set-cookie") ?? "").split(";")[0] as string;
}

describe("design-it-is-publish, end to end", () => {
  it("a widget and theme saved in the app appear in that principal's catalog only", async () => {
    const alice = await signIn("sub-alice", "Alice");

    // Save a widget and a theme through the authoring API.
    const putWidget = await fetch(`${base}/api/widgets/scorecard`, {
      method: "PUT",
      headers: { cookie: alice },
      body: JSON.stringify({
        template: { tag: "div", children: [{ bind: "score" }] },
        descriptor: { description: "a scorecard", dataShape: "{ score }" }
      })
    });
    expect(putWidget.status).toBe(200);
    const putTheme = await fetch(`${base}/api/themes/alice-brand`, {
      method: "PUT",
      headers: { cookie: alice },
      body: JSON.stringify({ tokens: { accent: "#ff2266" } })
    });
    expect(putTheme.status).toBe(200);

    // The MCP edge's view: compose for Alice's principal.
    const me = (await (
      await fetch(`${base}/api/me`, { headers: { cookie: alice } })
    ).json()) as { principal: { id: string; label: string } };
    expect(me.principal.label).toBe("Alice");

    const catalog = await composeCatalog(store, me.principal.id);
    const themes = await composeThemes(store, me.principal.id);
    expect(catalog.value.list().map((d) => d.kind)).toContain("scorecard");
    expect(themes.value.list().map((t) => t.name)).toContain("alice-brand");

    // A different sign-in gets a different principal — and none of it.
    const bob = await signIn("sub-bob", "Bob");
    const bobMe = (await (
      await fetch(`${base}/api/me`, { headers: { cookie: bob } })
    ).json()) as { principal: { id: string } };
    expect(bobMe.principal.id).not.toBe(me.principal.id);

    const bobCatalog = await composeCatalog(store, bobMe.principal.id);
    const bobThemes = await composeThemes(store, bobMe.principal.id);
    expect(bobCatalog.value.list().map((d) => d.kind)).not.toContain("scorecard");
    expect(bobThemes.value.list().map((t) => t.name)).not.toContain("alice-brand");
  });

  it("a key created in the app resolves at the store port; revoked stops resolving", async () => {
    const alice = await signIn("sub-alice", "Alice");
    const created = await fetch(`${base}/api/keys`, {
      method: "POST",
      headers: { cookie: alice },
      body: JSON.stringify({ name: "e2e" })
    });
    const { key, entry } = (await created.json()) as { key: string; entry: { id: string } };
    expect((await store.resolvePrincipal(key))?.label).toBe("Alice");

    await fetch(`${base}/api/keys/${entry.id}`, {
      method: "DELETE",
      headers: { cookie: alice }
    });
    expect(await store.resolvePrincipal(key)).toBeUndefined();
  });

  it("the health endpoint answers without auth; unknown paths 404", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});

describe("account linking, end to end", () => {
  /** Begin a link flow as the given session; returns flow cookie + state. */
  async function beginLink(sessionCookie: string): Promise<{ flow: string; state: string }> {
    const begin = await fetch(`${base}/auth/link/email`, {
      redirect: "manual",
      headers: { cookie: sessionCookie }
    });
    expect(begin.status).toBe(302);
    const flow = (begin.headers.get("set-cookie") ?? "").split(";")[0] as string;
    const state = new URL(begin.headers.get("location") as string).searchParams.get(
      "state"
    ) as string;
    return { flow, state };
  }

  it("links a second identity into the same account, shared both ways", async () => {
    const owner = await signIn("sub-link-owner", "Owner");
    await fetch(`${base}/api/widgets/link-proof`, {
      method: "PUT",
      headers: { cookie: owner, "content-type": "application/json" },
      body: JSON.stringify({
        template: { tag: "div", children: [{ bind: "t" }] },
        descriptor: { description: "d", dataShape: "{ t }" }
      })
    });

    const { flow, state } = await beginLink(owner);
    nextSubject = { sub: "sub-link-second", name: "Second" };
    const callback = await fetch(`${base}/auth/callback?code=e2e-code&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `${flow}; ${owner}` }
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/?linked=1");
    // linking never mints a session
    expect(callback.headers.get("set-cookie")).toBeNull();

    // the linked identity lands in the same principal with the same widgets
    const second = await signIn("sub-link-second", "Second");
    const widgets = (await (
      await fetch(`${base}/api/widgets`, { headers: { cookie: second } })
    ).json()) as { widgets: { kind: string }[] };
    expect(widgets.widgets.map((w) => w.kind)).toContain("link-proof");

    const identities = (await (
      await fetch(`${base}/api/identities`, { headers: { cookie: owner } })
    ).json()) as {
      current: string;
      currentIsPrimary: boolean;
      primary: { subject: string };
      linked: { subject: string; label?: string }[];
    };
    expect(identities.currentIsPrimary).toBe(true);
    expect(identities.primary.subject).toBe("sub-link-owner");
    expect(identities.linked.map((l) => l.subject)).toContain("sub-link-second");
    // the OIDC display name rode the link as the identity label
    expect(identities.linked.find((l) => l.subject === "sub-link-second")?.label).toBe("Second");

    // the linked side sees the whole account too, primary included
    const fromLinked = (await (
      await fetch(`${base}/api/identities`, { headers: { cookie: second } })
    ).json()) as { currentIsPrimary: boolean; primary: { subject: string } };
    expect(fromLinked.currentIsPrimary).toBe(false);
    expect(fromLinked.primary.subject).toBe("sub-link-owner");
  });

  it("a link callback with a changed or missing session creates no link", async () => {
    const owner = await signIn("sub-forge-owner", "Owner");
    const mallory = await signIn("sub-forge-mallory", "Mallory");

    // owner's sealed intent + mallory's session: refused
    const first = await beginLink(owner);
    nextSubject = { sub: "sub-forge-new", name: "New" };
    const swapped = await fetch(`${base}/auth/callback?code=e2e-code&state=${first.state}`, {
      redirect: "manual",
      headers: { cookie: `${first.flow}; ${mallory}` }
    });
    expect(swapped.status).toBe(401);

    // owner's sealed intent + no session at all: refused
    const second = await beginLink(owner);
    const bare = await fetch(`${base}/auth/callback?code=e2e-code&state=${second.state}`, {
      redirect: "manual",
      headers: { cookie: second.flow }
    });
    expect(bare.status).toBe(401);

    // and the would-be subject never linked anywhere
    const fresh = await signIn("sub-forge-new", "New");
    const me = (await (
      await fetch(`${base}/api/me`, { headers: { cookie: fresh } })
    ).json()) as { principal: { id: string } };
    const ownerMe = (await (
      await fetch(`${base}/api/me`, { headers: { cookie: owner } })
    ).json()) as { principal: { id: string } };
    expect(me.principal.id).not.toBe(ownerMe.principal.id);
  });

  it("a conflict redirects with the refusal code and changes nothing", async () => {
    const owner = await signIn("sub-conf-owner", "Owner");
    const taken = await signIn("sub-conf-taken", "Taken");
    await fetch(`${base}/api/widgets/mine`, {
      method: "PUT",
      headers: { cookie: taken, "content-type": "application/json" },
      body: JSON.stringify({
        template: { tag: "div", children: [{ bind: "t" }] },
        descriptor: { description: "d", dataShape: "{ t }" }
      })
    });

    const { flow, state } = await beginLink(owner);
    nextSubject = { sub: "sub-conf-taken", name: "Taken" };
    const callback = await fetch(`${base}/auth/callback?code=e2e-code&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `${flow}; ${owner}` }
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/?link_error=SUBJECT_IN_USE");
    // the taken account is untouched
    const widgets = (await (
      await fetch(`${base}/api/widgets`, { headers: { cookie: taken } })
    ).json()) as { widgets: { kind: string }[] };
    expect(widgets.widgets.map((w) => w.kind)).toEqual(["mine"]);
  });

  it("unlink detaches; the primary refuses", async () => {
    const owner = await signIn("sub-unlink-owner", "Owner");
    const { flow, state } = await beginLink(owner);
    nextSubject = { sub: "sub-unlink-second", name: "Second" };
    await fetch(`${base}/auth/callback?code=e2e-code&state=${state}`, {
      redirect: "manual",
      headers: { cookie: `${flow}; ${owner}` }
    });

    const unlink = await fetch(`${base}/api/identities`, {
      method: "DELETE",
      headers: { cookie: owner, "content-type": "application/json" },
      body: JSON.stringify({ subject: "sub-unlink-second" })
    });
    expect(unlink.status).toBe(200);

    const fresh = await signIn("sub-unlink-second", "Second");
    const me = (await (
      await fetch(`${base}/api/me`, { headers: { cookie: fresh } })
    ).json()) as { principal: { id: string } };
    const ownerMe = (await (
      await fetch(`${base}/api/me`, { headers: { cookie: owner } })
    ).json()) as { principal: { id: string } };
    expect(me.principal.id).not.toBe(ownerMe.principal.id);

    const primary = await fetch(`${base}/api/identities`, {
      method: "DELETE",
      headers: { cookie: owner, "content-type": "application/json" },
      body: JSON.stringify({ subject: "sub-unlink-owner" })
    });
    expect(primary.status).toBe(422);
    expect(
      ((await primary.json()) as { error: { code: string } }).error.code
    ).toBe("CANNOT_UNLINK_PRIMARY");
  });
});
