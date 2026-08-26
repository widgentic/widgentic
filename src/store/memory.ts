/**
 * In-memory store — tests, demos, and the seed for the file store's
 * fixtures. Writes are validated and limit-checked; reads hand back deep
 * copies so a caller cannot mutate another request's view. Implements the
 * full writable port, so the write contract is testable without a database.
 */
import { randomBytes } from "node:crypto";
import type { ThemeEntry } from "widgentic/theming";
import type { StoredAction } from "widgentic/actions";
import { collectSecretRefs } from "widgentic/actions";
import { collectActionRefs, collectInlineActions } from "widgentic/templates";
import {
  checkSecretName,
  decryptSecret,
  encryptSecret,
  SecretError
} from "widgentic/secrets";
import type { SecretCipher } from "widgentic/secrets";
import { findByKey, generateKey, hashKey } from "./keys.js";
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

/** A principal plus its material, as callers seed it. */
export interface MemorySeedPrincipal {
  principal: Principal;
  /** Raw key — hashed on the way in; the store keeps only the digest. */
  apiKey?: string;
  widgets?: StoredWidget[];
  themes?: ThemeEntry[];
  schemas?: StoredSchema[];
  actions?: StoredAction[];
}

export interface MemoryStoreOptions {
  /** Enables `putSecret`/`secretValue`; without it both are refused. */
  cipher?: SecretCipher;
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
  schemas: Map<string, StoredSchema>;
  actions: Map<string, StoredAction>;
  secrets: Map<string, StoredSecret>;
}

export interface MemoryStore extends WritableWidgetStore {
  /** Serializable snapshot — digests and ciphertext only, never key material or values. */
  snapshot(): unknown;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function publicKey(key: KeyRecord): StoredKey {
  const { digest: _digest, ...entry } = key;
  return clone(entry);
}

/** Widgets binding the named shared action (by `ref`, in the template or `load`). */
export function widgetsReferencingAction(widgets: Iterable<StoredWidget>, name: string): string[] {
  return [...widgets]
    .filter((w) => collectActionRefs(w.template, w.load).includes(name))
    .map((w) => w.kind);
}

/** Actions (shared, or inline in widgets) referencing the named secret. */
export function referencesToSecret(
  actions: Iterable<StoredAction>,
  widgets: Iterable<StoredWidget>,
  name: string
): string[] {
  const out: string[] = [];
  for (const action of actions) {
    if (collectSecretRefs(action.definition).includes(name)) out.push(`action '${action.name}'`);
  }
  for (const widget of widgets) {
    const inline = collectInlineActions(widget.template, widget.load);
    if (inline.some((definition) => collectSecretRefs(definition).includes(name))) {
      out.push(`widget '${widget.kind}'`);
    }
  }
  return out;
}

export function createMemoryStore(
  seed: MemorySeedPrincipal[] = [],
  limits: StoreLimits = DEFAULT_LIMITS,
  options: MemoryStoreOptions = {}
): MemoryStore {
  const records = new Map<string, Record_>();
  // Alias resolution: derived-id-of-linked-subject -> canonical principal
  // id. Resolution truth for links; enumeration derives from it.
  const aliases = new Map<string, { subject: string; to: string; label?: string }>();
  const cipher = options.cipher;

  function record(principalId: string): Record_ | undefined {
    return records.get(principalId);
  }

  function requireRecord(principalId: string): Record_ {
    const target = record(principalId);
    if (target === undefined) throw new StoreRejectionError("UNKNOWN_PRINCIPAL", principalId);
    return target;
  }

  function requireCipher(): SecretCipher {
    if (cipher === undefined) {
      throw new StoreRejectionError("NO_CIPHER", "this store was built without a secret cipher.");
    }
    return cipher;
  }

  function makeKeyRecord(name: string, rawKey: string, scopes: Scope[]): KeyRecord {
    const digest = hashKey(rawKey);
    return {
      id: `key_${randomBytes(8).toString("hex")}`,
      name,
      createdAt: new Date().toISOString(),
      scopes,
      digest,
      digestPreview: digest.slice("sha256:".length, "sha256:".length + 8)
    };
  }

  for (const entry of seed) {
    // A seeded key carries the seeded principal's key-grantable scopes.
    const seedScopes = normalizeKeyScopes(
      entry.principal.scopes.filter((scope) => scope === "execute")
    );
    const created: Record_ = {
      principal: entry.principal,
      keys: entry.apiKey === undefined ? [] : [makeKeyRecord("seed", entry.apiKey, seedScopes)],
      widgets: new Map(),
      themes: new Map(),
      schemas: new Map(),
      actions: new Map(),
      secrets: new Map()
    };
    records.set(entry.principal.id, created);
    // Schemas and actions seed FIRST so seeded widgets may reference them.
    for (const schema of entry.schemas ?? []) {
      const problem = checkStoredSchema(schema, limits);
      if (problem) {
        throw new StoreRejectionError(problem.code, `${schema.name}: ${problem.message}`);
      }
      created.schemas.set(schema.name, clone(schema));
    }
    for (const action of entry.actions ?? []) {
      const problem = checkStoredAction(action, limits);
      if (problem) {
        throw new StoreRejectionError(problem.code, `${action.name}: ${problem.message}`);
      }
      created.actions.set(action.name, clone(action));
    }
    for (const widget of entry.widgets ?? []) {
      const problem = checkStoredWidget(widget, limits);
      if (problem) {
        throw new StoreRejectionError(problem.code, `${widget.kind}: ${problem.message}`);
      }
      const ref = widget.descriptor.dataSchemaRef;
      if (ref !== undefined && !created.schemas.has(ref)) {
        throw new StoreRejectionError("UNKNOWN_SCHEMA", `${widget.kind}: references missing schema '${ref}'.`);
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
      // candidates — a revoked key is exactly an unknown one. The match
      // carries the KEY's scopes, not the profile's.
      const candidates = [...records.values()].flatMap((r) =>
        r.keys
          .filter((k) => k.revokedAt === undefined)
          .map((k) => ({ keyDigest: k.digest, principal: r.principal, scopes: k.scopes }))
      );
      const match = findByKey(apiKey, candidates);
      if (match === undefined) return undefined;
      return clone({ ...match.principal, scopes: match.scopes });
    },
    async widgets(principalId) {
      return [...(record(principalId)?.widgets.values() ?? [])].map(clone);
    },
    async themes(principalId) {
      return [...(record(principalId)?.themes.values() ?? [])].map(clone);
    },
    async schemas(principalId) {
      return [...(record(principalId)?.schemas.values() ?? [])].map(clone);
    },
    async actions(principalId) {
      return [...(record(principalId)?.actions.values() ?? [])].map(clone);
    },
    async listSecrets(principalId) {
      return [...(record(principalId)?.secrets.values() ?? [])].map(({ name, createdAt, updatedAt }) => ({
        name,
        createdAt,
        updatedAt
      }));
    },
    async secretValue(principalId, name) {
      const active = requireCipher();
      const stored = record(principalId)?.secrets.get(name);
      if (stored === undefined) return undefined;
      return decryptSecret(stored.record, active);
    },
    async putWidget(principalId, widget) {
      const target = requireRecord(principalId);
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
      // A ref must name a schema the principal actually stores — refusing
      // here keeps dangling refs an out-of-band-only condition.
      const ref = widget.descriptor.dataSchemaRef;
      if (ref !== undefined && !target.schemas.has(ref)) {
        throw new StoreRejectionError(
          "UNKNOWN_SCHEMA",
          `widget references missing schema '${ref}'.`
        );
      }
      target.widgets.set(widget.kind, clone(widget));
    },
    async putTheme(principalId, theme) {
      const target = requireRecord(principalId);
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
    async putSchema(principalId, schema) {
      const target = requireRecord(principalId);
      const problem = checkStoredSchema(schema, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      if (
        !target.schemas.has(schema.name) &&
        target.schemas.size >= limits.maxSchemas
      ) {
        throw new StoreRejectionError(
          "TOO_MANY_SCHEMAS",
          `principal is at the ${limits.maxSchemas}-schema limit.`
        );
      }
      target.schemas.set(schema.name, clone(schema));
    },
    async putAction(principalId, action) {
      const target = requireRecord(principalId);
      const problem = checkStoredAction(action, limits);
      if (problem) throw new StoreRejectionError(problem.code, problem.message);
      if (!target.actions.has(action.name) && target.actions.size >= limits.maxActions) {
        throw new StoreRejectionError(
          "TOO_MANY_ACTIONS",
          `principal is at the ${limits.maxActions}-action limit.`
        );
      }
      target.actions.set(action.name, clone(action));
    },
    async putSecret(principalId, name, value) {
      const target = requireRecord(principalId);
      const active = requireCipher();
      const nameError = checkSecretName(name);
      if (nameError) throw new StoreRejectionError(nameError.code, nameError.message);
      if (!target.secrets.has(name) && target.secrets.size >= limits.maxSecrets) {
        throw new StoreRejectionError(
          "TOO_MANY_SECRETS",
          `principal is at the ${limits.maxSecrets}-secret limit.`
        );
      }
      let record_;
      try {
        record_ = await encryptSecret(value, active);
      } catch (error) {
        if (error instanceof SecretError) throw new StoreRejectionError(error.code, error.message);
        throw error;
      }
      const now = new Date().toISOString();
      const existing = target.secrets.get(name);
      target.secrets.set(name, {
        name,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        record: record_
      });
    },
    async removeWidget(principalId, kind) {
      record(principalId)?.widgets.delete(kind);
    },
    async removeTheme(principalId, name) {
      record(principalId)?.themes.delete(name);
    },
    async removeSchema(principalId, name) {
      const target = record(principalId);
      if (target === undefined) return;
      const referencing = [...target.widgets.values()]
        .filter((w) => w.descriptor.dataSchemaRef === name)
        .map((w) => w.kind);
      if (referencing.length > 0) {
        throw new StoreRejectionError(
          "SCHEMA_IN_USE",
          `schema '${name}' is referenced by: ${referencing.join(", ")}.`
        );
      }
      target.schemas.delete(name);
    },
    async removeAction(principalId, name) {
      const target = record(principalId);
      if (target === undefined) return;
      const referencing = widgetsReferencingAction(target.widgets.values(), name);
      if (referencing.length > 0) {
        throw new StoreRejectionError(
          "ACTION_IN_USE",
          `action '${name}' is referenced by: ${referencing.join(", ")}.`
        );
      }
      target.actions.delete(name);
    },
    async removeSecret(principalId, name) {
      const target = record(principalId);
      if (target === undefined) return;
      const referencing = referencesToSecret(target.actions.values(), target.widgets.values(), name);
      if (referencing.length > 0) {
        throw new StoreRejectionError(
          "SECRET_IN_USE",
          `secret '${name}' is referenced by: ${referencing.join(", ")}.`
        );
      }
      target.secrets.delete(name);
    },
    async ensurePrincipal(subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      const id = principalIdForSubject(subject);
      const alias = aliases.get(id);
      if (alias !== undefined) {
        const canonical = records.get(alias.to);
        if (canonical !== undefined) {
          return clone({
            ...canonical.principal,
            ...(canonical.subject === undefined ? {} : { subject: canonical.subject })
          });
        }
      }
      const existing = records.get(id);
      if (existing !== undefined) {
        return clone({
          ...existing.principal,
          ...(existing.subject === undefined ? {} : { subject: existing.subject })
        });
      }
      const principal: Principal = {
        id,
        ...(label === undefined ? {} : { label }),
        scopes: ["read", "write"],
        subject
      };
      records.set(id, {
        principal,
        subject,
        keys: [],
        widgets: new Map(),
        themes: new Map(),
        schemas: new Map(),
        actions: new Map(),
        secrets: new Map()
      });
      return clone(principal);
    },
    async linkSubject(principalId, subject, label) {
      if (typeof subject !== "string" || subject === "") {
        throw new StoreRejectionError("INVALID_SUBJECT", "subject must be a non-empty string.");
      }
      const target = requireRecord(principalId);
      if (subject === target.subject) return; // canonical already resolves here
      const aliasId = principalIdForSubject(subject);
      const alias = aliases.get(aliasId);
      if (alias !== undefined) {
        if (alias.to === principalId) return; // idempotent
        // A subject deliberately linked elsewhere is never stolen.
        throw new StoreRejectionError(
          "SUBJECT_IN_USE",
          `subject already resolves to another account.`
        );
      }
      const owned = records.get(aliasId);
      if (owned !== undefined) {
        const hasData =
          owned.widgets.size > 0 ||
          owned.themes.size > 0 ||
          owned.schemas.size > 0 ||
          owned.actions.size > 0 ||
          owned.secrets.size > 0 ||
          owned.keys.some((key) => key.revokedAt === undefined);
        if (hasData) {
          throw new StoreRejectionError(
            "SUBJECT_IN_USE",
            `subject already owns an account with content — remove its widgets, themes, schemas, actions, secrets, and keys first.`
          );
        }
        records.delete(aliasId); // absorb the empty principal
      }
      aliases.set(aliasId, {
        subject,
        to: principalId,
        ...(label === undefined ? {} : { label })
      });
    },
    async unlinkSubject(principalId, subject) {
      const target = requireRecord(principalId);
      if (subject === target.subject) {
        throw new StoreRejectionError(
          "CANNOT_UNLINK_PRIMARY",
          "the account's primary identity cannot be unlinked."
        );
      }
      const aliasId = principalIdForSubject(subject);
      const alias = aliases.get(aliasId);
      if (alias !== undefined && alias.to === principalId) aliases.delete(aliasId);
    },
    async listLinkedSubjects(principalId) {
      requireRecord(principalId);
      return [...aliases.values()]
        .filter((alias) => alias.to === principalId)
        .map((alias) => ({
          subject: alias.subject,
          ...(alias.label === undefined ? {} : { label: alias.label })
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject));
    },
    async createKey(principalId, name, scopes) {
      const target = requireRecord(principalId);
      if (typeof name !== "string" || name.trim() === "") {
        throw new StoreRejectionError("INVALID_KEY_NAME", "key name must be non-empty.");
      }
      const granted = normalizeKeyScopes(scopes);
      const raw = generateKey();
      const entry = makeKeyRecord(name.trim(), raw, granted);
      target.keys.push(entry);
      const created: CreatedKey = { key: raw, entry: publicKey(entry) };
      return created;
    },
    async listKeys(principalId) {
      return (record(principalId)?.keys ?? []).map(publicKey);
    },
    async revokeKey(principalId, keyId) {
      const target = requireRecord(principalId);
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
        themes: [...r.themes.values()],
        schemas: [...r.schemas.values()],
        actions: [...r.actions.values()],
        secrets: [...r.secrets.values()]
      }));
    }
  };
}
