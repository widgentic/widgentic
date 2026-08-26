/**
 * Addressing nodes inside a template by the validator's dotted path
 * convention (`children.2.template`, `else`, …) — the identifier an action
 * binding is known by — and enumerating the shared actions a template
 * references, so stores can enforce referential integrity without a
 * second grammar.
 */
import { isPlainObject } from "../shared/plain-object.js";
import type { ActionBinding } from "../actions/types.js";

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

/** Visit every binding object a template (and an optional `load`) carries. */
function eachBinding(template: unknown, load: unknown, onBinding: (binding: Record<string, unknown>) => void): void {
  const visit = (node: unknown): void => {
    if (!isPlainObject(node)) return;
    if (isPlainObject(node.action)) onBinding(node.action);
    for (const key of ["template", "empty", "else"] as const) {
      if (node[key] !== undefined) visit(node[key]);
    }
    if (Array.isArray(node.children)) for (const child of node.children) visit(child);
  };
  visit(template);
  if (isPlainObject(load)) onBinding(load);
}

/** Every shared-action name a template (and an optional `load`) references by `ref`. */
export function collectActionRefs(template: unknown, load?: unknown): string[] {
  const refs = new Set<string>();
  eachBinding(template, load, (binding) => {
    if (typeof binding.ref === "string") refs.add(binding.ref);
  });
  return [...refs];
}

/** Every inline action definition in a template (and `load`), for secret-reference scans. */
export function collectInlineActions(template: unknown, load?: unknown): unknown[] {
  const out: unknown[] = [];
  eachBinding(template, load, (binding) => {
    if (typeof binding.ref !== "string" && binding.definition !== undefined) out.push(binding.definition);
  });
  return out;
}

/** Does the template (or `load`) carry any action binding at all? */
export function hasActionBindings(template: unknown, load?: unknown): boolean {
  if (load !== undefined) return true;
  return collectActionRefs(template).length > 0 || collectInlineActions(template).length > 0;
}
