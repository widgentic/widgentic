/**
 * Addressing nodes inside a template by the validator's dotted path
 * convention (`children.2.template`, `else`, …) — the identifier an action
 * binding is known by — and enumerating the shared actions a template
 * references, so stores can enforce referential integrity without a
 * second grammar.
 */
import type { ActionBinding } from "../actions/types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The template node at a dotted path ("" is the root); `undefined` when absent. */
export function findTemplateNode(template: unknown, path: string): unknown {
  if (path === "") return template;
  let current: unknown = template;
  for (const segment of path.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (isPlainObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/** The element's `action` binding at a dotted path, when that node is a bound element. */
export function findActionBinding(template: unknown, path: string): ActionBinding | undefined {
  const node = findTemplateNode(template, path);
  if (isPlainObject(node) && typeof node.tag === "string" && isPlainObject(node.action)) {
    return node.action as ActionBinding;
  }
  return undefined;
}

/** Every shared-action name a template (and an optional `load`) references by `ref`. */
export function collectActionRefs(template: unknown, load?: unknown): string[] {
  const refs = new Set<string>();
  const visit = (node: unknown): void => {
    if (!isPlainObject(node)) return;
    if (isPlainObject(node.action) && typeof node.action.ref === "string") refs.add(node.action.ref);
    for (const key of ["template", "empty", "else"] as const) {
      if (node[key] !== undefined) visit(node[key]);
    }
    if (Array.isArray(node.children)) for (const child of node.children) visit(child);
  };
  visit(template);
  if (isPlainObject(load) && typeof load.ref === "string") refs.add(load.ref);
  return [...refs];
}

/** Every inline action definition in a template (and `load`), for secret-reference scans. */
export function collectInlineActions(template: unknown, load?: unknown): unknown[] {
  const out: unknown[] = [];
  const visit = (node: unknown): void => {
    if (!isPlainObject(node)) return;
    if (isPlainObject(node.action) && typeof node.action.ref !== "string" && node.action.definition !== undefined) {
      out.push(node.action.definition);
    }
    for (const key of ["template", "empty", "else"] as const) {
      if (node[key] !== undefined) visit(node[key]);
    }
    if (Array.isArray(node.children)) for (const child of node.children) visit(child);
  };
  visit(template);
  if (isPlainObject(load) && typeof load.ref !== "string" && load.definition !== undefined) out.push(load.definition);
  return out;
}

/** Does the template (or `load`) carry any action binding at all? */
export function hasActionBindings(template: unknown, load?: unknown): boolean {
  if (load !== undefined) return true;
  return collectActionRefs(template).length > 0 || collectInlineActions(template).length > 0;
}
