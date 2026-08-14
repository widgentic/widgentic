/**
 * Sign-in for the widgentic.dev app: OIDC authorization-code flow with
 * PKCE against Entra External ID for email, plus a first-party GitHub
 * OAuth code flow (External ID cannot federate GitHub — design D4
 * revised). Both methods seal the same session cookie and land on the
 * same principal model with namespaced subjects.
 *
 * Zero new runtime dependencies — JWTs are verified with node:crypto
 * (RS256 over the issuer's JWKS, fetched and cached), and sessions are
 * this server's own HMAC-signed cookie, not the raw ID token.
 *
 * Trust rules:
 *   - Every ID token is checked: issuer, audience, signature, expiry,
 *     not-before. Any failure is a refusal, never a downgrade.
 *   - The session cookie is httpOnly + Secure + SameSite=Lax and carries
 *     only { sub, label, exp } — no tokens, no key material.
 *   - Passwords never exist here; the issuer owns credentials.
 */
import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as cryptoVerify
} from "node:crypto";

function sha256(text: string): Buffer {
  return createHash("sha256").update(text, "utf8").digest();
}

export interface GitHubOptions {
  clientId: string;
  /** GitHub OAuth apps require the secret at code exchange (no PKCE). */
  clientSecret: string;
  /** Callback URL registered on the GitHub OAuth app (…/auth/github/callback). */
  redirectUri: string;
}

export interface AuthOptions {
  /** Issuer URL, e.g. https://<tenant>.ciamlogin.com/<tenant-id>/v2.0 */
  issuer: string;
  clientId: string;
  redirectUri: string;
  /**
   * Direct GitHub sign-in (design D4 revised): External ID cannot
   * federate GitHub, so the app runs GitHub's OAuth code flow itself.
   * Subjects are namespaced `github:<id>`; the access token is used for
   * one identity read and never stored.
   */
  github?: GitHubOptions;
  /**
   * Confidential-client secret. Optional: a public client with PKCE
   * needs none, which keeps configuration secret-free.
   */
  clientSecret?: string;
  /** HMAC secret for session cookies; generated per boot when absent. */
  sessionSecret?: string;
  /** Session lifetime in seconds (default 8 hours). */
  sessionTtlSeconds?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected clock for tests; epoch seconds. */
  now?: () => number;
}

export interface SessionClaims {
  subject: string;
  label?: string;
}

export interface AuthCallbackResult {
  session: SessionClaims;
  /** Value for a Set-Cookie header establishing the session. */
  setCookie: string;
}

interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}

const SESSION_COOKIE = "wg_session";
const FLOW_COOKIE = "wg_auth_flow";

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function fromB64url(text: string): Buffer {
  return Buffer.from(text, "base64url");
}

/** HMAC-sign a JSON payload into `payload.mac` cookie format. */
function sealToken(payload: unknown, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function openToken(token: string, secret: string): unknown {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest();
  const presented = fromB64url(mac);
  if (presented.length !== expected.length) return undefined;
  if (!timingSafeEqual(presented, expected)) return undefined;
  try {
    return JSON.parse(fromB64url(body).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export class AuthError extends Error {
  constructor(public readonly reason: string) {
    super(`auth refused: ${reason}`);
    this.name = "AuthError";
  }
}

export interface Auth {
  /** Build the redirect to the issuer plus the flow cookie to set. */
  beginLogin(): { location: string; setCookie: string };
  /** Redeem the callback; throws AuthError on any validation failure. */
  handleCallback(callbackUrl: URL, cookieHeader: string | undefined): Promise<AuthCallbackResult>;
  /** GitHub: build the authorize redirect. Throws when not configured. */
  beginGitHubLogin(): { location: string; setCookie: string };
  /** GitHub: redeem the callback; throws AuthError on any failure. */
  handleGitHubCallback(
    callbackUrl: URL,
    cookieHeader: string | undefined
  ): Promise<AuthCallbackResult>;
  /** Read and verify the session cookie; undefined when absent/invalid. */
  readSession(cookieHeader: string | undefined): SessionClaims | undefined;
  /** A Set-Cookie value that clears the session. */
  logoutCookie(): string;
  /**
   * Seal a session directly (no issuer round trip). Exists for the
   * explicit dev-login harness and for tests — production sign-in always
   * goes through handleCallback's validated token.
   */
  mintSession(claims: SessionClaims): string;
  /** Exposed for tests: full ID-token validation. */
  validateIdToken(idToken: string): Promise<{ sub: string; name?: string }>;
}

export function createAuth(options: AuthOptions): Auth {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const sessionSecret = options.sessionSecret ?? randomBytes(32).toString("hex");
  const sessionTtl = options.sessionTtlSeconds ?? 8 * 60 * 60;

  let metadataCache: OidcMetadata | undefined;
  let jwksCache: { keys: Jwk[]; fetchedAt: number } | undefined;

  async function metadata(): Promise<OidcMetadata> {
    if (metadataCache !== undefined) return metadataCache;
    const url = `${options.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const response = await fetchImpl(url);
    if (!response.ok) throw new AuthError(`issuer metadata unavailable (${response.status})`);
    metadataCache = (await response.json()) as OidcMetadata;
    return metadataCache;
  }

  async function jwks(forceRefresh = false): Promise<Jwk[]> {
    const fresh =
      jwksCache !== undefined && !forceRefresh && now() - jwksCache.fetchedAt < 3600;
    if (fresh) return (jwksCache as { keys: Jwk[] }).keys;
    const meta = await metadata();
    const response = await fetchImpl(meta.jwks_uri);
    if (!response.ok) throw new AuthError(`jwks unavailable (${response.status})`);
    const body = (await response.json()) as { keys: Jwk[] };
    jwksCache = { keys: body.keys, fetchedAt: now() };
    return body.keys;
  }

  async function validateIdToken(idToken: string): Promise<{ sub: string; name?: string }> {
    if (typeof idToken !== "string") throw new AuthError("malformed token");
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new AuthError("malformed token");
    const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

    let header: { alg?: string; kid?: string };
    let payload: {
      iss?: string;
      aud?: string | string[];
      exp?: number;
      nbf?: number;
      sub?: string;
      name?: string;
    };
    try {
      header = JSON.parse(fromB64url(rawHeader).toString("utf8")) as typeof header;
      payload = JSON.parse(fromB64url(rawPayload).toString("utf8")) as typeof payload;
    } catch {
      throw new AuthError("malformed token");
    }

    if (header.alg !== "RS256") throw new AuthError(`unsupported alg ${String(header.alg)}`);
    if (payload.iss !== options.issuer) throw new AuthError("wrong issuer");
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(options.clientId)) throw new AuthError("wrong audience");
    const at = now();
    if (typeof payload.exp !== "number" || payload.exp <= at) throw new AuthError("expired");
    if (typeof payload.nbf === "number" && payload.nbf > at + 60) {
      throw new AuthError("not yet valid");
    }
    if (typeof payload.sub !== "string" || payload.sub === "") {
      throw new AuthError("missing subject");
    }

    // Signature over header.payload with the key named by kid — with one
    // forced JWKS refresh on miss, covering issuer key rotation.
    const signed = Buffer.from(`${rawHeader}.${rawPayload}`, "utf8");
    const signature = fromB64url(rawSignature);
    for (const refresh of [false, true]) {
      const keys = await jwks(refresh);
      const jwk = keys.find((k) => k.kid === header.kid && k.kty === "RSA");
      if (jwk === undefined) continue;
      const key = createPublicKey({ key: jwk as never, format: "jwk" });
      if (cryptoVerify("RSA-SHA256", signed, key, signature)) {
        return {
          sub: payload.sub,
          ...(typeof payload.name === "string" ? { name: payload.name } : {})
        };
      }
      throw new AuthError("bad signature");
    }
    throw new AuthError("unknown signing key");
  }

  function sessionCookieValue(claims: SessionClaims): string {
    const sealed = sealToken(
      { sub: claims.subject, label: claims.label, exp: now() + sessionTtl },
      sessionSecret
    );
    return (
      `${SESSION_COOKIE}=${sealed}; Path=/; Max-Age=${sessionTtl}; ` +
      "HttpOnly; Secure; SameSite=Lax"
    );
  }

  return {
    beginLogin() {
      const state = randomBytes(16).toString("hex");
      const verifier = randomBytes(32).toString("base64url");
      const challenge = b64url(sha256(verifier));
      const flow = sealToken({ state, verifier, exp: now() + 600 }, sessionSecret);
      const query = new URLSearchParams({
        client_id: options.clientId,
        response_type: "code",
        redirect_uri: options.redirectUri,
        response_mode: "query",
        scope: "openid profile email",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
      });
      // The authorization endpoint comes from cached metadata when we
      // have it; otherwise the conventional path keeps beginLogin sync.
      const base =
        metadataCache?.authorization_endpoint ??
        `${options.issuer.replace(/\/v2\.0$/, "")}/oauth2/v2.0/authorize`;
      return {
        location: `${base}?${query.toString()}`,
        setCookie:
          `${FLOW_COOKIE}=${flow}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
      };
    },

    async handleCallback(callbackUrl, cookieHeader) {
      const code = callbackUrl.searchParams.get("code");
      const state = callbackUrl.searchParams.get("state");
      if (code === null || state === null) throw new AuthError("missing code or state");
      const flowRaw = readCookie(cookieHeader, FLOW_COOKIE);
      if (flowRaw === undefined) throw new AuthError("missing flow cookie");
      const flow = openToken(flowRaw, sessionSecret) as
        | { state: string; verifier: string; exp: number; provider?: string }
        | undefined;
      if (flow === undefined || flow.exp <= now()) throw new AuthError("stale flow");
      if (flow.provider !== undefined) throw new AuthError("wrong flow");
      if (flow.state !== state) throw new AuthError("state mismatch");

      const meta = await metadata();
      const form = new URLSearchParams({
        client_id: options.clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: options.redirectUri,
        code_verifier: flow.verifier
      });
      if (options.clientSecret !== undefined) form.set("client_secret", options.clientSecret);
      const response = await fetchImpl(meta.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString()
      });
      if (!response.ok) {
        // Failed-exchange bodies carry only the issuer's error code and
        // description — no tokens — and the AADSTS code is the difference
        // between a fixable config issue and a mystery.
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        throw new AuthError(`token exchange failed (${response.status}): ${detail}`);
      }
      const tokens = (await response.json()) as { id_token?: string };
      if (typeof tokens.id_token !== "string") throw new AuthError("no id_token");

      const claims = await validateIdToken(tokens.id_token);
      const session: SessionClaims = {
        subject: claims.sub,
        ...(claims.name === undefined ? {} : { label: claims.name })
      };
      return { session, setCookie: sessionCookieValue(session) };
    },

    beginGitHubLogin() {
      const github = options.github;
      if (github === undefined) throw new AuthError("github sign-in not configured");
      const state = randomBytes(16).toString("hex");
      const flow = sealToken({ state, provider: "github", exp: now() + 600 }, sessionSecret);
      const query = new URLSearchParams({
        client_id: github.clientId,
        redirect_uri: github.redirectUri,
        scope: "read:user",
        state
      });
      return {
        location: `https://github.com/login/oauth/authorize?${query.toString()}`,
        setCookie:
          `${FLOW_COOKIE}=${flow}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
      };
    },

    async handleGitHubCallback(callbackUrl, cookieHeader) {
      const github = options.github;
      if (github === undefined) throw new AuthError("github sign-in not configured");
      const code = callbackUrl.searchParams.get("code");
      const state = callbackUrl.searchParams.get("state");
      if (code === null || state === null) throw new AuthError("missing code or state");
      const flowRaw = readCookie(cookieHeader, FLOW_COOKIE);
      if (flowRaw === undefined) throw new AuthError("missing flow cookie");
      const flow = openToken(flowRaw, sessionSecret) as
        | { state: string; provider?: string; exp: number }
        | undefined;
      if (flow === undefined || flow.exp <= now()) throw new AuthError("stale flow");
      if (flow.provider !== "github") throw new AuthError("wrong flow");
      if (flow.state !== state) throw new AuthError("state mismatch");

      const exchange = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json"
        },
        body: new URLSearchParams({
          client_id: github.clientId,
          client_secret: github.clientSecret,
          code,
          redirect_uri: github.redirectUri
        }).toString()
      });
      if (!exchange.ok) {
        const detail = (await exchange.text().catch(() => "")).slice(0, 300);
        throw new AuthError(`github token exchange failed (${exchange.status}): ${detail}`);
      }
      const tokens = (await exchange.json()) as { access_token?: string };
      if (typeof tokens.access_token !== "string" || tokens.access_token === "") {
        throw new AuthError("no github access token");
      }

      // One identity read; the token is dropped on the floor afterwards.
      const userResponse = await fetchImpl("https://api.github.com/user", {
        headers: {
          authorization: `Bearer ${tokens.access_token}`,
          accept: "application/vnd.github+json",
          "user-agent": "widgentic-app"
        }
      });
      if (!userResponse.ok) throw new AuthError(`github user read failed (${userResponse.status})`);
      const user = (await userResponse.json()) as {
        id?: number;
        login?: string;
        name?: string | null;
      };
      if (typeof user.id !== "number") throw new AuthError("github user has no id");

      const label =
        typeof user.name === "string" && user.name !== "" ? user.name : user.login;
      const session: SessionClaims = {
        // The numeric id is the stable identity; logins can be renamed.
        subject: `github:${user.id}`,
        ...(label === undefined ? {} : { label })
      };
      return { session, setCookie: sessionCookieValue(session) };
    },

    readSession(cookieHeader) {
      const raw = readCookie(cookieHeader, SESSION_COOKIE);
      if (raw === undefined) return undefined;
      const opened = openToken(raw, sessionSecret) as
        | { sub: string; label?: string; exp: number }
        | undefined;
      if (opened === undefined) return undefined;
      if (typeof opened.exp !== "number" || opened.exp <= now()) return undefined;
      if (typeof opened.sub !== "string" || opened.sub === "") return undefined;
      return {
        subject: opened.sub,
        ...(opened.label === undefined ? {} : { label: opened.label })
      };
    },

    logoutCookie() {
      return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    },

    mintSession(claims) {
      return sessionCookieValue(claims);
    },

    validateIdToken
  };
}

