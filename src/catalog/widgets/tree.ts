import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode, WidgetNodeAttrs } from "../node.js";
import { el } from "../node.js";
import { formatValue, isPlainObject } from "./format.js";

/**
 * `tree` renderer.
 *
 * Renders nested `{ label, children[] }` nodes; nodes without a usable
 * `label` get a JSON-snippet fallback (excluding `children`). Recurses only
 * into array-valued `children`. `hints.expandDepth` (default unlimited)
 * marks nodes at depth < value as expanded via `data-expanded` — state only,
 * no behavior. Total: never throws.
 */
export function renderTree(payload: WidgetPayload): WidgetNode {
  const depthHint = payload.hints?.expandDepth;
  const expandDepth =
    typeof depthHint === "number" && depthHint >= 0 ? depthHint : Infinity;
  const roots = Array.isArray(payload.data) ? payload.data : [payload.data];
  return el(
    "ul",
    { class: "wg-tree" },
    roots.map((node) => renderNode(node, 0, expandDepth))
  );
}

function nodeLabel(node: unknown): string {
  if (isPlainObject(node)) {
    if (node.label !== undefined) return formatValue(node.label);
    const { children: _children, ...rest } = node;
    if (Object.keys(rest).length > 0) return formatValue(rest);
  }
  return formatValue(node);
}

function renderNode(
  node: unknown,
  depth: number,
  expandDepth: number
): WidgetNode {
  const attrs: WidgetNodeAttrs = {
    class: "wg-tree-node",
    "data-expanded": depth < expandDepth ? "true" : "false"
  };
  const children: WidgetNode[] = [
    el("span", { class: "wg-tree-label" }, [nodeLabel(node)])
  ];
  if (
    isPlainObject(node) &&
    Array.isArray(node.children) &&
    node.children.length > 0
  ) {
    children.push(
      el(
        "ul",
        { class: "wg-tree-children" },
        node.children.map((child) => renderNode(child, depth + 1, expandDepth))
      )
    );
  }
  return el("li", attrs, children);
}
