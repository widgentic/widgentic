/**
 * The store port: how the server learns whose catalog it is serving.
 *
 * Deliberately three async methods over plain data — no database is chosen
 * here. The app supplies its own adapter; this package ships an in-memory
 * and a file-backed reference implementation.
 */
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

/** A stored custom widget — the same shape the server registers. */
export interface StoredWidget {
  kind: string;
  template: WidgetTemplate;
  descriptor: WidgetDescriptorInput;
}

/**
 * Structural limits, per principal. Not economics — these exist so one
 * tenant cannot exhaust the server for the rest, and so a corrupt store
 * cannot load unbounded data.
 */
export interface StoreLimits {
  maxWidgets: number;
  maxThemes: number;
  /** Serialized bytes of a single entry. */
  maxEntryBytes: number;
  /** Template nodes in a single stored template (structure, not output). */
  maxTemplateNodes: number;
}

export const DEFAULT_LIMITS: StoreLimits = {
  maxWidgets: 100,
  maxThemes: 50,
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
}

/** A store that also accepts writes (the app's path, not the MCP surface). */
export interface WritableWidgetStore extends WidgetStore {
  putWidget(principalId: string, widget: StoredWidget): Promise<void>;
  putTheme(principalId: string, theme: ThemeEntry): Promise<void>;
  removeWidget(principalId: string, kind: string): Promise<void>;
  removeTheme(principalId: string, name: string): Promise<void>;
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
