// @vitest-environment node
/**
 * The deployment key (self-host-example spec, "A deployment key survives an
 * ephemeral store").
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeCatalog, generateKey } from "@widgentic/mcp/store";
import { createSqliteStore } from "@widgentic/mcp/store/sqlite";
import { loadDeploymentKey } from "../deployment-key.js";
import { seedOnStartup } from "../seed.js";
import { SINGLE_PRINCIPAL_SUBJECT } from "../identity.js";

const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), "..", "seed", "demo.json");

let dir: string;
let lines: string[];
const log = (line: string) => lines.push(line);
const key = generateKey();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "widgentic-key-"));
  lines = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("deployment key", () => {
  it("reaches the seeded catalog of the single principal on a fresh store", async () => {
    const store = createSqliteStore(join(dir, "store.db"));
    try {
      const principal = await store.ensurePrincipal(SINGLE_PRINCIPAL_SUBJECT, "Self-hosted");
      await seedOnStartup(store, { principalId: principal.id }, SAMPLE, () => {});
      const resolved = loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: key }, log)?.match(key);
      expect(resolved?.id).toBe(principal.id);
      const catalog = (await composeCatalog(store, resolved?.id ?? "")).value;
      expect(catalog.kinds()).toEqual(expect.arrayContaining(["appointment-agenda-widget", "email-inbox-widget"]));
    } finally {
      store.close();
    }
  });

  it("is read-only unless execute is named", () => {
    expect(loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: key }, log)?.match(key)?.scopes).toEqual(["read"]);
    expect(
      loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: key, WIDGENTIC_DEFAULT_KEY_SCOPES: "read, execute" }, log)?.match(key)?.scopes
    ).toEqual(["read", "execute"]);
  });

  it("stays read-only when a scope keys cannot hold is named", () => {
    const loaded = loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: key, WIDGENTIC_DEFAULT_KEY_SCOPES: "write" }, log);
    expect(loaded?.match(key)?.scopes).toEqual(["read"]);
    expect(lines.some((line) => line.includes("read-only"))).toBe(true);
  });

  it("prefers the file over the variable", () => {
    const fileKey = generateKey();
    const path = join(dir, "key.txt");
    writeFileSync(path, `${fileKey}\n`);
    const loaded = loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY_FILE: path, WIDGENTIC_DEFAULT_KEY: key }, log);
    expect(loaded?.match(fileKey)).toBeDefined();
    expect(loaded?.match(key)).toBeUndefined();
  });

  it.each([
    ["a value without the minted shape", { WIDGENTIC_DEFAULT_KEY: "not-a-key" }],
    ["an uppercase lookalike", { WIDGENTIC_DEFAULT_KEY: key.toUpperCase() }],
    ["an unreadable file", { WIDGENTIC_DEFAULT_KEY_FILE: "/nonexistent/key.txt" }]
  ])("ignores %s, says why, and never logs the value", (_label, env) => {
    expect(loadDeploymentKey(env, log)).toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines.join("\n")).not.toContain(key);
    expect(lines.join("\n")).not.toContain("not-a-key");
  });

  it("never logs the configured key", () => {
    loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: key, WIDGENTIC_DEFAULT_KEY_SCOPES: "read,execute" }, log);
    expect(lines.join("\n")).not.toContain(key);
    expect(lines.join("\n")).not.toContain(key.slice(4, 20));
  });

  it("does not match any other key", () => {
    const loaded = loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: key }, log);
    expect(loaded?.match(generateKey())).toBeUndefined();
    expect(loaded?.match("")).toBeUndefined();
  });

  it("changes nothing when unset", () => {
    expect(loadDeploymentKey({}, log)).toBeUndefined();
    expect(loadDeploymentKey({ WIDGENTIC_DEFAULT_KEY: "  " }, log)).toBeUndefined();
    expect(lines).toEqual([]);
  });
});
