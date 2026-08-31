/**
 * SQLite adapter for the widgentic store port — the single-node durable
 * implementation, built on the Node runtime's own SQLite (`node:sqlite`), so
 * it requires no dependency: not even an optional peer. Ships from its own
 * entry (`@widgentic/mcp/store/sqlite`).
 *
 * Layout (design D2): one database file, four tables.
 *   principals(id PK, subject, label, scopes)
 *   subjects(subject PK, principal_id, label)      — linked identities
 *   entries(principal_id, kind, name, json)        — PK(principal_id, kind, name),
 *     kind ∈ widget | theme | schema | action | secret; `json` holds the
 *     validated entry exactly as the port defines it (secrets: ciphertext
 *     records only)
 *   keys(digest PK, principal_id, key_id, name, scopes, created_at, revoked_at)
 *
 * Composition reads one principal's entries as a single indexed range scan —
 * the same access shape as the Cosmos single-partition query — and key
 * resolution is a primary-key lookup on the presented key's digest. The
 * database never holds raw key material or plaintext secret values.
 *
 * Two processes may share the file (an authoring app writing, an MCP edge
 * reading): WAL keeps readers running during a write, `busy_timeout` absorbs
 * the writer lock, and every write runs in one transaction so a refusal
 * leaves nothing behind. Statements are SYNCHRONOUS (`DatabaseSync`) and
 * block the event loop for their duration — acceptable for point and range
 * queries over data bounded by the store limits; a deployment past that
 * ceiling wants a server database, not this adapter.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import type { ThemeEntry } from "@widgentic/core";
import type { StoredAction } from "@widgentic/core";
import { checkSecretName, decryptSecret, encryptSecret } from "../secrets/index.js";
import type { EnvelopeRecord, SecretCipher } from "../secrets/index.js";
import { asStoreRejection } from "./errors.js";
import { generateKey, hashKey } from "./keys.js";
import {
  isGetHttp,
  loadRefOf,
  looseAction,
  looseWidget,
  referencesToSecret,
  widgetsLoadingAction,
  widgetsReferencingAction
} from "./refs.js";
import type {
  CreatedKey,
  Principal,
  Scope,
  StoreLimits,
  StoredKey,
  StoredSchema,
  StoredSecret,
  StoredWidget,
  WritableWidgetStore
} from "./types.js";
import {
  DEFAULT_LIMITS,
  KEY_SCOPES,
  normalizeKeyScopes,
  principalIdForSubject,
  StoreRejectionError
} from "./types.js";
import {
  checkStoredAction,
  checkStoredSchema,
  checkStoredTheme,
  checkStoredWidget
} from "./validate.js";

/** Bumped only with a persisted-shape change, which ships with its seam. */
const SCHEMA_VERSION = 1;

type EntryKind = "widget" | "theme" | "schema" | "action" | "secret";

export interface SqliteStoreOptions {
  limits?: StoreLimits;
  /** Report entries the store refuses to serve (defaults to stderr). */
  onDiagnostic?: (message: string) => void;
  /** Enables secrets; without it `putSecret`/`secretValue` refuse with `NO_CIPHER`. */
  cipher?: SecretCipher;
}

interface PrincipalRow {
  id: string;
  subject: string | null;
  label: string | null;
  scopes: string;
}

interface KeyRow {
  digest: string;
  principal_id: string;
  key_id: string;
  name: string;
  scopes: string;
  created_at: string;
  revoked_at: string | null;
}

function parseScopes(json: string): Scope[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed.filter((s) => typeof s === "string") as Scope[]) : [];
  } catch {
    return [];
  }
}

/**
 * The scopes a stored key grants: decoded, narrowed to key-grantable ones,
 * normalized. One derivation for the key listing and for resolution, so what
 * a key shows is always what it grants.
 */
function keyScopesFrom(json: string): Scope[] {
  return normalizeKeyScopes(parseScopes(json).filter((s) => KEY_SCOPES.some((allowed) => allowed === s)));
}

function rowPrincipal(row: PrincipalRow): Principal {
  return {
    id: row.id,
    ...(row.label === null ? {} : { label: row.label }),
    scopes: parseScopes(row.scopes)
  };
}

export function createSqliteStore(
  path: string,
  options: SqliteStoreOptions = {}
): WritableWidgetStore & { close(): void } {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const cipher = options.cipher;
  const report =
    options.onDiagnostic ??
    ((message: string) => console.error(`widgentic store: ${message}`));

  // `process.getBuiltinModule` instead of a static import: the module stays
  // loadable by bundler-driven tooling that refuses to bundle `node:sqlite`,
  // while the adapter itself always runs on Node. The builtin needs a newer
  // floor than the package's, so its absence is named instead of surfacing
  // as a TypeError on the destructure.
  const sqlite =
    typeof process.getBuiltinModule === "function"
      ? (process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined)
      : undefined;
  if (sqlite === undefined) {
    throw new Error("createSqliteStore needs Node >= 22.5, where node:sqlite is available.");
  }
  const db: SqliteDatabase = new sqlite.DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");

  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS principals (
        id TEXT PRIMARY KEY,
        subject TEXT,
        label TEXT,
        scopes TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subjects (
        subject TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES principals(id),
        label TEXT
      );
      CREATE TABLE IF NOT EXISTS entries (
        principal_id TEXT NOT NULL REFERENCES principals(id),
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (principal_id, kind, name)
      );
      CREATE TABLE IF NOT EXISTS keys (
        digest TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES principals(id),
        key_id TEXT NOT NULL,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS subjects_principal ON subjects(principal_id);
      CREATE INDEX IF NOT EXISTS keys_principal ON keys(principal_id);
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  } else if (version !== SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `widgentic sqlite store: '${path}' has schema version ${version}, this adapter knows ${SCHEMA_VERSION} — it was written by a newer package.`
    );
  }

  /**
   * One transaction per write: committed whole or not at all (design D5).
   * Every failure leaving here is a StoreRejectionError — a raw driver error
   * (SQLITE_BUSY past the timeout, a full disk, a read-only volume) becomes
   * STORE_ERROR with a fixed message, so no backend detail reaches callers.
   */
  function tx<T>(work: () => T): T {
    try {
      db.exec("BEGIN IMMEDIATE;");
    } catch (error) {
      throw asStoreRejection(error, "write failed.");
    }
    try {
      const result = work();
      db.exec("COMMIT;");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // Some failures abort the transaction on their own; the original
        // error is the one worth surfacing.
      }
      throw asStoreRejection(error, "write failed.");
    }
  }

  function principalRow(id: string): PrincipalRow | undefined {
    return db.prepare("SELECT id, subject, label, scopes FROM principals WHERE id = ?").get(id) as
      | PrincipalRow
      | undefined;
  }

  function requirePrincipal(id: string): PrincipalRow {
    const row = principalRow(id);
    if (row === undefined) throw new StoreRejectionError("UNKNOWN_PRINCIPAL", id);
    return row;
  }

  function requireCipher(): SecretCipher {
    if (cipher === undefined) {
      throw new StoreRejectionError("NO_CIPHER", "this store was built without a secret cipher.");
    }
    return cipher;
  }

  /** Raw entry JSON for one principal and kind, in name order. */
  function rawEntries(principalId: string, kind: EntryKind): unknown[] {
    const rows = db
      .prepare("SELECT json FROM entries WHERE principal_id = ? AND kind = ? ORDER BY name")
      .all(principalId, kind) as Array<{ json: string }>;
    const out: unknown[] = [];
    for (const row of rows) {
      try {
        out.push(JSON.parse(row.json) as unknown);
      } catch {
        report(`skipped an unreadable ${kind} row for '${principalId}'.`);
      }
    }
    return out;
  }

  function rawEntry(principalId: string, kind: EntryKind, name: string): unknown {
    const row = db
      .prepare("SELECT json FROM entries WHERE principal_id = ? AND kind = ? AND name = ?")
      .get(principalId, kind, name) as { json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      return JSON.parse(row.json) as unknown;
    } catch {
      report(`skipped an unreadable ${kind} row for '${principalId}'.`);
      return undefined;
    }
  }

  /** Existence without fetching the row's json blob. */
  function entryExists(principalId: string, kind: EntryKind, name: string): boolean {
    return (
      db
        .prepare("SELECT 1 FROM entries WHERE principal_id = ? AND kind = ? AND name = ? LIMIT 1")
        .get(principalId, kind, name) !== undefined
    );
  }

  function entryCount(principalId: string, kind: EntryKind): number {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM entries WHERE principal_id = ? AND kind = ?")
      .get(principalId, kind) as { n: number };
    return row.n;
  }

  function upsertEntry(principalId: string, kind: EntryKind, name: string, value: unknown): void {
    db.prepare(
      `INSERT INTO entries (principal_id, kind, name, json) VALUES (?, ?, ?, ?)
       ON CONFLICT(principal_id, kind, name) DO UPDATE SET json = excluded.json`
    ).run(principalId, kind, name, JSON.stringify(value));
  }

  /**
   * The count limit, checked inside the write transaction: a replace of an
   * existing name is never a new entry.
   */
  function checkCountLimit(
    principalId: string,
    kind: EntryKind,
    name: string,
    max: number,
    code: "TOO_MANY_WIDGETS" | "TOO_MANY_THEMES" | "TOO_MANY_SCHEMAS" | "TOO_MANY_ACTIONS" | "TOO_MANY_SECRETS",
    noun: string
  ): void {
    if (!entryExists(principalId, kind, name) && entryCount(principalId, kind) >= max) {
      throw new StoreRejectionError(code, `principal is at the ${max}-${noun} limit.`);
    }
  }

  /** RAW widgets/actions for reference scans — a malformed row still holds its references. */
  function scanWidgets(principalId: string): StoredWidget[] {
    return rawEntries(principalId, "widget")
      .map(looseWidget)
      .filter((w): w is StoredWidget => w !== undefined);
  }

  function scanActions(principalId: string): StoredAction[] {
    return rawEntries(principalId, "action")
      .map(looseAction)
      .filter((a): a is StoredAction => a !== undefined);
  }

  function makeKeyRow(principalId: string, name: string, rawKey: string, scopes: Scope[]): KeyRow {
    const digest = hashKey(rawKey);
    return {
      digest,
      principal_id: principalId,
      key_id: `key_${randomBytes(8).toString("hex")}`,
      name,
      scopes: JSON.stringify(scopes),
      created_at: new Date().toISOString(),
      revoked_at: null
    };
  }

  function publicKey(row: KeyRow): StoredKey {
    return {
      id: row.key_id,
      name: row.name,
      createdAt: row.created_at,
      ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
      scopes: keyScopesFrom(row.scopes),
      digestPreview: row.digest.slice("sha256:".length, "sha256:".length + 8)
    };
  }

  return {
    close() {
      db.close();
    },

    async resolvePrincipal(apiKey) {
      if (typeof apiKey !== "string" || apiKey === "") return undefined;
      // One indexed lookup on the digest: the presented key is hashed and
      // the digest is the primary key, compared by the database as an
      // opaque string — lookup timing reveals nothing about key material.
      const key = db
        .prepare("SELECT * FROM keys WHERE digest = ? AND revoked_at IS NULL")
        .get(hashKey(apiKey)) as KeyRow | undefined;
      if (key === undefined) return undefined;
      const row = principalRow(key.principal_id);
      if (row === undefined) return undefined;
      // The KEY's scopes travel; the identity subject never does.
      return { id: row.id, ...(row.label === null ? {} : { label: row.label }), scopes: keyScopesFrom(key.scopes) };
    },

    async widgets(principalId) {
      const out: StoredWidget[] = [];
      for (const entry of rawEntries(principalId, "widget")) {
        const problem = checkStoredWidget(entry, limits);
        if (problem) {
          // Skip, never throw: one bad row must not deny a principal their
          // remaining widgets, and must never reach a catalog.
          report(`skipped a widget for '${principalId}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as StoredWidget);
      }
      if (out.length > limits.maxWidgets) {
        report(`serving only the first ${limits.maxWidgets} of ${out.length} widgets for '${principalId}' (store limit).`);
      }
      return out.slice(0, limits.maxWidgets);
    },

    async themes(principalId) {
      const out: ThemeEntry[] = [];
      for (const entry of rawEntries(principalId, "theme")) {
        const problem = checkStoredTheme(entry, limits);
        if (problem) {
          report(`skipped a theme for '${principalId}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as ThemeEntry);
      }
      if (out.length > limits.maxThemes) {
        report(`serving only the first ${limits.maxThemes} of ${out.length} themes for '${principalId}' (store limit).`);
      }
      return out.slice(0, limits.maxThemes);
    },

    async schemas(principalId) {
      const out: StoredSchema[] = [];
      for (const entry of rawEntries(principalId, "schema")) {
        const problem = checkStoredSchema(entry, limits);
        if (problem) {
          report(`skipped a schema for '${principalId}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as StoredSchema);
      }
      if (out.length > limits.maxSchemas) {
        report(`serving only the first ${limits.maxSchemas} of ${out.length} schemas for '${principalId}' (store limit).`);
      }
      return out.slice(0, limits.maxSchemas);
    },

    async actions(principalId) {
      const out: StoredAction[] = [];
      for (const entry of rawEntries(principalId, "action")) {
        const problem = checkStoredAction(entry, limits);
        if (problem) {
          report(`skipped an action for '${principalId}': ${problem.code} — ${problem.message}`);
          continue;
        }
        out.push(entry as StoredAction);
      }
      if (out.length > limits.maxActions) {
        report(`serving only the first ${limits.maxActions} of ${out.length} actions for '${principalId}' (store limit).`);
      }
      return out.slice(0, limits.maxActions);
    },

    async listSecrets(principalId) {
      const out = [];
      for (const entry of rawEntries(principalId, "secret")) {
        const stored = entry as Partial<StoredSecret>;
        if (typeof stored.name !== "string" || typeof stored.record !== "object" || stored.record === null) {
          report(`skipped a malformed secret record for '${principalId}'.`);
          continue;
        }
        out.push({
          name: stored.name,
          createdAt: typeof stored.createdAt === "string" ? stored.createdAt : "",
          updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : ""
        });
      }
      if (out.length > limits.maxSecrets) {
        report(`serving only the first ${limits.maxSecrets} of ${out.length} secrets for '${principalId}' (store limit).`);
      }
      return out.slice(0, limits.maxSecrets);
    },

    async secretValue(principalId, name) {
      const active = requireCipher();
      if (checkSecretName(name) !== undefined) return undefined;
      const stored = rawEntry(principalId, "secret", name) as Partial<StoredSecret> | undefined;
      // A malformed record reads as a miss, like every other invalid row —
      // execution then fails cleanly with UNKNOWN_SECRET, not a store error.
      if (stored === undefined || typeof stored.record !== "object" || stored.record === null) return undefined;
      try {
        return await decryptSecret(stored.record, active);
      } catch (error) {
        throw asStoreRejection(error, "secret could not be decrypted.");
      }
    },

    async putWidget(principalId, widget) {
      const problem = checkStoredWidget(widget, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      tx(() => {
        requirePrincipal(principalId);
        checkCountLimit(principalId, "widget", widget.kind, limits.maxWidgets, "TOO_MANY_WIDGETS", "widget");
        // A ref must name a schema the principal actually stores — refusing
        // here keeps dangling refs an out-of-band-only condition.
        const ref = widget.descriptor.dataSchemaRef;
        if (ref !== undefined && !entryExists(principalId, "schema", ref)) {
          throw new StoreRejectionError("UNKNOWN_SCHEMA", `widget references missing schema '${ref}'.`);
        }
        // A `load` through a shared action needs that action to be a GET now;
        // a dangling ref stays non-fatal (it renders disabled).
        const loadRef = loadRefOf(widget);
        const loadTarget = loadRef === undefined ? undefined : looseAction(rawEntry(principalId, "action", loadRef));
        if (loadTarget !== undefined && !isGetHttp(loadTarget.definition)) {
          throw new StoreRejectionError(
            "INVALID_ACTION",
            `load references '${loadRef}', which is not an http GET action.`
          );
        }
        upsertEntry(principalId, "widget", widget.kind, widget);
      });
    },

    async putTheme(principalId, theme) {
      const problem = checkStoredTheme(theme, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      tx(() => {
        requirePrincipal(principalId);
        checkCountLimit(principalId, "theme", theme.name, limits.maxThemes, "TOO_MANY_THEMES", "theme");
        upsertEntry(principalId, "theme", theme.name, theme);
      });
    },

    async putSchema(principalId, schema) {
      const problem = checkStoredSchema(schema, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      tx(() => {
        requirePrincipal(principalId);
        checkCountLimit(principalId, "schema", schema.name, limits.maxSchemas, "TOO_MANY_SCHEMAS", "schema");
        upsertEntry(principalId, "schema", schema.name, schema);
      });
    },

    async putAction(principalId, action) {
      const problem = checkStoredAction(action, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      tx(() => {
        requirePrincipal(principalId);
        checkCountLimit(principalId, "action", action.name, limits.maxActions, "TOO_MANY_ACTIONS", "action");
        if (!isGetHttp(action.definition)) {
          const loaders = widgetsLoadingAction(scanWidgets(principalId), action.name);
          if (loaders.length > 0) {
            throw new StoreRejectionError(
              "ACTION_IN_USE",
              `action '${action.name}' is the load of: ${loaders.join(", ")}; a load must stay an http GET.`
            );
          }
        }
        upsertEntry(principalId, "action", action.name, action);
      });
    },

    async putSecret(principalId, name, value) {
      const active = requireCipher();
      const nameError = checkSecretName(name);
      if (nameError) throw new StoreRejectionError(nameError.code, nameError.message);
      // Encryption is pure computation over the value; it happens before the
      // transaction so the write lock is held only for the row itself.
      let record: EnvelopeRecord;
      try {
        record = await encryptSecret(value, active);
      } catch (error) {
        throw asStoreRejection(error, "secret could not be encrypted.");
      }
      tx(() => {
        requirePrincipal(principalId);
        checkCountLimit(principalId, "secret", name, limits.maxSecrets, "TOO_MANY_SECRETS", "secret");
        const now = new Date().toISOString();
        const existing = rawEntry(principalId, "secret", name) as Partial<StoredSecret> | undefined;
        const stored: StoredSecret = {
          name,
          createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
          updatedAt: now,
          record
        };
        upsertEntry(principalId, "secret", name, stored);
      });
    },

    async removeWidget(principalId, kind) {
      tx(() => {
        db.prepare("DELETE FROM entries WHERE principal_id = ? AND kind = 'widget' AND name = ?").run(principalId, kind);
      });
    },

    async removeTheme(principalId, name) {
      tx(() => {
        db.prepare("DELETE FROM entries WHERE principal_id = ? AND kind = 'theme' AND name = ?").run(principalId, name);
      });
    },

    async removeSchema(principalId, name) {
      tx(() => {
        // The reference check runs in the SAME transaction as the delete, so
        // a widget written concurrently cannot slip a dangling ref past it.
        const referencing = scanWidgets(principalId)
          .filter((w) => w.descriptor.dataSchemaRef === name)
          .map((w) => w.kind);
        if (referencing.length > 0) {
          throw new StoreRejectionError("SCHEMA_IN_USE", `schema '${name}' is referenced by: ${referencing.join(", ")}.`);
        }
        db.prepare("DELETE FROM entries WHERE principal_id = ? AND kind = 'schema' AND name = ?").run(principalId, name);
      });
    },

    async removeAction(principalId, name) {
      tx(() => {
        const referencing = widgetsReferencingAction(scanWidgets(principalId), name);
        if (referencing.length > 0) {
          throw new StoreRejectionError("ACTION_IN_USE", `action '${name}' is referenced by: ${referencing.join(", ")}.`);
        }
        db.prepare("DELETE FROM entries WHERE principal_id = ? AND kind = 'action' AND name = ?").run(principalId, name);
      });
    },

    async removeSecret(principalId, name) {
      tx(() => {
        const referencing = referencesToSecret(scanActions(principalId), scanWidgets(principalId), name);
        if (referencing.length > 0) {
          throw new StoreRejectionError("SECRET_IN_USE", `secret '${name}' is referenced by: ${referencing.join(", ")}.`);
        }
        db.prepare("DELETE FROM entries WHERE principal_id = ? AND kind = 'secret' AND name = ?").run(principalId, name);
      });
    },

    async ensurePrincipal(subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      const resolve = (): Principal | undefined => {
        const alias = db.prepare("SELECT principal_id FROM subjects WHERE subject = ?").get(subject) as
          | { principal_id: string }
          | undefined;
        const row = principalRow(alias?.principal_id ?? principalIdForSubject(subject));
        if (row === undefined) return undefined;
        return { ...rowPrincipal(row), ...(row.subject === null ? {} : { subject: row.subject }) };
      };
      // Hosts ensure per request, so the common case must not take the
      // writer lock: read first, transact only to create — and re-check
      // inside, since another process may have created it meanwhile.
      const existing = resolve();
      if (existing !== undefined) return existing;
      return tx(() => {
        const raced = resolve();
        if (raced !== undefined) return raced;
        const principal: Principal = {
          id: principalIdForSubject(subject),
          ...(label === undefined ? {} : { label }),
          scopes: ["read", "write"],
          subject
        };
        db.prepare("INSERT INTO principals (id, subject, label, scopes) VALUES (?, ?, ?, ?)").run(
          principal.id,
          subject,
          label ?? null,
          JSON.stringify(principal.scopes)
        );
        return principal;
      });
    },

    async linkSubject(principalId, subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      tx(() => {
        const target = requirePrincipal(principalId);
        if (subject === target.subject) return; // canonical already resolves here
        const alias = db.prepare("SELECT principal_id FROM subjects WHERE subject = ?").get(subject) as
          | { principal_id: string }
          | undefined;
        if (alias !== undefined) {
          if (alias.principal_id === principalId) return; // idempotent
          // A subject deliberately linked elsewhere is never stolen.
          throw new StoreRejectionError("SUBJECT_IN_USE", "subject already resolves to another account.");
        }
        const ownedId = principalIdForSubject(subject);
        const owned = principalRow(ownedId);
        if (owned !== undefined) {
          const hasEntries = (db
            .prepare("SELECT COUNT(*) AS n FROM entries WHERE principal_id = ?")
            .get(ownedId) as { n: number }).n > 0;
          const hasLiveKeys = (db
            .prepare("SELECT COUNT(*) AS n FROM keys WHERE principal_id = ? AND revoked_at IS NULL")
            .get(ownedId) as { n: number }).n > 0;
          if (hasEntries || hasLiveKeys) {
            throw new StoreRejectionError(
              "SUBJECT_IN_USE",
              "subject already owns an account with content — remove its widgets, themes, schemas, actions, secrets, and keys first."
            );
          }
          // Absorb the empty principal: its revoked keys and aliases go with it.
          db.prepare("DELETE FROM keys WHERE principal_id = ?").run(ownedId);
          db.prepare("DELETE FROM subjects WHERE principal_id = ?").run(ownedId);
          db.prepare("DELETE FROM principals WHERE id = ?").run(ownedId);
        }
        db.prepare("INSERT INTO subjects (subject, principal_id, label) VALUES (?, ?, ?)").run(
          subject,
          principalId,
          label ?? null
        );
      });
    },

    async unlinkSubject(principalId, subject) {
      tx(() => {
        const target = requirePrincipal(principalId);
        if (subject === target.subject) {
          throw new StoreRejectionError("CANNOT_UNLINK_PRIMARY", "the account's primary identity cannot be unlinked.");
        }
        db.prepare("DELETE FROM subjects WHERE subject = ? AND principal_id = ?").run(subject, principalId);
      });
    },

    async listLinkedSubjects(principalId) {
      requirePrincipal(principalId);
      const rows = db
        .prepare("SELECT subject, label FROM subjects WHERE principal_id = ? ORDER BY subject")
        .all(principalId) as Array<{ subject: string; label: string | null }>;
      return rows.map((row) => ({
        subject: row.subject,
        ...(row.label === null ? {} : { label: row.label })
      }));
    },

    async createKey(principalId, name, scopes) {
      if (typeof name !== "string" || name.trim() === "") {
        throw new StoreRejectionError("INVALID_KEY_NAME", "key name must be non-empty.");
      }
      const granted = normalizeKeyScopes(scopes);
      const raw = generateKey();
      const row = makeKeyRow(principalId, name.trim(), raw, granted);
      tx(() => {
        requirePrincipal(principalId);
        db.prepare(
          "INSERT INTO keys (digest, principal_id, key_id, name, scopes, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)"
        ).run(row.digest, row.principal_id, row.key_id, row.name, row.scopes, row.created_at);
      });
      const created: CreatedKey = { key: raw, entry: publicKey(row) };
      return created;
    },

    async listKeys(principalId) {
      const rows = db
        .prepare("SELECT * FROM keys WHERE principal_id = ? ORDER BY created_at, key_id")
        .all(principalId) as unknown as KeyRow[];
      return rows.map(publicKey);
    },

    async revokeKey(principalId, keyId) {
      tx(() => {
        requirePrincipal(principalId);
        const row = db
          .prepare("SELECT digest, revoked_at FROM keys WHERE principal_id = ? AND key_id = ?")
          .get(principalId, keyId) as { digest: string; revoked_at: string | null } | undefined;
        if (row === undefined) throw new StoreRejectionError("UNKNOWN_KEY", keyId);
        if (row.revoked_at === null) {
          db.prepare("UPDATE keys SET revoked_at = ? WHERE digest = ?").run(new Date().toISOString(), row.digest);
        }
      });
    }
  };
}
