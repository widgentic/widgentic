/**
 * Access grants: what an MCP host holds after a person signs it in. A grant
 * is bound to one API key — it carries that key's scopes and ends when the
 * key is revoked. Three rules, all load-bearing:
 *
 * 1. Tokens and codes are digests at rest, exactly like keys.
 * 2. An access token's own record carries everything resolution needs, so
 *    resolving is ONE read and never a write. Whatever ends a grant removes
 *    its token records when it happens.
 * 3. No token, code or digest reaches a log line.
 *
 * The rules live here once; an adapter supplies only the record primitives
 * ({@link GrantBackend}).
 */
import { randomBytes } from "node:crypto";
import { hashKey } from "./keys.js";
import type { Principal, Scope } from "./types.js";
import { ANONYMOUS_PRINCIPAL, StoreRejectionError } from "./types.js";

/** Prefixes keep the credentials apart in a log search and at the door. */
export const ACCESS_TOKEN_PREFIX = "wga_";
export const REFRESH_TOKEN_PREFIX = "wgr_";
export const AUTHORIZATION_CODE_PREFIX = "wgc_";
/** A token that IS the anonymous principal: no record, no expiry. */
export const ANONYMOUS_TOKEN_PREFIX = "wgn_";

export const ACCESS_TOKEN_SECONDS = 3_600;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 3_600;
export const AUTHORIZATION_CODE_SECONDS = 60;
/** How long a rotated refresh token is still honored (parallel tabs, retries). */
export const REFRESH_GRACE_SECONDS = 60;
/** Grants per principal when `StoreLimits.maxGrants` is unset. */
export const DEFAULT_MAX_GRANTS = 50;
/** A client's self-reported name is display text; this bounds it. */
export const CLIENT_NAME_MAX_LENGTH = 80;

const TOKEN_BODY = /^[0-9a-f]{64}$/;

function mint(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

function wellFormed(value: unknown, prefix: string): value is string {
  return typeof value === "string" && value.startsWith(prefix) && TOKEN_BODY.test(value.slice(prefix.length));
}

/** An anonymous access token. Worth exactly what a request with no credential is worth. */
export function generateAnonymousToken(): string {
  return mint(ANONYMOUS_TOKEN_PREFIX);
}

export function isAnonymousAccessToken(value: unknown): value is string {
  return wellFormed(value, ANONYMOUS_TOKEN_PREFIX);
}

/** True for anything minted here — so key resolution can refuse it unread. */
export function isGrantCredential(value: unknown): boolean {
  return (
    typeof value === "string" &&
    [ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX, AUTHORIZATION_CODE_PREFIX, ANONYMOUS_TOKEN_PREFIX].some((prefix) =>
      value.startsWith(prefix)
    )
  );
}

/** What an authorization code is bound to; the exchange must match all of it. */
export interface AuthorizationCodeBinding {
  clientId: string;
  redirectUri: string;
  /** The S256 challenge the verifier must hash to. */
  codeChallenge: string;
  resource: string;
}

export interface AuthorizationCodeRequest extends AuthorizationCodeBinding {
  /** The API key the grant is bound to; must be a live key of the principal. */
  keyId: string;
  /** The client's own name — display text, unverified. */
  clientName: string;
  /** Narrows the key's scopes; `read` is always kept. Absent: the key's scopes. */
  scopes?: readonly Scope[];
}

export interface IssuedTokens {
  grantId: string;
  accessToken: string;
  refreshToken: string;
  /** Seconds the access token is valid. */
  expiresIn: number;
  scopes: Scope[];
  resource: string;
}

export type CodeExchange =
  | { status: "issued"; tokens: IssuedTokens }
  /** Already exchanged: the grant the first exchange produced, so the caller can end it. */
  | { status: "used"; principalId: string; grantId: string }
  /** The caller's check refused the binding; the code is NOT consumed. */
  | { status: "mismatch" }
  | { status: "unknown" };

export type GrantRotation =
  | { status: "issued"; tokens: IssuedTokens }
  /** A refresh token rotated longer ago than the grace; the grant is ended. */
  | { status: "replay" }
  | { status: "unknown" };

/** A grant as it may be shown: no token, no digest. */
export interface StoredGrant {
  id: string;
  keyId: string;
  clientId: string;
  clientName: string;
  resource: string;
  scopes: Scope[];
  /** ISO timestamps. `lastUsedAt` is the last token refresh. */
  createdAt: string;
  lastUsedAt: string;
}

/** The read side: every adapter, including read-only handles. */
export interface AccessGrantStore {
  /**
   * Access token → principal with the grant's scopes. `undefined` for a
   * token that is unknown, malformed, expired, superseded, revoked, or
   * issued for another resource; never throws, never writes. The anonymous
   * form resolves to the anonymous principal with no store access.
   */
  resolveAccessToken(token: string, options: { resource: string }): Promise<Principal | undefined>;
}

/** The write side: the authorization surface's path, not the MCP service's. */
export interface WritableAccessGrantStore extends AccessGrantStore {
  /**
   * Store a code for a signed-in principal and return it raw, once. Refused
   * with `UNKNOWN_KEY` when `keyId` is not a live key of the principal.
   */
  createAuthorizationCode(principalId: string, request: AuthorizationCodeRequest): Promise<string>;
  /**
   * Exchange a code for a grant's first tokens. Single use and atomic: of
   * two exchanges one is `issued` and the other `used`. `matches` sees the
   * code's binding before it is consumed.
   */
  exchangeAuthorizationCode(
    code: string,
    matches: (binding: AuthorizationCodeBinding) => boolean
  ): Promise<CodeExchange>;
  /** Rotate a grant's tokens with its refresh token, presented by `clientId`. */
  rotateGrant(refreshToken: string, clientId: string): Promise<GrantRotation>;
  /** End one grant; unknown ids are a no-op. */
  revokeGrant(principalId: string, grantId: string): Promise<void>;
  /** End the grant an access or refresh token belongs to; unknown tokens are a no-op. */
  revokeGrantByToken(token: string): Promise<void>;
  /** The principal's live grants — metadata only. */
  listGrants(principalId: string): Promise<StoredGrant[]>;
}

/** A token's or code's record, keyed by its digest. */
export interface GrantTokenRecord {
  digest: string;
  type: "access" | "refresh" | "code";
  principalId: string;
  grantId: string;
  keyId: string;
  clientId: string;
  clientName: string;
  resource: string;
  scopes: Scope[];
  /** ISO; resolution decides expiry from this, never from a store's own TTL. */
  expiresAt: string;
  /** Codes only. */
  redirectUri?: string;
  codeChallenge?: string;
  usedAt?: string;
  /** Refresh tokens only: when a rotation superseded it. */
  rotatedAt?: string;
}

/** A grant's record, in its principal's own space. */
export interface GrantRecord extends StoredGrant {
  principalId: string;
  accessDigest: string;
  refreshDigest: string;
  /** The refresh token the last rotation superseded. */
  previousRefreshDigest?: string;
  /** ISO; a grant whose refresh token has expired is no longer live. */
  refreshExpiresAt: string;
}

/** What an adapter supplies. Every method addresses one record. */
export interface GrantBackend {
  readToken(digest: string): Promise<GrantTokenRecord | undefined>;
  writeToken(record: GrantTokenRecord): Promise<void>;
  removeToken(digest: string): Promise<void>;
  /** Atomically stamp an unused code as used. False when it was used already or is gone. */
  claimCode(digest: string, usedAt: string): Promise<boolean>;
  readGrant(principalId: string, grantId: string): Promise<GrantRecord | undefined>;
  writeGrant(grant: GrantRecord): Promise<void>;
  removeGrant(principalId: string, grantId: string): Promise<void>;
  grants(principalId: string): Promise<GrantRecord[]>;
  /** The scopes of a LIVE key of the principal; `undefined` when unknown or revoked. */
  keyScopes(principalId: string, keyId: string): Promise<Scope[] | undefined>;
}

export interface GrantOperations extends WritableAccessGrantStore {
  /** `revokeKey`'s fan-out: end every grant bound to the key. */
  revokeGrantsForKey(principalId: string, keyId: string): Promise<void>;
}

export interface GrantOperationOptions {
  maxGrants?: number;
  /** Epoch milliseconds; injected by tests. */
  now?: () => number;
}

function publicGrant(grant: GrantRecord): StoredGrant {
  return {
    id: grant.id,
    keyId: grant.keyId,
    clientId: grant.clientId,
    clientName: grant.clientName,
    resource: grant.resource,
    scopes: [...grant.scopes],
    createdAt: grant.createdAt,
    lastUsedAt: grant.lastUsedAt
  };
}

/** Token resolution over one record read — the whole read side. */
export async function resolveAccessTokenWith(
  readToken: (digest: string) => Promise<GrantTokenRecord | undefined>,
  token: string,
  resource: string,
  now: number
): Promise<Principal | undefined> {
  if (isAnonymousAccessToken(token)) return { ...ANONYMOUS_PRINCIPAL, scopes: [...ANONYMOUS_PRINCIPAL.scopes] };
  if (!wellFormed(token, ACCESS_TOKEN_PREFIX)) return undefined;
  let record: GrantTokenRecord | undefined;
  try {
    record = await readToken(hashKey(token));
  } catch {
    // An unreachable store resolves exactly like an unknown token.
    return undefined;
  }
  if (record === undefined || record.type !== "access") return undefined;
  if (!(Date.parse(record.expiresAt) > now)) return undefined;
  if (record.resource !== resource) return undefined;
  return { id: record.principalId, scopes: [...record.scopes] };
}

/** The grant rules over an adapter's record primitives. */
export function createGrantOperations(backend: GrantBackend, options: GrantOperationOptions = {}): GrantOperations {
  const maxGrants = options.maxGrants ?? DEFAULT_MAX_GRANTS;
  const now = options.now ?? Date.now;
  const iso = (ms: number): string => new Date(ms).toISOString();

  async function endGrant(grant: GrantRecord): Promise<void> {
    // Tokens first: a failure part-way leaves a grant that can still be
    // ended, never tokens no record points at.
    await backend.removeToken(grant.accessDigest);
    await backend.removeToken(grant.refreshDigest);
    if (grant.previousRefreshDigest !== undefined) await backend.removeToken(grant.previousRefreshDigest);
    await backend.removeGrant(grant.principalId, grant.id);
  }

  /** Mint a pair, write its records, and point the grant at them. */
  async function issue(grant: GrantRecord, at: number): Promise<IssuedTokens> {
    const accessToken = mint(ACCESS_TOKEN_PREFIX);
    const refreshToken = mint(REFRESH_TOKEN_PREFIX);
    const shared = {
      principalId: grant.principalId,
      grantId: grant.id,
      keyId: grant.keyId,
      clientId: grant.clientId,
      clientName: grant.clientName,
      resource: grant.resource,
      scopes: grant.scopes
    };
    const refreshExpiresAt = iso(at + REFRESH_TOKEN_SECONDS * 1000);
    const accessDigest = hashKey(accessToken);
    const refreshDigest = hashKey(refreshToken);
    // New records before the grant names them, so the grant never points
    // at a token that does not exist.
    await backend.writeToken({ ...shared, digest: accessDigest, type: "access", expiresAt: iso(at + ACCESS_TOKEN_SECONDS * 1000) });
    await backend.writeToken({ ...shared, digest: refreshDigest, type: "refresh", expiresAt: refreshExpiresAt });
    await backend.writeGrant({ ...grant, accessDigest, refreshDigest, refreshExpiresAt, lastUsedAt: iso(at) });
    return {
      grantId: grant.id,
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      scopes: [...grant.scopes],
      resource: grant.resource
    };
  }

  function live(grant: GrantRecord, at: number): boolean {
    return Date.parse(grant.refreshExpiresAt) > at;
  }

  return {
    resolveAccessToken(token, { resource }) {
      return resolveAccessTokenWith((digest) => backend.readToken(digest), token, resource, now());
    },

    async createAuthorizationCode(principalId, request) {
      const keyScopes = await backend.keyScopes(principalId, request.keyId);
      if (keyScopes === undefined) throw new StoreRejectionError("UNKNOWN_KEY", request.keyId);
      const asked = request.scopes;
      const scopes =
        asked === undefined
          ? keyScopes
          : keyScopes.filter((scope) => scope === "read" || asked.some((wanted) => wanted === scope));
      const code = mint(AUTHORIZATION_CODE_PREFIX);
      const at = now();
      await backend.writeToken({
        digest: hashKey(code),
        type: "code",
        principalId,
        grantId: `grant_${randomBytes(12).toString("hex")}`,
        keyId: request.keyId,
        clientId: request.clientId,
        clientName: request.clientName.slice(0, CLIENT_NAME_MAX_LENGTH),
        resource: request.resource,
        scopes,
        expiresAt: iso(at + AUTHORIZATION_CODE_SECONDS * 1000),
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge
      });
      return code;
    },

    async exchangeAuthorizationCode(code, matches) {
      if (!wellFormed(code, AUTHORIZATION_CODE_PREFIX)) return { status: "unknown" };
      const digest = hashKey(code);
      const record = await backend.readToken(digest);
      if (record === undefined || record.type !== "code") return { status: "unknown" };
      if (record.usedAt !== undefined) return { status: "used", principalId: record.principalId, grantId: record.grantId };
      const at = now();
      if (!(Date.parse(record.expiresAt) > at)) return { status: "unknown" };
      const binding: AuthorizationCodeBinding = {
        clientId: record.clientId,
        redirectUri: record.redirectUri ?? "",
        codeChallenge: record.codeChallenge ?? "",
        resource: record.resource
      };
      if (!matches(binding)) return { status: "mismatch" };
      if (!(await backend.claimCode(digest, iso(at)))) {
        return { status: "used", principalId: record.principalId, grantId: record.grantId };
      }
      // The key may have been revoked between consent and exchange.
      if ((await backend.keyScopes(record.principalId, record.keyId)) === undefined) return { status: "unknown" };

      // At the limit the least recently used connection makes room: a
      // person adding a host must never be stopped by hosts they forgot.
      const held = (await backend.grants(record.principalId)).sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt));
      for (const stale of held.filter((grant) => !live(grant, at))) await endGrant(stale);
      const current = held.filter((grant) => live(grant, at));
      for (const oldest of current.slice(0, Math.max(0, current.length - maxGrants + 1))) await endGrant(oldest);

      const tokens = await issue(
        {
          id: record.grantId,
          principalId: record.principalId,
          keyId: record.keyId,
          clientId: record.clientId,
          clientName: record.clientName,
          resource: record.resource,
          scopes: record.scopes,
          createdAt: iso(at),
          lastUsedAt: iso(at),
          accessDigest: "",
          refreshDigest: "",
          refreshExpiresAt: iso(at)
        },
        at
      );
      return { status: "issued", tokens };
    },

    async rotateGrant(refreshToken, clientId) {
      if (!wellFormed(refreshToken, REFRESH_TOKEN_PREFIX)) return { status: "unknown" };
      const record = await backend.readToken(hashKey(refreshToken));
      if (record === undefined || record.type !== "refresh" || record.clientId !== clientId) return { status: "unknown" };
      const at = now();
      if (!(Date.parse(record.expiresAt) > at)) return { status: "unknown" };
      const grant = await backend.readGrant(record.principalId, record.grantId);
      if (grant === undefined) return { status: "unknown" };
      if (record.rotatedAt !== undefined && at - Date.parse(record.rotatedAt) > REFRESH_GRACE_SECONDS * 1000) {
        await endGrant(grant);
        return { status: "replay" };
      }
      const superseded = { access: grant.accessDigest, refresh: grant.refreshDigest, before: grant.previousRefreshDigest };
      const tokens = await issue({ ...grant, previousRefreshDigest: superseded.refresh }, at);
      // The superseded refresh token stays on record, stamped, so a later
      // presentation is recognised as a replay instead of as unknown.
      const old = await backend.readToken(superseded.refresh);
      if (old !== undefined && old.rotatedAt === undefined) await backend.writeToken({ ...old, rotatedAt: iso(at) });
      await backend.removeToken(superseded.access);
      if (superseded.before !== undefined && superseded.before !== record.digest) await backend.removeToken(superseded.before);
      return { status: "issued", tokens };
    },

    async revokeGrant(principalId, grantId) {
      const grant = await backend.readGrant(principalId, grantId);
      if (grant !== undefined) await endGrant(grant);
    },

    async revokeGrantByToken(token) {
      if (!wellFormed(token, ACCESS_TOKEN_PREFIX) && !wellFormed(token, REFRESH_TOKEN_PREFIX)) return;
      const record = await backend.readToken(hashKey(token));
      if (record === undefined || record.type === "code") return;
      const grant = await backend.readGrant(record.principalId, record.grantId);
      if (grant !== undefined) await endGrant(grant);
    },

    async listGrants(principalId) {
      const at = now();
      return (await backend.grants(principalId))
        .filter((grant) => live(grant, at))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(publicGrant);
    },

    async revokeGrantsForKey(principalId, keyId) {
      for (const grant of await backend.grants(principalId)) {
        if (grant.keyId === keyId) await endGrant(grant);
      }
    }
  };
}
