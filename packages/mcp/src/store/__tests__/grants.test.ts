// @vitest-environment node
/**
 * Access grants on the memory reference (the contract every writable
 * adapter shares) and on the read-only file store, which carries no grants.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileStore } from "../file.js";
import { generateAnonymousToken, isAnonymousAccessToken } from "../grants.js";
import { createMemoryStore } from "../memory.js";
import { DEFAULT_LIMITS } from "../types.js";
import { describeGrantContract } from "./grant-contract.js";

describeGrantContract("memory", async (options) => {
  const clock = { now: Date.parse("2026-11-01T00:00:00Z") };
  const store = createMemoryStore(
    [],
    { ...DEFAULT_LIMITS, ...(options?.maxGrants === undefined ? {} : { maxGrants: options.maxGrants }) },
    { now: () => clock.now }
  );
  return {
    store,
    advance: (seconds) => {
      clock.now += seconds * 1000;
    },
    dump: async () => JSON.stringify(store.snapshot())
  };
});

describe("file store grants", () => {
  it("resolves only the anonymous form and has no write side", async () => {
    const store = createFileStore(mkdtempSync(join(tmpdir(), "wg-file-grants-")), { onDiagnostic: () => {} });
    const resource = "https://mcp.example/mcp";
    expect(await store.resolveAccessToken(generateAnonymousToken(), { resource })).toEqual({
      id: "anonymous",
      label: "Anonymous",
      scopes: ["read"]
    });
    expect(await store.resolveAccessToken(`wga_${"a".repeat(64)}`, { resource })).toBeUndefined();
    expect(store).not.toHaveProperty("createAuthorizationCode");
    expect(store).not.toHaveProperty("rotateGrant");
  });
});

describe("the anonymous token", () => {
  it("has its own form and is recognised by it alone", () => {
    const token = generateAnonymousToken();
    expect(token).toMatch(/^wgn_[0-9a-f]{64}$/);
    expect(isAnonymousAccessToken(token)).toBe(true);
    expect(isAnonymousAccessToken(`wga_${"a".repeat(64)}`)).toBe(false);
    expect(isAnonymousAccessToken("wgn_")).toBe(false);
    expect(isAnonymousAccessToken(undefined)).toBe(false);
  });
});
