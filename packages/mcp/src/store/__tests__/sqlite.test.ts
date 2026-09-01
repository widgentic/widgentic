/**
 * The SQLite adapter honours the writable-store contract (widget-store spec,
 * "SQLite adapter for single-node deployments") — the same suite the memory
 * reference passes, plus what only a real file can prove: restart
 * durability, a second connection over the same file, whole-or-nothing
 * writes, digests-and-ciphertext-only content, and the schema-version
 * refusal.
 */
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createLocalCipher, generateLocalKek } from "../../secrets/index.js";
import { createSqliteStore } from "../sqlite.js";
import { DEFAULT_LIMITS, StoreRejectionError } from "../types.js";
import type { StoredWidget } from "../types.js";
import { describeStoreContract } from "./contract.js";

const KEK = generateLocalKek();
const LIMITS = { ...DEFAULT_LIMITS, maxWidgets: 5 };

function freshPath(): string {
  return join(mkdtempSync(join(tmpdir(), "wg-sqlite-")), "store.db");
}

function open(path: string) {
  return createSqliteStore(path, { limits: LIMITS, cipher: createLocalCipher(KEK), onDiagnostic: () => {} });
}

function widget(kind: string): StoredWidget {
  return {
    kind,
    template: { tag: "div", children: [{ bind: "title" }] },
    descriptor: { description: `fixture ${kind}`, dataShape: "{ title }" }
  };
}

describeStoreContract("sqlite", async () => {
  const path = freshPath();
  return { store: open(path), maxWidgets: LIMITS.maxWidgets, reopen: () => open(path) };
});

describe("sqlite adapter", () => {
  it("entries outlive the process: everything resolves after a reopen", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:durability", "Durable");
    await store.putSchema(p.id, { name: "person", schema: { type: "object" } });
    await store.putWidget(p.id, widget("invoice-card"));
    await store.putTheme(p.id, { name: "brand", tokens: { accent: "#123456" } });
    await store.putAction(p.id, {
      name: "refresh",
      definition: { kind: "http", method: "GET", url: "https://api.example.com/x", input: { type: "object" }, output: { type: "object" } }
    });
    await store.putSecret(p.id, "token", "sk-live-1234");
    const created = await store.createKey(p.id, "laptop", ["read", "execute"]);
    store.close();

    const reopened = open(path);
    expect((await reopened.ensurePrincipal("sqlite:durability")).id).toBe(p.id);
    expect((await reopened.widgets(p.id)).map((w) => w.kind)).toEqual(["invoice-card"]);
    expect((await reopened.themes(p.id)).map((t) => t.name)).toEqual(["brand"]);
    expect((await reopened.schemas(p.id)).map((s) => s.name)).toEqual(["person"]);
    expect((await reopened.actions(p.id)).map((a) => a.name)).toEqual(["refresh"]);
    expect((await reopened.listSecrets(p.id)).map((s) => s.name)).toEqual(["token"]);
    expect(await reopened.secretValue(p.id, "token")).toBe("sk-live-1234");
    // A key minted before the restart still resolves, with its scopes.
    const resolved = await reopened.resolvePrincipal(created.key);
    expect(resolved?.id).toBe(p.id);
    expect(resolved?.scopes).toEqual(["read", "execute"]);
    reopened.close();
  });

  it("a second connection over the same file sees a committed write", async () => {
    const path = freshPath();
    const writer = open(path);
    const reader = open(path);
    const p = await writer.ensurePrincipal("sqlite:two-connections");
    await writer.putWidget(p.id, widget("shared"));
    // No reopen: the reader connection was already up when the write landed.
    expect((await reader.widgets(p.id)).map((w) => w.kind)).toEqual(["shared"]);
    writer.close();
    reader.close();
  });

  it("a refused write leaves nothing behind", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:atomic");
    // Refused mid-transaction (the ref check runs inside it): no row remains.
    const refWidget: StoredWidget = {
      ...widget("dangling"),
      descriptor: { ...widget("dangling").descriptor, dataSchemaRef: "missing" }
    };
    await expect(store.putWidget(p.id, refWidget)).rejects.toMatchObject({ code: "UNKNOWN_SCHEMA" });
    expect(await store.widgets(p.id)).toEqual([]);
    // Refused at the count limit: the overflow write leaves no row either.
    for (let i = 0; i < LIMITS.maxWidgets; i++) await store.putWidget(p.id, widget(`w${i}`));
    await expect(store.putWidget(p.id, widget("overflow"))).rejects.toMatchObject({ code: "TOO_MANY_WIDGETS" });
    expect((await store.widgets(p.id)).map((w) => w.kind)).not.toContain("overflow");
    store.close();
  });

  it("the file holds digests and ciphertext, never key material or plaintext", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:content");
    const secretValue = "sk-live-super-secret-value";
    await store.putSecret(p.id, "api-token", secretValue);
    const created = await store.createKey(p.id, "laptop");
    store.close(); // checkpoints the WAL so the main file carries everything

    const dir = join(path, "..");
    const bytes = readdirSync(dir)
      .map((name) => readFileSync(join(dir, name), "latin1"))
      .join("");
    expect(bytes).not.toContain(created.key);
    expect(bytes).not.toContain(secretValue);
    expect(bytes).toContain("sha256:");

    // And the digest is enough to resolve — one indexed lookup.
    const reopened = open(path);
    expect((await reopened.resolvePrincipal(created.key))?.id).toBe(p.id);
    reopened.close();
  });

  it("a wrong KEK fails resolution loudly and leaves records intact", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:wrong-kek");
    await store.putSecret(p.id, "token", "sk-live-1234");
    store.close();
    const wrong = createSqliteStore(path, {
      limits: LIMITS,
      cipher: createLocalCipher(generateLocalKek()),
      onDiagnostic: () => {}
    });
    await expect(wrong.secretValue(p.id, "token")).rejects.toMatchObject({ code: "DECRYPTION_FAILED" });
    expect((await wrong.listSecrets(p.id)).map((s) => s.name)).toEqual(["token"]);
    wrong.close();
  });

  it("a raw driver failure leaves the store as STORE_ERROR, never unwrapped", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:driver-failure");
    store.close();
    // The connection is gone: the next write fails inside the driver, and
    // the caller must see the store's fixed refusal, not sqlite detail.
    await expect(store.putWidget(p.id, widget("after-close"))).rejects.toMatchObject({ code: "STORE_ERROR" });
  });

  it("a null secret record is skipped on list and reads as a miss, not a failure", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:null-record");
    await store.putSecret(p.id, "good", "sk-live-good1234");
    store.close();
    const raw = new DatabaseSync(path);
    raw
      .prepare("INSERT INTO entries (principal_id, kind, name, json) VALUES (?, 'secret', 'broken', ?)")
      .run(p.id, JSON.stringify({ name: "broken", createdAt: "", updatedAt: "", record: null }));
    raw.close();
    const diagnostics: string[] = [];
    const reopened = createSqliteStore(path, { limits: LIMITS, cipher: createLocalCipher(KEK), onDiagnostic: (m) => diagnostics.push(m) });
    expect((await reopened.listSecrets(p.id)).map((s) => s.name)).toEqual(["good"]);
    expect(diagnostics.join("\n")).toContain("malformed secret");
    expect(await reopened.secretValue(p.id, "broken")).toBeUndefined();
    reopened.close();
  });

  it("truncating a read to the configured limit is reported, never silent", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:truncation");
    store.close();
    const raw = new DatabaseSync(path);
    for (let i = 0; i < LIMITS.maxWidgets + 2; i++) {
      raw
        .prepare("INSERT INTO entries (principal_id, kind, name, json) VALUES (?, 'widget', ?, ?)")
        .run(p.id, `w${i}`, JSON.stringify(widget(`w${i}`)));
    }
    raw.close();
    const diagnostics: string[] = [];
    const reopened = createSqliteStore(path, { limits: LIMITS, cipher: createLocalCipher(KEK), onDiagnostic: (m) => diagnostics.push(m) });
    expect((await reopened.widgets(p.id)).length).toBe(LIMITS.maxWidgets);
    expect(diagnostics.join("\n")).toContain(`first ${LIMITS.maxWidgets} of ${LIMITS.maxWidgets + 2}`);
    reopened.close();
  });

  it("refuses a database written by a newer package", () => {
    const path = freshPath();
    open(path).close();
    const raw = new DatabaseSync(path);
    raw.exec("PRAGMA user_version = 99;");
    raw.close();
    expect(() => open(path)).toThrow(/schema version 99/);
  });

  it("refuses secrets without a cipher, and serves everything else", async () => {
    const path = freshPath();
    const bare = createSqliteStore(path, { limits: LIMITS, onDiagnostic: () => {} });
    const p = await bare.ensurePrincipal("sqlite:no-cipher");
    await bare.putWidget(p.id, widget("works"));
    expect((await bare.widgets(p.id)).map((w) => w.kind)).toEqual(["works"]);
    await expect(bare.putSecret(p.id, "token", "sk-live-1234")).rejects.toMatchObject({ code: "NO_CIPHER" });
    await expect(bare.secretValue(p.id, "token")).rejects.toBeInstanceOf(StoreRejectionError);
    bare.close();
  });

  it("skips an invalid stored row with a diagnostic instead of failing the principal", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:bad-row");
    await store.putWidget(p.id, widget("good"));
    store.close();
    // Corrupt one row out-of-band — the store must serve the rest.
    const raw = new DatabaseSync(path);
    raw
      .prepare("INSERT INTO entries (principal_id, kind, name, json) VALUES (?, 'widget', 'evil', ?)")
      .run(p.id, JSON.stringify({ kind: "evil", template: { tag: "script" }, descriptor: { description: "x", dataShape: "{}" } }));
    raw.close();
    const diagnostics: string[] = [];
    const reopened = createSqliteStore(path, {
      limits: LIMITS,
      cipher: createLocalCipher(KEK),
      onDiagnostic: (m) => diagnostics.push(m)
    });
    expect((await reopened.widgets(p.id)).map((w) => w.kind)).toEqual(["good"]);
    expect(diagnostics.join("\n")).toContain("evil".slice(0, 0) + "skipped a widget");
    reopened.close();
  });

  it("an unreadable action is skipped on read, so listings serve the rest", async () => {
    const path = freshPath();
    const store = open(path);
    const p = await store.ensurePrincipal("sqlite:bad-action");
    await store.putAction(p.id, {
      name: "weather",
      definition: {
        kind: "http",
        method: "GET",
        url: "https://api.example.com/weather",
        input: { type: "object", properties: { city: { type: "string" } } },
        output: { type: "object", properties: { temp_c: { type: "number" } } }
      }
    });
    store.close();
    // A definition the validator refuses (http: URL) reaching the table by
    // a manual edit or an older writer.
    const raw = new DatabaseSync(path);
    raw
      .prepare("INSERT INTO entries (principal_id, kind, name, json) VALUES (?, 'action', 'insecure', ?)")
      .run(
        p.id,
        JSON.stringify({
          name: "insecure",
          definition: {
            kind: "http",
            method: "GET",
            url: "http://api.example.com/x",
            input: { type: "object" },
            output: { type: "object" }
          }
        })
      );
    raw.close();
    const reopened = createSqliteStore(path, {
      limits: LIMITS,
      cipher: createLocalCipher(KEK),
      onDiagnostic: () => {}
    });
    expect((await reopened.actions(p.id)).map((a) => a.name)).toEqual(["weather"]);
    reopened.close();
  });
});
