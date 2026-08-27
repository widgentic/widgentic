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
  const list = el(
    "ul",
    { class: "wg-tree" },
    roots.map((node) => renderNode(node, 0, expandDepth))
  );
  // Title chrome from meta — tree data has no title slot, so meta is the
  // only source; absence means no title line.
  const title = payload.meta?.title;
  if (title === undefined) return list;
  return el("div", { class: "wg-tree-titled" }, [
    el("div", { class: "wg-tree-title" }, [formatValue(title)]),
    list
  ]);
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
  const hasChildren =
    isPlainObject(node) &&
    Array.isArray(node.children) &&
    node.children.length > 0;

  // The expansion attribute marks expandable branches only — its presence
  // identifies a branch, its value the initial state. Leaves carry none.
  const attrs: WidgetNodeAttrs = hasChildren
    ? {
        class: "wg-tree-node",
        "data-expanded": depth < expandDepth ? "true" : "false"
      }
    : { class: "wg-tree-node" };

  const children: WidgetNode[] = [
    el("span", { class: "wg-tree-label" }, [nodeLabel(node)])
  ];
  if (hasChildren) {
    children.push(
      el(
        "ul",
        { class: "wg-tree-children" },
        (node.children as unknown[]).map((child) =>
          renderNode(child, depth + 1, expandDepth)
        )
      )
    );
  }
  return el("li", attrs, children);
}
