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
import type { ThemeEntry } from "widgentic/theming";

/** What a key grants. Writes belong to the app's authenticated path. */
export type Scope = "read" | "write";

export interface Principal {
  id: string;
  label?: string;
  scopes: Scope[];
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
  /** Serialized bytes of a single entry. */
  maxEntryBytes: number;
  /** Template nodes in a single stored template (structure, not output). */
  maxTemplateNodes: number;
}

export const DEFAULT_LIMITS: StoreLimits = {
  maxWidgets: 100,
  maxThemes: 50,
  maxSchemas: 50,
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
  /** Key → principal. `undefined` for unknown keys; never throws. */
  resolvePrincipal(apiKey: string): Promise<Principal | undefined>;
  widgets(principalId: string): Promise<StoredWidget[]>;
  themes(principalId: string): Promise<ThemeEntry[]>;
  schemas(principalId: string): Promise<StoredSchema[]>;
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
  /** Mint a named key. The raw key is returned here and never again. */
  createKey(principalId: string, name: string): Promise<CreatedKey>;
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
