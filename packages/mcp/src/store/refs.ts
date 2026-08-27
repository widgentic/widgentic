/**
 * Reference scans shared by every adapter: which widgets bind a shared
 * action, which widgets `load` through one, which actions and widgets use
 * a secret. They run over RAW entries — an entry the validator rejects
 * today still holds its references, so a delete must not slip past because
 * a widget is temporarily oversized or malformed.
 */
import type { ActionDefinition, StoredAction } from "@widgentic/core";
import { collectSecretRefs } from "@widgentic/core";
import { collectActionRefs, collectInlineActions } from "@widgentic/core";
import { isPlainObject } from "@widgentic/core";
import type { StoredWidget } from "./types.js";

/** Loose narrowing for scans: a kind and a template object, nothing more. */
export function looseWidget(value: unknown): StoredWidget | undefined {
  if (!isPlainObject(value) || typeof value.kind !== "string" || !isPlainObject(value.template)) return undefined;
  return value as unknown as StoredWidget;
}

/** Loose narrowing for scans: a name and a definition object. */
export function looseAction(value: unknown): StoredAction | undefined {
  if (!isPlainObject(value) || typeof value.name !== "string" || !isPlainObject(value.definition)) return undefined;
  return value as unknown as StoredAction;
}

/** The shared action a widget loads through, when its `load` is a `ref`. */
export function loadRefOf(widget: StoredWidget): string | undefined {
  const load = widget.load;
  return load !== undefined && "ref" in load && typeof load.ref === "string" ? load.ref : undefined;
}

/** `load` bindings are http GET only; a shared action they name must stay one. */
export function isGetHttp(definition: ActionDefinition | undefined): boolean {
  return definition?.kind === "http" && definition.method === "GET";
}

/** Widgets binding the named shared action (by `ref`, in the template or `load`). */
export function widgetsReferencingAction(widgets: Iterable<StoredWidget>, name: string): string[] {
  return [...widgets]
    .filter((w) => collectActionRefs(w.template, w.load).includes(name))
    .map((w) => w.kind);
}

/** Widgets whose `load` is a `ref` to the named shared action. */
export function widgetsLoadingAction(widgets: Iterable<StoredWidget>, name: string): string[] {
  return [...widgets].filter((w) => loadRefOf(w) === name).map((w) => w.kind);
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
