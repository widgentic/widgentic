// @vitest-environment node
/**
 * The key listing names the applications connected through each key
 * (authoring-api spec, "Keys are minted once with the scopes fixed at
 * creation").
 */
import { describe, expect, it } from "vitest";
import { createMemoryStore, REFRESH_TOKEN_SECONDS } from "../../store/index.js";
import type { MemoryStore } from "../../store/index.js";
import { handleAuthoringRequest } from "../handler.js";
import type { PrincipalContext } from "../types.js";

const RESOURCE = "https://mcp.example/mcp";

interface ListedKey {
  id: string;
  name: string;
  connections?: { clientName: string; createdAt: string; lastUsedAt: string }[];
}

async function connect(store: MemoryStore, principalId: string, keyId: string, clientName: string) {
  const code = await store.createAuthorizationCode(principalId, {
    keyId,
    clientId: `cid_${clientName}`,
    clientName,
    resource: RESOURCE,
    redirectUri: "https://host.example/cb",
    codeChallenge: "challenge"
  });
  const exchange = await store.exchangeAuthorizationCode(code, () => true);
  if (exchange.status !== "issued") throw new Error("exchange failed");
  return exchange.tokens;
}

async function setup() {
  const clock = { now: Date.parse("2026-11-01T00:00:00Z") };
  const store = createMemoryStore([], undefined, { now: () => clock.now });
  const principal = await store.ensurePrincipal("person:one");
  const context: PrincipalContext = { principalId: principal.id };
  const list = async (withGrants: boolean): Promise<ListedKey[]> => {
    const response = await handleAuthoringRequest(
      { method: "GET", path: "keys", context },
      { store, ...(withGrants ? { grants: store } : {}) }
    );
    expect(response.status).toBe(200);
    return (response.body as { keys: ListedKey[] }).keys;
  };
  return { store, principal, clock, list };
}

describe("the key listing names its connections", () => {
  it("a key lists the applications connected through it", async () => {
    const { store, principal, clock, list } = await setup();
    const ops = await store.createKey(principal.id, "ops", ["read", "execute"]);
    await store.createKey(principal.id, "laptop");
    const claude = await connect(store, principal.id, ops.entry.id, "Claude");
    clock.now += 60_000;
    const code = await connect(store, principal.id, ops.entry.id, "VS Code");

    const keys = await list(true);
    const byName = Object.fromEntries(keys.map((key) => [key.name, key]));
    expect(byName.ops?.connections).toEqual([
      { clientName: "Claude", createdAt: "2026-11-01T00:00:00.000Z", lastUsedAt: "2026-11-01T00:00:00.000Z" },
      { clientName: "VS Code", createdAt: "2026-11-01T00:01:00.000Z", lastUsedAt: "2026-11-01T00:01:00.000Z" }
    ]);
    expect(byName.laptop?.connections).toEqual([]);

    // Nothing a connection could be resumed or identified by.
    const serialized = JSON.stringify(keys);
    for (const secret of [claude.accessToken, claude.refreshToken, code.accessToken, code.refreshToken, ops.key]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain("sha256:");
    expect(serialized).not.toContain("cid_");
    expect(serialized).not.toContain("host.example");
    expect(serialized).not.toContain(claude.grantId);

    // A refresh moves "last used"; the connection's start stays.
    clock.now += 3_600_000;
    await store.rotateGrant(claude.refreshToken, "cid_Claude");
    const later = (await list(true)).find((key) => key.name === "ops")?.connections;
    expect(later?.[0]).toEqual({
      clientName: "Claude",
      createdAt: "2026-11-01T00:00:00.000Z",
      lastUsedAt: "2026-11-01T01:01:00.000Z"
    });
  });

  it("ended connections disappear", async () => {
    const { store, principal, clock, list } = await setup();
    const ops = await store.createKey(principal.id, "ops");
    const claude = await connect(store, principal.id, ops.entry.id, "Claude");
    await connect(store, principal.id, ops.entry.id, "VS Code");
    await store.revokeGrantByToken(claude.refreshToken);
    expect((await list(true))[0]?.connections?.map((c) => c.clientName)).toEqual(["VS Code"]);
    // An idle connection ends when its refresh token expires.
    clock.now += (REFRESH_TOKEN_SECONDS + 1) * 1000;
    expect((await list(true))[0]?.connections).toEqual([]);
  });

  it("a surface without grants lists keys as before", async () => {
    const { store, principal, list } = await setup();
    const ops = await store.createKey(principal.id, "ops");
    await connect(store, principal.id, ops.entry.id, "Claude");
    const keys = await list(false);
    expect(keys).toEqual(await store.listKeys(principal.id));
    expect(keys[0]).not.toHaveProperty("connections");
    expect(Object.keys(keys[0] ?? {}).sort()).toEqual(["createdAt", "digestPreview", "id", "name", "scopes"]);
  });
});
