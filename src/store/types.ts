/**
 * The store port: how the server learns whose catalog it is serving.
 *
 * Deliberately three async methods over plain data — no database is chosen
 * here. The app supplies its own adapter; this package ships an in-memory
 * and a file-backed reference implementation.
 */
import { createHash } from "node:crypto";
import type { WidgetDescriptorInput } from "widgentic/catalog";
import type { WidgetTemplate } from "widgentic/templates";
import type { ActionBinding, StoredAction } from "widgentic/actions";
import type { EnvelopeRecord, SecretCipher } from "widgentic/secrets";
import type { ThemeEntry } from "widgentic/theming";

/**
 * What a key grants. `read` serves the catalog; `execute` lets widgets run
 * http actions (with the principal's secrets); `write` belongs to the app's
 * authenticated path and is never granted to a key.
 */
export type Scope = "read" | "write" | "execute";

/** The scopes a key may carry. `read` is always granted. */
export const KEY_SCOPES: readonly Scope[] = ["read", "execute"];

export type { StoredAction } from "widgentic/actions";

/** A secret as listings show it: never a value, preview or length. */
export interface SecretEntry {
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** A secret as stores persist it: the envelope record plus metadata. */
export interface StoredSecret extends SecretEntry {
  record: EnvelopeRecord;
}

export type { SecretCipher };

export interface Principal {
  id: string;
  label?: string;
  scopes: Scope[];
  /**
   * The CANONICAL identity subject — the one the id derives from.
   * Present on principals returned by `ensurePrincipal` (any linked
   * subject resolves to the same canonical value), so account UIs can
   * show the full identity set from either session. Key-based
   * resolution omits it: keys never need identity material.
   */
  subject?: string;
}

/**
 * A stored custom widget — the same shape the server registers, except
 * that its descriptor MAY carry `dataSchemaRef` in place of an inline
 * `dataSchema` (never both). The ref is a STORE-layer concept:
 * composition resolves it into the registered descriptor's `dataSchema`,
 * so downstream of compose the reference does not exist.
 */
export interface StoredWidget {
  kind: string;
  template: WidgetTemplate;
  descriptor: WidgetDescriptorInput & { dataSchemaRef?: string };
  /** Optional http GET action run once when the widget first renders. */
  load?: ActionBinding;
}

/**
 * A shared data schema: one definition (`person`) serving many widgets
 * (person card, person table). Editing it propagates — widgets hold a
 * reference, not a copy.
 */
export interface StoredSchema {
  name: string;
  label?: string;
  description?: string;
  /** The JSON-Schema subset object widgets validate data against. */
  schema: Record<string, unknown>;
}

/**
 * Structural limits, per principal. Not economics — these exist so one
 * tenant cannot exhaust the server for the rest, and so a corrupt store
 * cannot load unbounded data.
 */
export interface StoreLimits {
  maxWidgets: number;
  maxThemes: number;
  maxSchemas: number;
  maxActions: number;
  maxSecrets: number;
  /** Serialized bytes of a single entry. */
  maxEntryBytes: number;
  /** Template nodes in a single stored template (structure, not output). */
  maxTemplateNodes: number;
}

export const DEFAULT_LIMITS: StoreLimits = {
  maxWidgets: 100,
  maxThemes: 50,
  maxSchemas: 50,
  maxActions: 50,
  maxSecrets: 50,
  maxEntryBytes: 65_536,
  maxTemplateNodes: 2_000
};

/**
 * The anonymous principal: an unauthenticated caller, or a key that
 * resolves to nobody. Gets the built-ins and whatever the deployment
 * supplies — never an error, so an unauthenticated client still works.
 */
export const ANONYMOUS_PRINCIPAL: Principal = {
  id: "anonymous",
  label: "Anonymous",
  scopes: ["read"]
};

export interface WidgetStore {
  /**
   * Key → principal. `undefined` for unknown keys; never throws. The
   * returned principal carries the PRESENTED KEY's scopes.
   */
  resolvePrincipal(apiKey: string): Promise<Principal | undefined>;
  widgets(principalId: string): Promise<StoredWidget[]>;
  themes(principalId: string): Promise<ThemeEntry[]>;
  schemas(principalId: string): Promise<StoredSchema[]>;
  /** The principal's shared actions. */
  actions(principalId: string): Promise<StoredAction[]>;
  /** The principal's secrets — names and timestamps only. */
  listSecrets(principalId: string): Promise<SecretEntry[]>;
  /**
   * Execution-time resolution: the decrypted value, or `undefined` when
   * the name is unknown. The ONLY path that yields a value. Refused with
   * `NO_CIPHER` when the store was built without a cipher.
   */
  secretValue(principalId: string, name: string): Promise<string | undefined>;
}

/**
 * A key's stored record — everything the app may show again. The raw key
 * is NOT here: it exists only in the `CreatedKey` returned by `createKey`,
 * exactly once. `digestPreview` is the digest's first characters, enough
 * for a user to tell keys apart, useless for authentication.
 */
export interface StoredKey {
  id: string;
  name: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Present once revoked; a revoked key resolves to no principal. */
  revokedAt?: string;
  scopes: Scope[];
  digestPreview: string;
}

/** A linked identity: the subject plus its human-facing display label. */
export interface LinkedIdentity {
  subject: string;
  label?: string;
}

/** `createKey`'s result: the only moment the raw key exists outside a digest. */
export interface CreatedKey {
  /** The raw key. Shown once; the store keeps only its digest. */
  key: string;
  entry: StoredKey;
}

/** A store that also accepts writes (the app's path, not the MCP surface). */
export interface WritableWidgetStore extends WidgetStore {
  putWidget(principalId: string, widget: StoredWidget): Promise<void>;
  putTheme(principalId: string, theme: ThemeEntry): Promise<void>;
  putSchema(principalId: string, schema: StoredSchema): Promise<void>;
  removeWidget(principalId: string, kind: string): Promise<void>;
  removeTheme(principalId: string, name: string): Promise<void>;
  /**
   * Remove a schema. Refused with `SCHEMA_IN_USE` while stored widgets
   * still reference it — the write-side guard that keeps dangling refs
   * an out-of-band-only condition.
   */
  removeSchema(principalId: string, name: string): Promise<void>;
  /**
   * Map an external identity subject (e.g. an OIDC token's `sub`) to a
   * stable principal, creating it on first sight. Repeat calls with the
   * same subject return the same principal.
   */
  ensurePrincipal(subject: string, label?: string): Promise<Principal>;
  /**
   * Attach another identity subject to this principal: later resolutions
   * of that subject (incl. `ensurePrincipal`) return this principal.
   * Refused with `SUBJECT_IN_USE` when the subject already resolves to a
   * DIFFERENT principal that owns data (widgets, themes, schemas, or
   * unrevoked keys); a subject whose own principal is empty is absorbed.
   * Idempotent for a subject already linked here.
   */
  linkSubject(principalId: string, subject: string, label?: string): Promise<void>;
  /**
   * Detach a linked subject (it later provisions a fresh principal).
   * The canonical subject — the one the principal id derives from — is
   * refused with `CANNOT_UNLINK_PRIMARY`. Unlinking a subject that is
   * not linked here is a no-op.
   */
  unlinkSubject(principalId: string, subject: string): Promise<void>;
  /** The principal's linked identities (canonical subject excluded). */
  listLinkedSubjects(principalId: string): Promise<LinkedIdentity[]>;
  /**
   * Store a shared action (create or replace by name); validated at the
   * door like every entry.
   */
  putAction(principalId: string, action: StoredAction): Promise<void>;
  /**
   * Remove a shared action. Refused with `ACTION_IN_USE` while a stored
   * widget binds it by `ref`.
   */
  removeAction(principalId: string, name: string): Promise<void>;
  /**
   * Set or replace a secret: encrypted through the configured cipher,
   * never stored or shown in clear. Refused with `NO_CIPHER` when none.
   */
  putSecret(principalId: string, name: string, value: string): Promise<void>;
  /**
   * Remove a secret. Refused with `SECRET_IN_USE` while a shared action or
   * a widget's inline action references it.
   */
  removeSecret(principalId: string, name: string): Promise<void>;
  /**
   * Mint a named key with fixed scopes (default `["read"]`; `read` is
   * always included; only {@link KEY_SCOPES} are accepted). The raw key is
   * returned here and never again.
   */
  createKey(principalId: string, name: string, scopes?: Scope[]): Promise<CreatedKey>;
  /** The principal's keys — metadata only, never raw material. */
  listKeys(principalId: string): Promise<StoredKey[]>;
  /** Stamp one key revoked; the principal's other keys are untouched. */
  revokeKey(principalId: string, keyId: string): Promise<void>;
}

/**
 * Principal ids derive deterministically from the identity subject, so
 * subject → principal is a point lookup in any store (no secondary index,
 * no cross-partition query) and the raw subject never becomes an id.
 */
export function principalIdForSubject(subject: string): string {
  // Local import would be circular; keys.ts already owns hashing, but this
  // is identity derivation, not credential handling — plain sha256 here.
  return `usr_${createHash("sha256").update(subject, "utf8").digest("hex").slice(0, 24)}`;
}

/** Refusal from a write, carrying which rule said no. */
export class StoreRejectionError extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "StoreRejectionError";
    this.code = code;
    this.detail = detail;
  }
}

/** Normalize requested key scopes: always `read`, only key-grantable scopes, no duplicates. */
export function normalizeKeyScopes(requested: unknown): Scope[] {
  const scopes = new Set<Scope>(["read"]);
  if (requested !== undefined) {
    if (!Array.isArray(requested)) {
      throw new StoreRejectionError("INVALID_SCOPES", "scopes must be an array.");
    }
    for (const scope of requested) {
      if (!KEY_SCOPES.includes(scope as Scope)) {
        throw new StoreRejectionError("INVALID_SCOPES", `'${String(scope)}' cannot be granted to a key.`);
      }
      scopes.add(scope as Scope);
    }
  }
  return [...scopes];
}
