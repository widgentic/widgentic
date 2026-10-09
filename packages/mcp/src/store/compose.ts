/**
 * Turning stored entries into a request-scoped catalog and theme registry.
 *
 * Composition builds FRESH instances every time and caches nothing: a
 * cache keyed by anything less specific than the principal is a
 * cross-tenant leak waiting for an off-by-one, and compilation is pure and
 * cheap. Every entry is re-validated on the way in — the store is
 * untrusted input, even when it is ours.
 *
 * The work itself is synchronous over entry lists (`composeCatalogEntries`,
 * `composeThemeEntries`) and reports structured problems; the async
 * store-facing functions read the store, delegate, and format those
 * problems as diagnostic lines.
 */
import { errorMessage } from "../internal.js";
import { createCatalog } from "@widgentic/core";
import type { WidgetCatalog } from "@widgentic/core";
import type { ActionBinding, ActionDefinition, ActionDisabledReason, StoredAction } from "@widgentic/core";
import {
  collectActionRefs,
  DEFAULT_MAX_NODES,
  findActionBinding,
  registerTemplate
} from "@widgentic/core";
import { isPlainObject } from "@widgentic/core";
import { createThemeRegistry } from "@widgentic/core";
import type { ThemeEntry, ThemeRegistry } from "@widgentic/core";
import type { StoredWidget, WidgetStore } from "./types.js";
import type { StoreLimits } from "./limits.js";
import { DEFAULT_LIMITS } from "./limits.js";
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

/** One entry composition refused or noted, before it becomes a diagnostic line. */
export interface ComposeProblem {
  section: "widgets" | "themes" | "actions";
  /** Position in the list composition was given (for a limit stop: the first entry skipped). */
  index: number;
  /** The entry's kind or name as given — possibly malformed. */
  name: string;
  /** A store check code, or `UNKNOWN_SCHEMA`, `UNKNOWN_ACTION`, `LIMIT_REACHED`, `REGISTER_FAILED`. */
  code: string;
  message: string;
  /** The entry WAS registered; the condition is only noted (an unknown action renders disabled). */
  warning?: true;
}

const SINGULAR = { widgets: "widget", themes: "theme", actions: "action" } as const;

/** The diagnostic line a problem has always been reported as. */
function diagnosticLine(problem: ComposeProblem): string {
  if (problem.code === "LIMIT_REACHED" || problem.warning === true) return problem.message;
  const prefix = `skipped ${SINGULAR[problem.section]} '${problem.name}'`;
  return problem.code === "REGISTER_FAILED"
    ? `${prefix}: ${problem.message}`
    : `${prefix}: ${problem.code} — ${problem.message}`;
}

export interface CatalogEntries {
  /** Widget entries in registration order (the deployment's own first). */
  widgets: readonly unknown[];
  /** Shared schemas by name, for `descriptor.dataSchemaRef`. */
  schemas?: ReadonlyMap<string, Record<string, unknown>>;
  /** Shared action entries; validated here. */
  actions?: readonly unknown[];
}

export interface CatalogEntriesOptions {
  limits?: StoreLimits;
  /** Node budget for stored templates (default DEFAULT_MAX_NODES). */
  maxNodes?: number;
  /** Renders every http descriptor disabled for this reason and omits `load`. */
  httpDisabled?: ActionDisabledReason;
}

export interface CatalogEntriesResult {
  catalog: WidgetCatalog;
  actions: ActionSource;
  problems: ComposeProblem[];
}

/**
 * The catalog for a list of entries: built-ins, then each valid entry.
 * Invalid or oversized entries are skipped with a problem; action bindings
 * compile against the valid shared actions, and unresolvable refs render
 * disabled (noted as warnings).
 */
export function composeCatalogEntries(
  entries: CatalogEntries,
  options: CatalogEntriesOptions = {}
): CatalogEntriesResult {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const catalog = createCatalog();
  const problems: ComposeProblem[] = [];

  const actionByName = new Map<string, StoredAction>();
  for (const [index, action] of (entries.actions ?? []).entries()) {
    const name = String((action as Partial<StoredAction>)?.name);
    if (actionByName.size >= limits.maxActions) {
      problems.push({
        section: "actions",
        index,
        name,
        code: "LIMIT_REACHED",
        message: `stopped at the ${limits.maxActions}-action limit; later actions were skipped.`
      });
      break;
    }
    const problem = checkStoredAction(action, limits);
    if (problem !== undefined) {
      problems.push({ section: "actions", index, name, code: problem.code, message: problem.message });
      continue;
    }
    const valid = action as StoredAction;
    actionByName.set(valid.name, valid);
  }
  const resolve = (ref: string): ActionDefinition | undefined => actionByName.get(ref)?.definition;

  const registeredWidgets = new Map<string, StoredWidget>();
  let registered = 0;
  for (const [index, entry] of entries.widgets.entries()) {
    const name = String((entry as Partial<StoredWidget>)?.kind);
    if (registered >= limits.maxWidgets) {
      problems.push({
        section: "widgets",
        index,
        name,
        code: "LIMIT_REACHED",
        message: `stopped at the ${limits.maxWidgets}-widget limit; later entries were skipped.`
      });
      break;
    }
    const problem = checkStoredWidget(entry, limits);
    if (problem !== undefined) {
      problems.push({ section: "widgets", index, name, code: problem.code, message: problem.message });
      continue;
    }
    const widget = entry as StoredWidget;
    // References resolve HERE and nowhere later: the registered
    // descriptor carries the resolved dataSchema, never the ref —
    // downstream (catalog, renderer, wire, agents) refs do not exist.
    let descriptor = widget.descriptor;
    const ref = descriptor.dataSchemaRef;
    if (ref !== undefined) {
      const resolved = entries.schemas?.get(ref);
      if (resolved === undefined) {
        problems.push({
          section: "widgets",
          index,
          name,
          code: "UNKNOWN_SCHEMA",
          message: `references missing schema '${ref}'.`
        });
        continue;
      }
      const { dataSchemaRef: _ref, ...rest } = descriptor;
      descriptor = { ...rest, dataSchema: resolved };
    }
    // Dangling action refs are NOT fatal: the element renders disabled
    // (`unresolved`) and the condition is visible here.
    for (const actionRef of collectActionRefs(widget.template, widget.load)) {
      if (!actionByName.has(actionRef)) {
        problems.push({
          section: "widgets",
          index,
          name,
          code: "UNKNOWN_ACTION",
          message: `widget '${widget.kind}' references unknown action '${actionRef}'; its element renders disabled.`,
          warning: true
        });
      }
    }
    try {
      registerTemplate(catalog, widget.kind, widget.template, descriptor, {
        maxNodes,
        actions: resolve,
        ...(options.httpDisabled === undefined ? {} : { httpDisabled: options.httpDisabled })
      });
      registeredWidgets.set(widget.kind, widget);
      registered++;
    } catch (error) {
      // Duplicate kinds within one entry set, or anything the catalog
      // refuses: skip and keep going.
      problems.push({ section: "widgets", index, name, code: "REGISTER_FAILED", message: errorMessage(error) });
    }
  }

  const actions: ActionSource = {
    bindingAt: (kind, id) => {
      const widget = registeredWidgets.get(kind);
      return widget === undefined ? undefined : findActionBinding(widget.template, id);
    },
    load: (kind) => registeredWidgets.get(kind)?.load,
    resolve,
    executeAllowed: options.httpDisabled === undefined
  };

  return { catalog, actions, problems };
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
  const stored = store === undefined ? [] : await store.widgets(principalId);
  const widgets = [...(options.extraWidgets ?? []), ...stored];

  // Shared schemas load once per compose, and only when some widget carries a ref.
  const needsSchemas = widgets.some(
    (entry) => (entry as StoredWidget)?.descriptor?.dataSchemaRef !== undefined
  );
  const schemas = new Map<string, Record<string, unknown>>();
  if (needsSchemas && store !== undefined) {
    for (const schema of await store.schemas(principalId)) {
      schemas.set(schema.name, schema.schema);
    }
  }

  // Shared actions likewise: one read, only when some widget binds by `ref`
  // (inline definitions need nothing from the store).
  const needsActions = widgets.some((entry) => refsOf(entry).length > 0);
  const actions = needsActions && store !== undefined ? await store.actions(principalId) : [];

  const composed = composeCatalogEntries(
    { widgets, schemas, actions },
    {
      ...(options.limits === undefined ? {} : { limits: options.limits }),
      ...(options.maxNodes === undefined ? {} : { maxNodes: options.maxNodes }),
      ...((options.executeAllowed ?? true) ? {} : { httpDisabled: "scope" as const })
    }
  );
  return {
    value: composed.catalog,
    diagnostics: composed.problems.map(diagnosticLine),
    actions: composed.actions
  };
}

export interface ThemeEntriesResult {
  registry: ThemeRegistry;
  problems: ComposeProblem[];
}

/** The theme registry for a list of entries: built-ins plus each valid entry. */
export function composeThemeEntries(
  entries: readonly unknown[],
  options: Pick<ComposeOptions, "limits"> = {}
): ThemeEntriesResult {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const registry = createThemeRegistry();
  const problems: ComposeProblem[] = [];

  let registered = 0;
  for (const [index, entry] of entries.entries()) {
    const name = String((entry as Partial<ThemeEntry>)?.name);
    if (registered >= limits.maxThemes) {
      problems.push({
        section: "themes",
        index,
        name,
        code: "LIMIT_REACHED",
        message: `stopped at the ${limits.maxThemes}-theme limit; later entries were skipped.`
      });
      break;
    }
    const problem = checkStoredTheme(entry, limits);
    if (problem !== undefined) {
      problems.push({ section: "themes", index, name, code: problem.code, message: problem.message });
      continue;
    }
    try {
      registry.register(entry as ThemeEntry);
      registered++;
    } catch (error) {
      problems.push({ section: "themes", index, name, code: "REGISTER_FAILED", message: errorMessage(error) });
    }
  }

  return { registry, problems };
}

/** Theme registry for one principal: built-ins plus their stored themes. */
export async function composeThemes(
  store: WidgetStore | undefined,
  principalId: string,
  options: ComposeOptions = {}
): Promise<ComposeResult<ThemeRegistry>> {
  const stored = store === undefined ? [] : await store.themes(principalId);
  const composed = composeThemeEntries(
    stored,
    options.limits === undefined ? {} : { limits: options.limits }
  );
  return { value: composed.registry, diagnostics: composed.problems.map(diagnosticLine) };
}
