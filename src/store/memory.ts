/**
 * In-memory store — tests, demos, and the seed for the file store's
 * fixtures. Writes are validated and limit-checked; reads hand back deep
 * copies so a caller cannot mutate another request's view. Implements the
 * full writable port, so the write contract is testable without a database.
 */
import { randomBytes } from "node:crypto";
import type { ThemeEntry } from "widgentic/theming";
import { findByKey, generateKey, hashKey } from "./keys.js";
import type {
  CreatedKey,
  Principal,
  StoreLimits,
  StoredKey,
  StoredWidget,
  WritableWidgetStore
} from "./types.js";
import {
  DEFAULT_LIMITS,
  principalIdForSubject,
  StoreRejectionError
} from "./types.js";
import { checkStoredTheme, checkStoredWidget } from "./validate.js";

/** A principal plus its material, as callers seed it. */
export interface MemorySeedPrincipal {
  principal: Principal;
  /** Raw key — hashed on the way in; the store keeps only the digest. */
  apiKey?: string;
  widgets?: StoredWidget[];
  themes?: ThemeEntry[];
}

interface KeyRecord extends StoredKey {
  digest: string;
}

interface Record_ {
  principal: Principal;
  /** External identity subject, when the principal came from `ensurePrincipal`. */
  subject?: string;
  keys: KeyRecord[];
  widgets: Map<string, StoredWidget>;
  themes: Map<string, ThemeEntry>;
}

export interface MemoryStore extends WritableWidgetStore {
  /** Serializable snapshot — digests only, never key material. */
  snapshot(): unknown;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function publicKey(key: KeyRecord): StoredKey {
  const { digest: _digest, ...entry } = key;
  return clone(entry);
}

export function createMemoryStore(
  seed: MemorySeedPrincipal[] = [],
  limits: StoreLimits = DEFAULT_LIMITS
): MemoryStore {
  const records = new Map<string, Record_>();

  function record(principalId: string): Record_ | undefined {
    return records.get(principalId);
  }

  function makeKeyRecord(name: string, rawKey: string): KeyRecord {
    const digest = hashKey(rawKey);
    return {
      id: `key_${randomBytes(8).toString("hex")}`,
      name,
      createdAt: new Date().toISOString(),
      scopes: ["read"],
      digest,
      digestPreview: digest.slice("sha256:".length, "sha256:".length + 8)
    };
  }

  for (const entry of seed) {
    const created: Record_ = {
      principal: entry.principal,
      keys: entry.apiKey === undefined ? [] : [makeKeyRecord("seed", entry.apiKey)],
      widgets: new Map(),
      themes: new Map()
    };
    records.set(entry.principal.id, created);
    for (const widget of entry.widgets ?? []) {
      const problem = checkStoredWidget(widget, limits);
      if (problem) {
        throw new StoreRejectionError(problem.code, `${widget.kind}: ${problem.message}`);
      }
      created.widgets.set(widget.kind, clone(widget));
    }
    for (const theme of entry.themes ?? []) {
      const problem = checkStoredTheme(theme, limits);
      if (problem) {
        throw new StoreRejectionError(problem.code, `${theme.name}: ${problem.message}`);
      }
      created.themes.set(theme.name, clone(theme));
    }
  }

  return {
    async resolvePrincipal(apiKey) {
      if (typeof apiKey !== "string" || apiKey === "") return undefined;
      // Every live key of every principal is a candidate; comparison work
      // is independent of which (if any) matches. Revoked keys are not
      // candidates — a revoked key is exactly an unknown one.
      const candidates = [...records.values()].flatMap((r) =>
        r.keys
          .filter((k) => k.revokedAt === undefined)
          .map((k) => ({ keyDigest: k.digest, principal: r.principal }))
      );
      return findByKey(apiKey, candidates)?.principal;
    },
    async widgets(principalId) {
      return [...(record(principalId)?.widgets.values() ?? [])].map(clone);
    },
    async themes(principalId) {
      return [...(record(principalId)?.themes.values() ?? [])].map(clone);
    },
    async putWidget(principalId, widget) {
      const target = record(principalId);
      if (target === undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      const problem = checkStoredWidget(widget, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      if (
        !target.widgets.has(widget.kind) &&
        target.widgets.size >= limits.maxWidgets
      ) {
        throw new StoreRejectionError(
          "TOO_MANY_WIDGETS",
          `principal is at the ${limits.maxWidgets}-widget limit.`
        );
      }
      target.widgets.set(widget.kind, clone(widget));
    },
    async putTheme(principalId, theme) {
      const target = record(principalId);
      if (target === undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      const problem = checkStoredTheme(theme, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      if (!target.themes.has(theme.name) && target.themes.size >= limits.maxThemes) {
        throw new StoreRejectionError(
          "TOO_MANY_THEMES",
          `principal is at the ${limits.maxThemes}-theme limit.`
        );
      }
      target.themes.set(theme.name, clone(theme));
    },
    async removeWidget(principalId, kind) {
      record(principalId)?.widgets.delete(kind);
    },
    async removeTheme(principalId, name) {
      record(principalId)?.themes.delete(name);
    },
    async ensurePrincipal(subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      const id = principalIdForSubject(subject);
      const existing = records.get(id);
      if (existing !== undefined) return clone(existing.principal);
      const principal: Principal = {
        id,
        ...(label === undefined ? {} : { label }),
        scopes: ["read", "write"]
      };
      records.set(id, {
        principal,
        subject,
        keys: [],
        widgets: new Map(),
        themes: new Map()
      });
      return clone(principal);
    },
    async createKey(principalId, name) {
      const target = record(principalId);
      if (target === undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      if (typeof name !== "string" || name.trim() === "") {
        throw new StoreRejectionError("INVALID_KEY_NAME", "key name must be non-empty.");
      }
      const raw = generateKey();
      const entry = makeKeyRecord(name.trim(), raw);
      target.keys.push(entry);
      const created: CreatedKey = { key: raw, entry: publicKey(entry) };
      return created;
    },
    async listKeys(principalId) {
      return (record(principalId)?.keys ?? []).map(publicKey);
    },
    async revokeKey(principalId, keyId) {
      const target = record(principalId);
      if (target === undefined) {
        throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
      }
      const key = target.keys.find((k) => k.id === keyId);
      if (key === undefined) {
        throw new StoreRejectionError("UNKNOWN_KEY", keyId);
      }
      if (key.revokedAt === undefined) key.revokedAt = new Date().toISOString();
    },
    snapshot() {
      return [...records.values()].map((r) => ({
        principal: r.principal,
        keys: r.keys.map((k) => ({ ...publicKey(k), digest: k.digest })),
        widgets: [...r.widgets.values()],
        themes: [...r.themes.values()]
      }));
    }
  };
}
