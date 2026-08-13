/**
 * In-memory store — tests, demos, and the seed for the file store's
 * fixtures. Writes are validated and limit-checked; reads hand back deep
 * copies so a caller cannot mutate another request's view.
 */
import type { ThemeEntry } from "widgentic/theming";
import { findByKey, hashKey } from "./keys.js";
import type {
  Principal,
  StoreLimits,
  StoredWidget,
  WritableWidgetStore
} from "./types.js";
import { DEFAULT_LIMITS, StoreRejectionError } from "./types.js";
import { checkStoredTheme, checkStoredWidget } from "./validate.js";

/** A principal plus its material, as callers seed it. */
export interface MemorySeedPrincipal {
  principal: Principal;
  /** Raw key — hashed on the way in; the store keeps only the digest. */
  apiKey?: string;
  widgets?: StoredWidget[];
  themes?: ThemeEntry[];
}

interface Record_ {
  principal: Principal;
  keyDigest: string;
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

export function createMemoryStore(
  seed: MemorySeedPrincipal[] = [],
  limits: StoreLimits = DEFAULT_LIMITS
): MemoryStore {
  const records = new Map<string, Record_>();

  function record(principalId: string): Record_ | undefined {
    return records.get(principalId);
  }

  for (const entry of seed) {
    const created: Record_ = {
      principal: entry.principal,
      keyDigest: entry.apiKey === undefined ? "" : hashKey(entry.apiKey),
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
      const candidates = [...records.values()].filter((r) => r.keyDigest !== "");
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
    snapshot() {
      return [...records.values()].map((r) => ({
        principal: r.principal,
        keyDigest: r.keyDigest,
        widgets: [...r.widgets.values()],
        themes: [...r.themes.values()]
      }));
    }
  };
}
