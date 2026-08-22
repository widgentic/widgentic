// @vitest-environment node
/**
 * The auth boundary against a fake issuer: an RSA keypair generated
 * in-test signs ID tokens, and an injected fetch serves the OIDC
 * metadata, JWKS, and token endpoint. No network, no Entra tenant.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "widgentic/store";
import { AuthError, createAuth } from "../auth.js";

const ISSUER = "https://widgentictest.ciamlogin.com/tid/v2.0";
const CLIENT_ID = "client-under-test";
const REDIRECT = "https://widgentic.dev/auth/callback";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: rogueKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-key-1";

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

interface TokenOverrides {
  iss?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  sub?: string;
  name?: string;
  kid?: string;
  signWith?: typeof privateKey;
}

function mintIdToken(overrides: TokenOverrides = {}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: overrides.kid ?? KID };
  const payload = {
    iss: overrides.iss ?? ISSUER,
    aud: overrides.aud ?? CLIENT_ID,
    exp: overrides.exp ?? nowSec + 3600,
    nbf: overrides.nbf ?? nowSec - 60,
    sub: overrides.sub ?? "subject-1",
    ...(overrides.name === undefined ? {} : { name: overrides.name })
  };
  const signed = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signed, "utf8"),
    overrides.signWith ?? privateKey
  );
  return `${signed}.${b64url(signature)}`;
}

function fakeIssuerFetch(tokenResponse?: () => unknown): typeof fetch {
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID };
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json({
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/keys`
      });
    }
    if (url === `${ISSUER}/keys`) return Response.json({ keys: [jwk] });
    if (url === `${ISSUER}/token`) {
      return Response.json(tokenResponse?.() ?? { id_token: mintIdToken() });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function auth(tokenResponse?: () => unknown, now?: () => number) {
  return createAuth({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    sessionSecret: "s".repeat(64),
    fetchImpl: fakeIssuerFetch(tokenResponse),
    ...(now === undefined ? {} : { now })
  });
}

describe("ID token validation", () => {
  it("accepts a valid token and yields subject + name", async () => {
    const claims = await auth().validateIdToken(mintIdToken({ name: "Ada" }));
    expect(claims).toEqual({ sub: "subject-1", name: "Ada" });
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 10 }, /expired/],
    ["wrong issuer", { iss: "https://evil.example/v2.0" }, /wrong issuer/],
    ["wrong audience", { aud: "someone-else" }, /wrong audience/],
    ["unknown kid", { kid: "who-dis" }, /unknown signing key/],
    ["bad signature", { signWith: rogueKey }, /bad signature/]
  ] as const)("refuses a %s token", async (_label, overrides, message) => {
    await expect(auth().validateIdToken(mintIdToken(overrides))).rejects.toThrow(message);
  });

  it("refuses malformed tokens outright", async () => {
    const a = auth();
    for (const junk of ["", "abc", "a.b", "a.b.c", "!.!.!"]) {
      await expect(a.validateIdToken(junk)).rejects.toThrow(AuthError);
    }
  });
});

describe("login flow and sessions", () => {
  it("full round trip: begin → callback → session cookie reads back", async () => {
    const a = auth();
    const begin = a.beginLogin();
    const location = new URL(begin.location);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    const state = location.searchParams.get("state") as string;

    const callback = new URL(`${REDIRECT}?code=fake-code&state=${state}`);
    const result = await a.handleCallback(callback, begin.setCookie.split(";")[0]);
    expect(result.session!.subject).toBe("subject-1");
    expect(result.setCookie!).toContain("HttpOnly");
    expect(result.setCookie!).toContain("Secure");
    expect(result.setCookie!).toContain("SameSite=Lax");

    const read = a.readSession(result.setCookie!.split(";")[0]);
    expect(read?.subject).toBe("subject-1");
  });

  it("refuses a callback whose state does not match the flow cookie", async () => {
    const a = auth();
    const begin = a.beginLogin();
    const callback = new URL(`${REDIRECT}?code=fake-code&state=wrong`);
    await expect(
      a.handleCallback(callback, begin.setCookie.split(";")[0])
    ).rejects.toThrow(/state mismatch/);
  });

  it("session cookies expire and tampering invalidates them", async () => {
    let t = Math.floor(Date.now() / 1000);
    const a = auth(undefined, () => t);
    const begin = a.beginLogin();
    const state = new URL(begin.location).searchParams.get("state") as string;
    const { setCookie } = await a.handleCallback(
      new URL(`${REDIRECT}?code=c&state=${state}`),
      begin.setCookie.split(";")[0]
    );
    const cookie = setCookie!.split(";")[0] as string;
    expect(a.readSession(cookie)?.subject).toBe("subject-1");

    // Flip a character in the sealed payload: signature check fails.
    const tampered = cookie.replace("wg_session=", "");
    const flipped = `wg_session=${tampered.slice(0, 5)}${tampered[5] === "A" ? "B" : "A"}${tampered.slice(6)}`;
    expect(a.readSession(flipped)).toBeUndefined();

    // Advance past the TTL: the same cookie stops reading back.
    t += 9 * 60 * 60;
    expect(a.readSession(cookie)).toBeUndefined();
  });

  it("no cookie, foreign cookies, and garbage read as no session", () => {
    const a = auth();
    expect(a.readSession(undefined)).toBeUndefined();
    expect(a.readSession("other=1; unrelated=x")).toBeUndefined();
    expect(a.readSession("wg_session=garbage")).toBeUndefined();
  });
});

describe("subject → principal mapping", () => {
  it("repeat sign-ins land on the same principal, distinct subjects apart", async () => {
    const store = createMemoryStore();
    const first = await store.ensurePrincipal("subject-1", "Ada");
    const again = await store.ensurePrincipal("subject-1");
    const other = await store.ensurePrincipal("subject-2");
    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(first.id).toMatch(/^usr_[0-9a-f]{24}$/);
    // The raw subject never becomes the id.
    expect(first.id).not.toContain("subject-1");
  });
});
