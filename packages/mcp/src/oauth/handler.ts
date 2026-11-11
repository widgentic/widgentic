/**
 * The authorization surface: metadata, client registration, the authorize
 * and consent step, the token endpoint and revocation, as one function over
 * decoded requests. It stores nothing an unauthenticated visitor causes —
 * client ids, decision tokens and anonymous codes are sealed, not saved —
 * and it never learns who a person is: the host says who is signed in.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isPlainObject } from "@widgentic/core";
import { errorMessage } from "../internal.js";
import { AUTHORIZATION_CODE_SECONDS, generateAnonymousToken, StoreRejectionError } from "../store/index.js";
import type { IssuedTokens, Scope } from "../store/index.js";
import { clientKey, redirectMatches, registerClient, resolveClient } from "./clients.js";
import { defaultPage, pageResponse } from "./pages.js";
import { OAUTH_SCOPES } from "./resource.js";
import { open, seal } from "./seal.js";
import type { AuthorizationDeps, AuthorizationPage, AuthorizationRequest, AuthorizationResponse, SignedInPrincipal } from "./types.js";

/** The routes, on the issuer's origin. */
export const AUTHORIZATION_PATHS = {
  metadata: "/.well-known/oauth-authorization-server",
  register: "/oauth/register",
  authorize: "/oauth/authorize",
  decision: "/oauth/authorize/decision",
  token: "/oauth/token",
  revoke: "/oauth/revoke"
} as const;

/** How long a consent page stays answerable. */
export const DECISION_SECONDS = 600;
/** Marks an authorization code issued for the anonymous choice: sealed, never stored. */
export const ANONYMOUS_CODE_PREFIX = "wgx_";
const MIN_SECRET_LENGTH = 32;
const PKCE_VALUE = /^[A-Za-z0-9._~-]{43,128}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
} as const;
const CORS_ROUTES: readonly string[] = [
  AUTHORIZATION_PATHS.metadata,
  AUTHORIZATION_PATHS.register,
  AUTHORIZATION_PATHS.token,
  AUTHORIZATION_PATHS.revoke
];

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  client_id_metadata_document_supported: boolean;
  authorization_response_iss_parameter_supported: boolean;
}

/** The RFC 8414 document, every value derived from the issuer and the routes. */
export function authorizationServerMetadata(issuer: string): AuthorizationServerMetadata {
  return {
    issuer,
    authorization_endpoint: `${issuer}${AUTHORIZATION_PATHS.authorize}`,
    token_endpoint: `${issuer}${AUTHORIZATION_PATHS.token}`,
    registration_endpoint: `${issuer}${AUTHORIZATION_PATHS.register}`,
    revocation_endpoint: `${issuer}${AUTHORIZATION_PATHS.revoke}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...OAUTH_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true
  };
}

export interface AuthorizationSurface {
  /** Answer a request, or `undefined` when the path is not one of the surface's. */
  handle(request: AuthorizationRequest): Promise<AuthorizationResponse | undefined>;
  /** Whether `path` is one of the surface's routes. */
  owns(path: string): boolean;
  /** Whether the route needs the host to say who is signed in. */
  needsPrincipal(path: string): boolean;
  /** The surface's answer when the host itself failed before the request could be routed. */
  failure(path: string): AuthorizationResponse;
}

/** What a consent or sign-in page is answering, sealed into its form. */
interface Decision {
  /** The principal the page was served to; empty for an unsigned visitor. */
  p: string;
  /** Client key, client name, redirect URI, state, challenge, resource, requested scopes, expiry (ms). */
  k: string;
  n: string;
  r: string;
  s?: string;
  h: string;
  u: string;
  q?: Scope[];
  e: number;
}

interface AnonymousCode {
  k: string;
  r: string;
  h: string;
  e: number;
}

function isDecision(value: unknown): value is Decision {
  return (
    isPlainObject(value) &&
    typeof value.p === "string" &&
    typeof value.k === "string" &&
    typeof value.n === "string" &&
    typeof value.r === "string" &&
    typeof value.h === "string" &&
    typeof value.u === "string" &&
    typeof value.e === "number"
  );
}

function isAnonymousCode(value: unknown): value is AnonymousCode {
  return (
    isPlainObject(value) &&
    typeof value.k === "string" &&
    typeof value.r === "string" &&
    typeof value.h === "string" &&
    typeof value.e === "number"
  );
}

function redirectHost(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host === "" ? url.protocol : url.host;
  } catch {
    return uri;
  }
}

/** Does this verifier hash to that S256 challenge? */
function verifierMatches(verifier: string, challenge: string): boolean {
  if (!PKCE_VALUE.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier, "ascii").digest("base64url"), "ascii");
  const expected = Buffer.from(challenge, "ascii");
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

function requestedScopes(scope: string | undefined): Scope[] | undefined {
  if (scope === undefined) return undefined;
  const asked = scope.split(/\s+/).filter((entry) => entry !== "");
  return OAUTH_SCOPES.filter((known) => asked.some((entry) => entry === known));
}

export function createAuthorizationSurface(deps: AuthorizationDeps): AuthorizationSurface {
  const issuerUrl = new URL(deps.issuer);
  if (issuerUrl.pathname !== "/" || issuerUrl.search !== "" || issuerUrl.hash !== "") {
    throw new Error("widgentic oauth: the issuer must be an origin with no path, query or fragment.");
  }
  if (typeof deps.secret !== "string" || deps.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`widgentic oauth: the secret must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  const defaultResource = deps.resources[0];
  if (defaultResource === undefined) throw new Error("widgentic oauth: at least one resource is required.");
  const issuer = issuerUrl.origin;
  const secret = deps.secret;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.error(line));
  const render = (status: number, page: AuthorizationPage): AuthorizationResponse =>
    pageResponse(status, (deps.renderPage ?? defaultPage)(page));
  const metadata = JSON.stringify(authorizationServerMetadata(issuer));

  function json(status: number, body: unknown): AuthorizationResponse {
    return {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
      body: JSON.stringify(body)
    };
  }

  function oauthError(status: number, error: string, description: string): AuthorizationResponse {
    return json(status, { error, error_description: description });
  }

  function errorPage(status: number, title: string, message: string): AuthorizationResponse {
    return render(status, { kind: "error", title, message });
  }

  /** Back to the client, with `iss` so it can tell which server answered. */
  function redirect(uri: string, params: Record<string, string | undefined>): AuthorizationResponse {
    const target = new URL(uri);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) target.searchParams.set(name, value);
    }
    target.searchParams.set("iss", issuer);
    return { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" }, body: "" };
  }

  async function consentPage(decision: Decision, principal: SignedInPrincipal, problem?: string): Promise<AuthorizationResponse> {
    const keys = (await deps.store.listKeys(principal.principalId))
      .filter((key) => key.revokedAt === undefined)
      .map((key) => ({ id: key.id, name: key.name, scopes: [...key.scopes], digestPreview: key.digestPreview }));
    return render(problem === undefined ? 200 : 422, {
      kind: "consent",
      clientName: decision.n,
      redirectHost: redirectHost(decision.r),
      principalLabel: principal.label ?? "your account",
      keys,
      ...(decision.q === undefined ? {} : { requestedScopes: decision.q }),
      ...(problem === undefined ? {} : { problem }),
      decisionPath: AUTHORIZATION_PATHS.decision,
      decisionToken: seal(secret, "decision", decision)
    });
  }

  async function authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const query = request.query ?? {};
    const clientId = query.client_id;
    // Until the client and its redirect URI are trusted, nothing redirects.
    if (clientId === undefined || clientId === "") {
      return errorPage(400, "This request cannot be completed", "The application did not identify itself.");
    }
    const client = await resolveClient(secret, clientId, deps.fetchDeps);
    if (client === undefined) {
      return errorPage(400, "This request cannot be completed", "The application is not registered with this server.");
    }
    const presented = query.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (presented === undefined || !client.redirectUris.some((registered) => redirectMatches(registered, presented))) {
      return errorPage(400, "This request cannot be completed", "The application asked to return to an address it did not register.");
    }
    const state = query.state;
    const refuse = (error: string, description: string): AuthorizationResponse =>
      redirect(presented, { error, error_description: description, state });

    if (query.response_type !== "code") return refuse("unsupported_response_type", "Only the code response type is supported.");
    const challenge = query.code_challenge;
    if (challenge === undefined || query.code_challenge_method !== "S256" || !PKCE_VALUE.test(challenge)) {
      return refuse("invalid_request", "A code_challenge with code_challenge_method=S256 is required.");
    }
    const resource = query.resource ?? defaultResource;
    if (resource === undefined || !deps.resources.some((known) => known === resource)) {
      return refuse("invalid_target", "The requested resource is not served by this authorization server.");
    }
    const scopes = requestedScopes(query.scope);
    const decision: Decision = {
      p: request.principal?.principalId ?? "",
      k: clientKey(clientId),
      n: client.name,
      r: presented,
      ...(state === undefined ? {} : { s: state }),
      h: challenge,
      u: resource,
      ...(scopes === undefined ? {} : { q: scopes }),
      e: now() + DECISION_SECONDS * 1000
    };
    if (request.principal !== undefined) return consentPage(decision, request.principal);

    // The return address is this same request: a path and query on this origin.
    const returnTo = `${AUTHORIZATION_PATHS.authorize}?${new URLSearchParams(query).toString()}`;
    return render(200, {
      kind: "sign-in",
      clientName: client.name,
      redirectHost: redirectHost(presented),
      signIn: (deps.signIn ?? []).map((link) => ({
        label: link.label,
        href: `${link.href}${link.href.includes("?") ? "&" : "?"}return_to=${encodeURIComponent(returnTo)}`
      })),
      decisionPath: AUTHORIZATION_PATHS.decision,
      decisionToken: seal(secret, "decision", decision)
    });
  }

  async function decide(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const form = request.form ?? {};
    const decision = open(secret, "decision", form.request);
    if (!isDecision(decision) || !(decision.e > now())) {
      return errorPage(400, "This page has expired", "Go back to the application and connect again.");
    }
    const principal = request.principal;
    // The page answers only for whoever it was served to.
    if (decision.p !== "" && decision.p !== principal?.principalId) {
      return errorPage(400, "This page has expired", "You are no longer signed in as the account this page was shown to.");
    }
    const action = form.action;
    if (action === "deny") {
      return redirect(decision.r, { error: "access_denied", error_description: "The request was declined.", state: decision.s });
    }
    if (action === "anonymous" && decision.p === "") {
      const code: AnonymousCode = { k: decision.k, r: decision.r, h: decision.h, e: now() + AUTHORIZATION_CODE_SECONDS * 1000 };
      return redirect(decision.r, { code: `${ANONYMOUS_CODE_PREFIX}${seal(secret, "anonymous-code", code)}`, state: decision.s });
    }
    if (action !== "approve" || principal === undefined || decision.p === "") {
      return errorPage(400, "This request cannot be completed", "Sign in, then connect the application again.");
    }

    try {
      let keyId = form.key;
      if (keyId === undefined || keyId === "") return await consentPage(decision, principal, "Choose a key, or create one.");
      if (keyId === "new") {
        const extra = (form.execute === "on" ? ["execute"] : []).concat((form.scopes ?? "").split(/\s+/).filter((s) => s !== ""));
        // The raw key is dropped here: the application never needs it, and
        // an authorization window is no place to show a secret.
        const created = await deps.store.createKey(principal.principalId, form.name ?? "", ["read", ...extra] as readonly Scope[]);
        keyId = created.entry.id;
      }
      const code = await deps.store.createAuthorizationCode(principal.principalId, {
        keyId,
        clientId: decision.k,
        clientName: decision.n,
        resource: decision.u,
        redirectUri: decision.r,
        codeChallenge: decision.h,
        ...(decision.q === undefined ? {} : { scopes: decision.q })
      });
      return redirect(decision.r, { code, state: decision.s });
    } catch (error) {
      if (!(error instanceof StoreRejectionError)) throw error;
      const problem =
        error.code === "UNKNOWN_KEY"
          ? "That key is no longer available. Choose another, or create one."
          : error.code === "INVALID_KEY_NAME"
            ? "Give the new key a name."
            : error.code === "INVALID_SCOPES"
              ? "A key cannot hold that permission."
              : undefined;
      if (problem === undefined) throw error;
      return consentPage(decision, principal, problem);
    }
  }

  function tokenResponse(tokens: IssuedTokens): AuthorizationResponse {
    return json(200, {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scopes.join(" ")
    });
  }

  async function token(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const form = request.form;
    if (form === undefined) return oauthError(400, "invalid_request", "The body must be application/x-www-form-urlencoded.");
    const invalidGrant = (): AuthorizationResponse =>
      oauthError(400, "invalid_grant", "The code or refresh token is invalid, expired or already used.");
    const clientId = form.client_id;
    const grantType = form.grant_type;
    if (grantType !== "authorization_code" && grantType !== "refresh_token") {
      return oauthError(400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
    }
    if (clientId === undefined || clientId === "") return oauthError(400, "invalid_client", "client_id is required.");
    const key = clientKey(clientId);

    if (grantType === "refresh_token") {
      const refreshToken = form.refresh_token;
      if (refreshToken === undefined) return oauthError(400, "invalid_request", "refresh_token is required.");
      const rotation = await deps.store.rotateGrant(refreshToken, key);
      if (rotation.status === "issued") return tokenResponse(rotation.tokens);
      if (rotation.status === "replay") log("widgentic oauth: a rotated refresh token was replayed; the grant was ended.");
      return invalidGrant();
    }

    const code = form.code;
    const verifier = form.code_verifier;
    if (code === undefined || verifier === undefined) {
      return oauthError(400, "invalid_request", "code and code_verifier are required.");
    }
    const redirectUri = form.redirect_uri;
    const bound = (binding: { clientId: string; redirectUri: string; codeChallenge: string }): boolean =>
      binding.clientId === key &&
      (redirectUri === undefined || binding.redirectUri === redirectUri) &&
      verifierMatches(verifier, binding.codeChallenge);

    if (code.startsWith(ANONYMOUS_CODE_PREFIX)) {
      const anonymous = open(secret, "anonymous-code", code.slice(ANONYMOUS_CODE_PREFIX.length));
      if (!isAnonymousCode(anonymous) || !(anonymous.e > now())) return invalidGrant();
      if (!bound({ clientId: anonymous.k, redirectUri: anonymous.r, codeChallenge: anonymous.h })) return invalidGrant();
      // Worth what no credential is worth: nothing to store, nothing to refresh.
      return json(200, { access_token: generateAnonymousToken(), token_type: "Bearer", scope: "read" });
    }

    const exchange = await deps.store.exchangeAuthorizationCode(code, bound);
    if (exchange.status === "issued") return tokenResponse(exchange.tokens);
    if (exchange.status === "used") {
      // A code seen twice may have been stolen: end what the first use produced.
      await deps.store.revokeGrant(exchange.principalId, exchange.grantId);
      log("widgentic oauth: an authorization code was presented twice; its grant was ended.");
    }
    return invalidGrant();
  }

  async function route(request: AuthorizationRequest): Promise<AuthorizationResponse | undefined> {
    const { path } = request;
    const method = request.method.toUpperCase();
    const cors = CORS_ROUTES.includes(path);
    if (method === "OPTIONS") {
      return cors
        ? { status: 204, headers: { ...CORS }, body: "" }
        : { status: 405, headers: { Allow: path === AUTHORIZATION_PATHS.authorize ? "GET" : "POST" }, body: "" };
    }
    const allow = (expected: "GET" | "POST"): AuthorizationResponse | undefined =>
      method === expected ? undefined : { status: 405, headers: { Allow: expected, ...(cors ? CORS : {}) }, body: "" };

    if (path === AUTHORIZATION_PATHS.metadata) {
      return allow("GET") ?? { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS }, body: metadata };
    }
    if (path === AUTHORIZATION_PATHS.register) {
      const refused = allow("POST");
      if (refused !== undefined) return refused;
      const registration = registerClient(secret, request.json, Math.floor(now() / 1000));
      if (!registration.ok) return oauthError(400, registration.error, registration.description);
      return json(201, {
        client_id: registration.clientId,
        client_id_issued_at: registration.issuedAt,
        client_name: registration.client.name,
        redirect_uris: registration.client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      });
    }
    if (path === AUTHORIZATION_PATHS.authorize) return allow("GET") ?? authorize(request);
    if (path === AUTHORIZATION_PATHS.decision) return allow("POST") ?? decide(request);
    if (path === AUTHORIZATION_PATHS.token) return allow("POST") ?? token(request);
    if (path === AUTHORIZATION_PATHS.revoke) {
      const refused = allow("POST");
      if (refused !== undefined) return refused;
      const presented = request.form?.token;
      if (presented !== undefined) await deps.store.revokeGrantByToken(presented);
      // The same answer whether or not the token was known.
      return json(200, {});
    }
    return undefined;
  }

  const paths: readonly string[] = Object.values(AUTHORIZATION_PATHS);
  const needsPrincipal = (path: string): boolean =>
    path === AUTHORIZATION_PATHS.authorize || path === AUTHORIZATION_PATHS.decision;
  // Says nothing about what failed: a page for the browser routes, an OAuth error for the rest.
  const failure = (path: string): AuthorizationResponse =>
    needsPrincipal(path)
      ? errorPage(500, "Something went wrong", "The request could not be completed. Try connecting again.")
      : oauthError(500, "server_error", "The request could not be completed.");
  return {
    failure,
    owns: (path) => paths.includes(path),
    needsPrincipal,
    async handle(request) {
      try {
        return await route(request);
      } catch (error) {
        // The failure is the store's or the host's; its text may name
        // neither a token nor a code, but the client still learns nothing.
        log(`widgentic oauth: ${request.method} ${request.path} failed — ${errorMessage(error)}`);
        return failure(request.path);
      }
    }
  };
}
