/**
 * The access-grant contract: one suite, every writable adapter. An adapter
 * that passes resolves, rotates and ends grants exactly as the port says.
 *
 * Not a .test.ts on purpose: it defines the suite, callers instantiate it.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_SECONDS,
  AUTHORIZATION_CODE_SECONDS,
  REFRESH_GRACE_SECONDS,
  REFRESH_TOKEN_SECONDS,
  generateAnonymousToken
} from "../grants.js";
import type { AuthorizationCodeRequest, IssuedTokens, WritableAccessGrantStore } from "../grants.js";
import type { WritableWidgetStore } from "../types.js";
import { StoreRejectionError } from "../types.js";

export interface GrantContractContext {
  store: WritableWidgetStore & WritableAccessGrantStore;
  /** Move the adapter's clock forward. */
  advance(seconds: number): void;
  /** Everything the backing holds, serialized — for the "digests only" check. */
  dump(): Promise<string>;
}

export interface GrantContractOptions {
  maxGrants?: number;
}

const RESOURCE = "https://mcp.example/mcp";
const VERIFIER = "contract-verifier-0123456789-0123456789-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function request(keyId: string, overrides: Partial<AuthorizationCodeRequest> = {}): AuthorizationCodeRequest {
  return {
    keyId,
    clientId: "client-a",
    clientName: "Client A",
    resource: RESOURCE,
    redirectUri: "https://host.example/cb",
    codeChallenge: CHALLENGE,
    ...overrides
  };
}

async function connect(
  store: GrantContractContext["store"],
  principalId: string,
  keyId: string,
  overrides: Partial<AuthorizationCodeRequest> = {}
): Promise<IssuedTokens> {
  const code = await store.createAuthorizationCode(principalId, request(keyId, overrides));
  const exchange = await store.exchangeAuthorizationCode(code, () => true);
  if (exchange.status !== "issued") throw new Error(`expected an issued grant, got ${exchange.status}`);
  return exchange.tokens;
}

export function describeGrantContract(
  name: string,
  factory: (options?: GrantContractOptions) => Promise<GrantContractContext>
): void {
  describe(`grant contract: ${name}`, () => {
    it("a token resolves to the key's principal and scopes", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:resolve", "Resolver");
      const ops = await store.createKey(p.id, "ops", ["read", "execute"]);
      const tokens = await connect(store, p.id, ops.entry.id);
      expect(tokens.accessToken).toMatch(/^wga_[0-9a-f]{64}$/);
      expect(tokens.refreshToken).toMatch(/^wgr_[0-9a-f]{64}$/);
      expect(tokens.expiresIn).toBe(ACCESS_TOKEN_SECONDS);
      const resolved = await store.resolveAccessToken(tokens.accessToken, { resource: RESOURCE });
      expect(resolved?.id).toBe(p.id);
      expect(resolved?.scopes).toEqual(["read", "execute"]);
      expect(resolved).not.toHaveProperty("subject");
    });

    it("a requested scope narrows the grant and read is always kept", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:narrow");
      const ops = await store.createKey(p.id, "ops", ["read", "execute"]);
      const narrowed = await connect(store, p.id, ops.entry.id, { scopes: ["read"] });
      expect(narrowed.scopes).toEqual(["read"]);
      const none = await connect(store, p.id, ops.entry.id, { scopes: [] });
      expect(none.scopes).toEqual(["read"]);
      const readOnly = await store.createKey(p.id, "laptop");
      const widened = await connect(store, p.id, readOnly.entry.id, { scopes: ["read", "execute"] });
      expect(widened.scopes).toEqual(["read"]);
    });

    it("stored material is hashed", async () => {
      const { store, dump } = await factory();
      const p = await store.ensurePrincipal("grants:hashed");
      const key = await store.createKey(p.id, "ops");
      const code = await store.createAuthorizationCode(p.id, request(key.entry.id));
      const beforeExchange = await dump();
      expect(beforeExchange).not.toContain(code);
      const exchange = await store.exchangeAuthorizationCode(code, () => true);
      if (exchange.status !== "issued") throw new Error("exchange failed");
      const state = await dump();
      expect(state).not.toContain(code);
      expect(state).not.toContain(exchange.tokens.accessToken);
      expect(state).not.toContain(exchange.tokens.refreshToken);
      expect(state).toContain("sha256:");
    });

    it("the grant limit retires the least recently used connection", async () => {
      const { store, advance } = await factory({ maxGrants: 2 });
      const p = await store.ensurePrincipal("grants:limit");
      const key = await store.createKey(p.id, "ops");
      const first = await connect(store, p.id, key.entry.id, { clientName: "First" });
      advance(10);
      const second = await connect(store, p.id, key.entry.id, { clientName: "Second" });
      advance(10);
      // Refreshing makes the first the more recently used of the two.
      const rotated = await store.rotateGrant(first.refreshToken, "client-a");
      if (rotated.status !== "issued") throw new Error("rotation failed");
      advance(10);
      const third = await connect(store, p.id, key.entry.id, { clientName: "Third" });
      expect(await store.resolveAccessToken(third.accessToken, { resource: RESOURCE })).toBeDefined();
      expect(await store.resolveAccessToken(rotated.tokens.accessToken, { resource: RESOURCE })).toBeDefined();
      expect(await store.resolveAccessToken(second.accessToken, { resource: RESOURCE })).toBeUndefined();
      expect((await store.listGrants(p.id)).map((grant) => grant.clientName).sort()).toEqual(["First", "Third"]);
    });

    it("expired, foreign and unknown tokens resolve to nothing", async () => {
      const { store, advance } = await factory();
      const p = await store.ensurePrincipal("grants:exact");
      const key = await store.createKey(p.id, "ops");
      const tokens = await connect(store, p.id, key.entry.id);
      expect(await store.resolveAccessToken(tokens.accessToken, { resource: "https://other.example/mcp" })).toBeUndefined();
      expect(await store.resolveAccessToken(`wga_${"0".repeat(64)}`, { resource: RESOURCE })).toBeUndefined();
      expect(await store.resolveAccessToken("wga_short", { resource: RESOURCE })).toBeUndefined();
      expect(await store.resolveAccessToken("", { resource: RESOURCE })).toBeUndefined();
      expect(await store.resolveAccessToken(tokens.refreshToken, { resource: RESOURCE })).toBeUndefined();
      advance(ACCESS_TOKEN_SECONDS + 1);
      expect(await store.resolveAccessToken(tokens.accessToken, { resource: RESOURCE })).toBeUndefined();
    });

    it("the anonymous token is the anonymous principal", async () => {
      const { store } = await factory();
      const resolved = await store.resolveAccessToken(generateAnonymousToken(), { resource: RESOURCE });
      expect(resolved).toEqual({ id: "anonymous", label: "Anonymous", scopes: ["read"] });
      expect(await store.resolveAccessToken("wgn_nope", { resource: RESOURCE })).toBeUndefined();
    });

    it("keys and tokens are not interchangeable", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:apart");
      const key = await store.createKey(p.id, "ops");
      const tokens = await connect(store, p.id, key.entry.id);
      expect(await store.resolveAccessToken(key.key, { resource: RESOURCE })).toBeUndefined();
      expect(await store.resolvePrincipal(tokens.accessToken)).toBeUndefined();
      expect(await store.resolvePrincipal(tokens.refreshToken)).toBeUndefined();
      expect(await store.resolvePrincipal(generateAnonymousToken())).toBeUndefined();
      // The key itself is untouched by any of it.
      expect((await store.resolvePrincipal(key.key))?.id).toBe(p.id);
      expect((await store.listKeys(p.id)).map((entry) => entry.name)).toEqual(["ops"]);
    });

    it("two exchanges of one code yield one success", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:once");
      const key = await store.createKey(p.id, "ops");
      const code = await store.createAuthorizationCode(p.id, request(key.entry.id));
      const [a, b] = await Promise.all([
        store.exchangeAuthorizationCode(code, () => true),
        store.exchangeAuthorizationCode(code, () => true)
      ]);
      const issued = [a, b].filter((result) => result.status === "issued");
      const used = [a, b].filter((result) => result.status === "used");
      expect(issued).toHaveLength(1);
      expect(used).toHaveLength(1);
      const first = issued[0];
      const second = used[0];
      if (first?.status !== "issued" || second?.status !== "used") throw new Error("unreachable");
      expect(second.grantId).toBe(first.tokens.grantId);
      // In sequence too, and the caller can end the grant it names.
      const later = await store.exchangeAuthorizationCode(code, () => true);
      expect(later).toEqual({ status: "used", principalId: p.id, grantId: first.tokens.grantId });
      await store.revokeGrant(p.id, first.tokens.grantId);
      expect(await store.resolveAccessToken(first.tokens.accessToken, { resource: RESOURCE })).toBeUndefined();
    });

    it("a mismatched exchange does not consume the code", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:mismatch");
      const key = await store.createKey(p.id, "ops");
      const code = await store.createAuthorizationCode(p.id, request(key.entry.id));
      let seen: unknown;
      const refused = await store.exchangeAuthorizationCode(code, (binding) => {
        seen = binding;
        return false;
      });
      expect(refused).toEqual({ status: "mismatch" });
      expect(seen).toEqual({
        clientId: "client-a",
        redirectUri: "https://host.example/cb",
        codeChallenge: CHALLENGE,
        resource: RESOURCE
      });
      expect((await store.exchangeAuthorizationCode(code, () => true)).status).toBe("issued");
    });

    it("a late or unknown code is refused", async () => {
      const { store, advance } = await factory();
      const p = await store.ensurePrincipal("grants:late");
      const key = await store.createKey(p.id, "ops");
      const code = await store.createAuthorizationCode(p.id, request(key.entry.id));
      advance(AUTHORIZATION_CODE_SECONDS + 1);
      expect(await store.exchangeAuthorizationCode(code, () => true)).toEqual({ status: "unknown" });
      expect(await store.exchangeAuthorizationCode(`wgc_${"1".repeat(64)}`, () => true)).toEqual({ status: "unknown" });
      expect(await store.exchangeAuthorizationCode("not-a-code", () => true)).toEqual({ status: "unknown" });
      expect(await store.listGrants(p.id)).toEqual([]);
    });

    it("a code needs a live key of the principal", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:key");
      const other = await store.ensurePrincipal("grants:key-other");
      const key = await store.createKey(p.id, "ops");
      await expect(store.createAuthorizationCode(other.id, request(key.entry.id))).rejects.toMatchObject({
        code: "UNKNOWN_KEY"
      });
      await expect(store.createAuthorizationCode(p.id, request("key_missing"))).rejects.toBeInstanceOf(
        StoreRejectionError
      );
      // Revoked between consent and exchange: nothing is issued.
      const code = await store.createAuthorizationCode(p.id, request(key.entry.id));
      await store.revokeKey(p.id, key.entry.id);
      expect(await store.exchangeAuthorizationCode(code, () => true)).toEqual({ status: "unknown" });
      await expect(store.createAuthorizationCode(p.id, request(key.entry.id))).rejects.toMatchObject({
        code: "UNKNOWN_KEY"
      });
    });

    it("rotation supersedes the old pair, with a grace and then a replay", async () => {
      const { store, advance } = await factory();
      const p = await store.ensurePrincipal("grants:rotate");
      const key = await store.createKey(p.id, "ops", ["read", "execute"]);
      const first = await connect(store, p.id, key.entry.id);

      expect(await store.rotateGrant(first.refreshToken, "someone-else")).toEqual({ status: "unknown" });
      expect(await store.rotateGrant(first.accessToken, "client-a")).toEqual({ status: "unknown" });

      advance(30);
      const second = await store.rotateGrant(first.refreshToken, "client-a");
      if (second.status !== "issued") throw new Error("rotation failed");
      expect(second.tokens.grantId).toBe(first.grantId);
      expect(second.tokens.scopes).toEqual(["read", "execute"]);
      expect(await store.resolveAccessToken(second.tokens.accessToken, { resource: RESOURCE })).toBeDefined();
      expect(await store.resolveAccessToken(first.accessToken, { resource: RESOURCE })).toBeUndefined();

      // Within the grace the superseded token still rotates.
      advance(REFRESH_GRACE_SECONDS - 5);
      const third = await store.rotateGrant(first.refreshToken, "client-a");
      if (third.status !== "issued") throw new Error("grace rotation failed");
      expect(await store.resolveAccessToken(third.tokens.accessToken, { resource: RESOURCE })).toBeDefined();
      expect(await store.resolveAccessToken(second.tokens.accessToken, { resource: RESOURCE })).toBeUndefined();

      // After it, the same token is a replay and the grant ends.
      advance(REFRESH_GRACE_SECONDS + 10);
      expect(await store.rotateGrant(first.refreshToken, "client-a")).toEqual({ status: "replay" });
      expect(await store.resolveAccessToken(third.tokens.accessToken, { resource: RESOURCE })).toBeUndefined();
      expect(await store.rotateGrant(third.tokens.refreshToken, "client-a")).toEqual({ status: "unknown" });
      expect(await store.listGrants(p.id)).toEqual([]);
    });

    it("a refresh token expires thirty days after its last use", async () => {
      const { store, advance } = await factory();
      const p = await store.ensurePrincipal("grants:idle");
      const key = await store.createKey(p.id, "ops");
      const first = await connect(store, p.id, key.entry.id);
      advance(REFRESH_TOKEN_SECONDS - 60);
      const second = await store.rotateGrant(first.refreshToken, "client-a");
      if (second.status !== "issued") throw new Error("rotation failed");
      expect(await store.listGrants(p.id)).toHaveLength(1);
      advance(REFRESH_TOKEN_SECONDS + 1);
      expect(await store.rotateGrant(second.tokens.refreshToken, "client-a")).toEqual({ status: "unknown" });
      expect(await store.listGrants(p.id)).toEqual([]);
    });

    it("revoking a key ends its grants only", async () => {
      const { store } = await factory();
      const p = await store.ensurePrincipal("grants:fanout");
      const laptop = await store.createKey(p.id, "laptop");
      const ops = await store.createKey(p.id, "ops", ["read", "execute"]);
      const viaLaptop = await connect(store, p.id, laptop.entry.id, { clientName: "Laptop host" });
      const viaOps = await connect(store, p.id, ops.entry.id, { clientName: "Ops host" });
      const viaOpsToo = await connect(store, p.id, ops.entry.id, { clientName: "Second ops host" });

      await store.revokeKey(p.id, ops.entry.id);
      expect(await store.resolveAccessToken(viaOps.accessToken, { resource: RESOURCE })).toBeUndefined();
      expect(await store.resolveAccessToken(viaOpsToo.accessToken, { resource: RESOURCE })).toBeUndefined();
      expect(await store.rotateGrant(viaOps.refreshToken, "client-a")).toEqual({ status: "unknown" });
      expect((await store.resolveAccessToken(viaLaptop.accessToken, { resource: RESOURCE }))?.id).toBe(p.id);
      expect((await store.rotateGrant(viaLaptop.refreshToken, "client-a")).status).toBe("issued");
      expect((await store.listGrants(p.id)).map((grant) => grant.clientName)).toEqual(["Laptop host"]);
      expect((await store.resolvePrincipal(laptop.key))?.id).toBe(p.id);
    });

    it("grants are listed as metadata and revoked one by one or by token", async () => {
      const { store, advance } = await factory();
      const p = await store.ensurePrincipal("grants:list");
      const other = await store.ensurePrincipal("grants:list-other");
      const key = await store.createKey(p.id, "ops");
      const a = await connect(store, p.id, key.entry.id, { clientName: "A".repeat(200) });
      advance(1);
      const b = await connect(store, p.id, key.entry.id, { clientName: "Beta" });
      const listed = await store.listGrants(p.id);
      expect(listed).toHaveLength(2);
      expect(listed[0]?.clientName).toBe("A".repeat(80));
      expect(Object.keys(listed[0] ?? {}).sort()).toEqual(
        ["clientId", "clientName", "createdAt", "id", "keyId", "lastUsedAt", "resource", "scopes"].sort()
      );
      expect(JSON.stringify(listed)).not.toContain("sha256:");
      expect(await store.listGrants(other.id)).toEqual([]);

      // Another principal cannot end it; unknown ids and tokens are no-ops.
      await store.revokeGrant(other.id, a.grantId);
      await store.revokeGrant(p.id, "grant_missing");
      await store.revokeGrantByToken(`wgr_${"2".repeat(64)}`);
      await store.revokeGrantByToken("garbage");
      expect(await store.listGrants(p.id)).toHaveLength(2);

      await store.revokeGrantByToken(a.refreshToken);
      expect(await store.resolveAccessToken(a.accessToken, { resource: RESOURCE })).toBeUndefined();
      await store.revokeGrantByToken(b.accessToken);
      expect(await store.rotateGrant(b.refreshToken, "client-a")).toEqual({ status: "unknown" });
      expect(await store.listGrants(p.id)).toEqual([]);
    });
  });
}
