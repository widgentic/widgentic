/**
 * Turning stored entries into a request-scoped catalog and theme registry.
 *
 * Composition builds FRESH instances every time and caches nothing: a
 * cache keyed by anything less specific than the principal is a
 * cross-tenant leak waiting for an off-by-one, and compilation is pure and
 * cheap. Every entry is re-validated on the way in — the store is
 * untrusted input, even when it is ours.
 */
import { errorMessage } from "../internal.js";
import { createCatalog } from "@widgentic/core";
import type { WidgetCatalog } from "@widgentic/core";
import type { ActionBinding, ActionDefinition, StoredAction } from "@widgentic/core";
import {
  collectActionRefs,
  DEFAULT_MAX_NODES,
  findActionBinding,
  registerTemplate
} from "@widgentic/core";
import { isPlainObject } from "@widgentic/core";
import { createThemeRegistry } from "@widgentic/core";
import type { ThemeRegistry } from "@widgentic/core";
import type { StoreLimits, StoredWidget, WidgetStore } from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";
import { checkStoredAction, checkStoredTheme, checkStoredWidget } from "./validate.js";

export interface ComposeOptions {
  limits?: StoreLimits;
  /** Node budget for stored templates (default DEFAULT_MAX_NODES). */
  maxNodes?: number;
  /** Entries registered before the store's (the deployment's own). */
  extraWidgets?: StoredWidget[];
  /**
   * Whether the caller may execute http actions (its key carries the
   * `execute` scope). `false` renders every http descriptor disabled with
   * reason `scope` and omits `load`. Default `true`.
   */
  executeAllowed?: boolean;
}

/**
 * What the server needs to act on a binding identifier without re-reading
 * the store: the binding at a template path, the widget's `load`, and the
 * principal's shared definitions. Attached to every composed catalog.
 */
export interface ActionSource {
  /** The element binding at `id` (a dotted template path) for `kind`. */
  bindingAt(kind: string, id: string): ActionBinding | undefined;
  /** The widget's `load` binding, when declared. */
  load(kind: string): ActionBinding | undefined;
  /** A shared action's definition by name. */
  resolve(ref: string): ActionDefinition | undefined;
  /** Whether descriptors were compiled with execution allowed. */
  executeAllowed: boolean;
}

export interface ComposeResult<T> {
  value: T;
  /** Entries skipped, and why. Never thrown — visible, not fatal. */
  diagnostics: string[];
}

/** Catalog composition also hands back the action source the server acts on. */
export interface CatalogComposeResult extends ComposeResult<WidgetCatalog> {
  actions: ActionSource;
}

/** Shared-action refs of an entry that has not been validated yet; none for a malformed one. */
function refsOf(entry: unknown): string[] {
  if (!isPlainObject(entry) || !isPlainObject(entry.template)) return [];
  return collectActionRefs(entry.template, entry.load);
}

/**
 * Catalog for one principal: built-ins, then the deployment's own widgets,
 * then the principal's stored ones. Invalid or oversized entries are
 * skipped with a diagnostic. Action bindings compile against the
 * principal's shared actions; unresolvable refs render disabled.
 */
export async function composeCatalog(
  store: WidgetStore | undefined,
  principalId: string,
  options: ComposeOptions = {}
): Promise<CatalogComposeResult> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const executeAllowed = options.executeAllowed ?? true;
  const catalog = createCatalog();
  const diagnostics: string[] = [];

  const stored = store === undefined ? [] : await store.widgets(principalId);
  const entries = [...(options.extraWidgets ?? []), ...stored];

  // Shared schemas load once per compose, and only when some widget carries a ref.
  const needsSchemas = entries.some(
    (entry) => (entry as StoredWidget)?.descriptor?.dataSchemaRef !== undefined
  );
  const schemaByName = new Map<string, Record<string, unknown>>();
  if (needsSchemas && store !== undefined) {
    for (const schema of await store.schemas(principalId)) {
      schemaByName.set(schema.name, schema.schema);
    }
  }

  // Shared actions likewise: one read, only when some widget binds by `ref`
  // (inline definitions need nothing from the store).
  const needsActions = entries.some((entry) => refsOf(entry).length > 0);
  const actionByName = new Map<string, StoredAction>();
  if (needsActions && store !== undefined) {
    for (const action of await store.actions(principalId)) {
      if (actionByName.size >= limits.maxActions) {
        diagnostics.push(`stopped at the ${limits.maxActions}-action limit; later actions were skipped.`);
        break;
      }
      const problem = checkStoredAction(action, limits);
      if (problem !== undefined) {
        diagnostics.push(
          `skipped action '${String((action as Partial<StoredAction>)?.name)}': ${problem.code} — ${problem.message}`
        );
        continue;
      }
      actionByName.set(action.name, action);
    }
  }
  const resolve = (ref: string): ActionDefinition | undefined => actionByName.get(ref)?.definition;

  const registeredWidgets = new Map<string, StoredWidget>();
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
    // Dangling action refs are NOT fatal: the element renders disabled
    // (`unresolved`) and the condition is visible here.
    for (const actionRef of collectActionRefs(entry.template, entry.load)) {
      if (!actionByName.has(actionRef)) {
        diagnostics.push(
          `widget '${entry.kind}' references unknown action '${actionRef}'; its element renders disabled.`
        );
      }
    }
    try {
      registerTemplate(catalog, entry.kind, entry.template, descriptor, {
        maxNodes,
        actions: resolve,
        ...(executeAllowed ? {} : { httpDisabled: "scope" as const })
      });
      registeredWidgets.set(entry.kind, entry);
      registered++;
    } catch (error) {
      // Duplicate kinds within a principal's own set, or anything the
      // catalog refuses: skip and keep going.
      diagnostics.push(
        `skipped widget '${entry.kind}': ${errorMessage(error)}`
      );
    }
  }

  const actions: ActionSource = {
    bindingAt: (kind, id) => {
      const widget = registeredWidgets.get(kind);
      return widget === undefined ? undefined : findActionBinding(widget.template, id);
    },
    load: (kind) => registeredWidgets.get(kind)?.load,
    resolve,
    executeAllowed
  };

  return { value: catalog, diagnostics, actions };
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
      diagnostics.push(`skipped theme '${entry.name}': ${errorMessage(error)}`);
    }
  }

  return { value: registry, diagnostics };
}
