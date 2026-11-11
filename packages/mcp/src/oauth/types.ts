/**
 * The authorization surface's contract with its host (mcp-authorization
 * spec). The surface begins where authentication ends: the host says who is
 * signed in — by session, by a trusted proxy header, or a fixed principal —
 * and the surface turns that into a grant bound to one of the person's API
 * keys. No session, cookie or identity-provider code lives on this side.
 */
import type { IncomingMessage } from "node:http";
import type { GuardedFetchDeps } from "../server/index.js";
import type { WritableAccessGrantStore } from "../store/index.js";
import type { WritableWidgetStore } from "../store/index.js";

/** The host's answer to "who is signed in" for an authorize or decision request. */
export interface SignedInPrincipal {
  principalId: string;
  /** How the person is shown to themselves on the consent page. */
  label?: string;
}

/** A way to sign in that the host offers; the surface appends the return address. */
export interface SignInLink {
  label: string;
  /**
   * The host's sign-in URL. The surface adds a `return_to` query parameter
   * holding the authorize request's path and query (same origin), which the
   * host must send the person back to once signed in.
   */
  href: string;
}

/** A decoded request: what the core routes on. No transport objects here. */
export interface AuthorizationRequest {
  method: string;
  /** Path on the issuer's origin, e.g. `/oauth/token`. */
  path: string;
  query?: Record<string, string>;
  /** A decoded `application/x-www-form-urlencoded` body. */
  form?: Record<string, string>;
  /** A parsed JSON body (client registration). */
  json?: unknown;
  /** Resolved by the host for the authorize and decision routes; absent when nobody is signed in. */
  principal?: SignedInPrincipal;
}

export interface AuthorizationResponse {
  status: number;
  headers: Record<string, string>;
  /** JSON text, an HTML document, or empty. */
  body: string;
}

/** What a page shows; a host's `renderPage` receives exactly this. */
export type AuthorizationPage =
  | {
      kind: "sign-in";
      clientName: string;
      redirectHost: string;
      signIn: { label: string; href: string }[];
      /** Where the anonymous choice posts, and the sealed token it must carry. */
      decisionPath: string;
      decisionToken: string;
    }
  | {
      kind: "consent";
      clientName: string;
      redirectHost: string;
      principalLabel: string;
      keys: { id: string; name: string; scopes: string[]; digestPreview: string }[];
      /** The scopes the host asked for, when it asked. */
      requestedScopes?: string[];
      /** A refusal to show from the previous attempt. */
      problem?: string;
      decisionPath: string;
      decisionToken: string;
    }
  | { kind: "error"; title: string; message: string };

export interface AuthorizationDeps {
  /** This deployment's issuer: an origin with no path, e.g. `https://example.com`. */
  issuer: string;
  /** The MCP endpoints tokens are issued for; the first is the default. */
  resources: readonly string[];
  /**
   * Seals client ids, decision tokens and anonymous codes. At least 32
   * characters, and stable across restarts and replicas: rotating it makes
   * registered clients register again.
   */
  secret: string;
  store: Pick<WritableWidgetStore, "listKeys" | "createKey"> &
    Pick<
      WritableAccessGrantStore,
      "createAuthorizationCode" | "exchangeAuthorizationCode" | "rotateGrant" | "revokeGrant" | "revokeGrantByToken"
    >;
  /** The host's sign-in entry points, offered to a visitor who is not signed in. */
  signIn?: readonly SignInLink[];
  /** Transport for client metadata documents (tests). */
  fetchDeps?: GuardedFetchDeps;
  /** Sink for unexpected failures (defaults to stderr). Never receives a code, verifier, token or key. */
  log?: (line: string) => void;
  /** Epoch milliseconds; injected by tests. */
  now?: () => number;
  /** A host's own page markup. Inline `<style>` blocks are allowed; nothing external will load. */
  renderPage?: (page: AuthorizationPage) => string;
}

/**
 * The node adapter's host callback. "Nobody is signed in" is `undefined`,
 * never a throw — a throw is the host failing, answered with an error page.
 */
export type ResolveSignedIn = (
  req: IncomingMessage
) => SignedInPrincipal | undefined | Promise<SignedInPrincipal | undefined>;
