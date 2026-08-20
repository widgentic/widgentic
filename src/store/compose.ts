/**
 * Turning stored entries into a request-scoped catalog and theme registry.
 *
 * Composition builds FRESH instances every time and caches nothing: a
 * cache keyed by anything less specific than the principal is a
 * cross-tenant leak waiting for an off-by-one, and compilation is pure and
 * cheap. Every entry is re-validated on the way in — the store is
 * untrusted input, even when it is ours.
 */
import { createCatalog } from "widgentic/catalog";
import type { WidgetCatalog } from "widgentic/catalog";
import { DEFAULT_MAX_NODES, registerTemplate } from "widgentic/templates";
import { createThemeRegistry } from "widgentic/theming";
import type { ThemeRegistry } from "widgentic/theming";
import type { StoreLimits, StoredWidget, WidgetStore } from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";
import { checkStoredTheme, checkStoredWidget } from "./validate.js";

export interface ComposeOptions {
  limits?: StoreLimits;
  /** Node budget for stored templates (default DEFAULT_MAX_NODES). */
  maxNodes?: number;
  /** Entries registered before the store's (the deployment's own). */
  extraWidgets?: StoredWidget[];
}

export interface ComposeResult<T> {
  value: T;
  /** Entries skipped, and why. Never thrown — visible, not fatal. */
  diagnostics: string[];
}

/**
 * Catalog for one principal: built-ins, then the deployment's own widgets,
 * then the principal's stored ones. Invalid or oversized entries are
 * skipped with a diagnostic.
 */
export async function composeCatalog(
  store: WidgetStore | undefined,
  principalId: string,
  options: ComposeOptions = {}
): Promise<ComposeResult<WidgetCatalog>> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const catalog = createCatalog();
  const diagnostics: string[] = [];

  const stored = store === undefined ? [] : await store.widgets(principalId);
  const entries = [...(options.extraWidgets ?? []), ...stored];

  // Shared schemas load once per compose, and only when some widget
  // actually carries a ref — the join this feature adds is one read.
  const needsSchemas = entries.some(
    (entry) => (entry as StoredWidget)?.descriptor?.dataSchemaRef !== undefined
  );
  const schemaByName = new Map<string, Record<string, unknown>>();
  if (needsSchemas && store !== undefined) {
    for (const schema of await store.schemas(principalId)) {
      schemaByName.set(schema.name, schema.schema);
    }
  }

  let registered = 0;
  for (const entry of entries) {
    if (registered >= limits.maxWidgets) {
      diagnostics.push(
        `stopped at the ${limits.maxWidgets}-widget limit; later entries were skipped.`
      );
      break;
    }
    const problem = checkStoredWidget(entry, limits);
    if (problem !== undefined) {
      diagnostics.push(
        `skipped widget '${String((entry as StoredWidget)?.kind)}': ${problem.code} — ${problem.message}`
      );
      continue;
    }
    // References resolve HERE and nowhere later: the registered
    // descriptor carries the resolved dataSchema, never the ref —
    // downstream (catalog, renderer, wire, agents) refs do not exist.
    let descriptor = entry.descriptor;
    const ref = descriptor.dataSchemaRef;
    if (ref !== undefined) {
      const resolved = schemaByName.get(ref);
      if (resolved === undefined) {
        diagnostics.push(
          `skipped widget '${entry.kind}': UNKNOWN_SCHEMA — references missing schema '${ref}'.`
        );
        continue;
      }
      const { dataSchemaRef: _ref, ...rest } = descriptor;
      descriptor = { ...rest, dataSchema: resolved };
    }
    try {
      registerTemplate(catalog, entry.kind, entry.template, descriptor, {
        maxNodes
      });
      registered++;
    } catch (error) {
      // Duplicate kinds within a principal's own set, or anything the
      // catalog refuses: skip and keep going.
      diagnostics.push(
        `skipped widget '${entry.kind}': ${(error as Error).message}`
      );
    }
  }

  return { value: catalog, diagnostics };
}

/** Theme registry for one principal: built-ins plus their stored themes. */
export async function composeThemes(
  store: WidgetStore | undefined,
  principalId: string,
  options: ComposeOptions = {}
): Promise<ComposeResult<ThemeRegistry>> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const registry = createThemeRegistry();
  const diagnostics: string[] = [];

  const stored = store === undefined ? [] : await store.themes(principalId);
  let registered = 0;
  for (const entry of stored) {
    if (registered >= limits.maxThemes) {
      diagnostics.push(
        `stopped at the ${limits.maxThemes}-theme limit; later entries were skipped.`
      );
      break;
    }
    const problem = checkStoredTheme(entry, limits);
    if (problem !== undefined) {
      diagnostics.push(
        `skipped theme '${String(entry?.name)}': ${problem.code} — ${problem.message}`
      );
      continue;
    }
    try {
      registry.register(entry);
      registered++;
    } catch (error) {
      diagnostics.push(`skipped theme '${entry.name}': ${(error as Error).message}`);
    }
  }

  return { value: registry, diagnostics };
}
