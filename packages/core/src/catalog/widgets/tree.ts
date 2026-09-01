import type { WidgetPayload } from "../../contract/types.js";
import type { WidgetNode } from "../node.js";
import { el } from "../node.js";
import { formatValue, isPlainObject } from "./format.js";
import { imageNode, resolveImage } from "./images.js";

/**
 * `tree` renderer.
 *
 * Renders nested `{ label, icon?, children[] }` nodes; nodes without a
 * usable `label` get a JSON-snippet fallback (excluding `children` and
 * `icon`). Recurses only into array-valued `children`. A node with children
 * renders as a native `details`/`summary` disclosure, so branches expand and
 * collapse with no script in every context the HTML reaches;
 * `hints.expandDepth` (default unlimited) selects the INITIAL state by
 * marking nodes at depth < value `open`. Leaves carry no disclosure.
 * Total: never throws.
 */
export function renderTree(payload: WidgetPayload): WidgetNode {
  const depthHint = payload.hints?.expandDepth;
  // Negative depths clamp to 0 (everything collapsed): `depth < value` must
  // hold monotonically, or -1 would flip a fully-collapsed tree fully open.
  const expandDepth =
    typeof depthHint === "number" && !Number.isNaN(depthHint)
      ? Math.max(0, depthHint)
      : Infinity;
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
    // The fallback snippet always excludes `children` and `icon` — a node
    // carrying only those must not print its own subtree as its label.
    const { children: _children, icon: _icon, ...rest } = node;
    return formatValue(rest);
  }
  return formatValue(node);
}

/**
 * The node's optional visual anchor, before the label. The same gate card
 * and table use decides image treatment — one rule to audit — and anything
 * else (an emoji, a glyph, an unsafe URL) stays text. Decorative: the alt is
 * empty because the label already carries the meaning.
 */
function iconNode(icon: unknown): WidgetNode | undefined {
  if (typeof icon !== "string") return undefined;
  const image = resolveImage("", icon, undefined, "icon");
  if (image !== null) return imageNode("", image.src, image.shape);
  return el("span", { class: "wg-tree-icon" }, [icon]);
}

function labelChildren(node: unknown): WidgetNode[] {
  const icon = isPlainObject(node) ? iconNode(node.icon) : undefined;
  const label = nodeLabel(node);
  return icon === undefined ? [label] : [icon, label];
}

// Deeper trees than any honest payload; past it nodes render as leaves so a
// hostile nesting cannot overflow the recursive renderer or the serializers.
const MAX_TREE_DEPTH = 64;

const childrenOf = (node: unknown): unknown[] | undefined =>
  isPlainObject(node) && Array.isArray(node.children) && node.children.length > 0
    ? node.children
    : undefined;

function renderNode(
  node: unknown,
  depth: number,
  expandDepth: number
): WidgetNode {
  const childNodes = depth < MAX_TREE_DEPTH ? childrenOf(node) : undefined;

  // Leaves are plain labels: the presence of the disclosure is what marks a
  // branch, so a leaf must not offer a toggle affordance.
  if (childNodes === undefined) {
    return el("li", { class: "wg-tree-node" }, [
      el("span", { class: "wg-tree-label" }, labelChildren(node))
    ]);
  }
  // `open` is a pure function of data + hints, so an unchanged branch
  // re-emits the same attributes and the in-place patchers leave a
  // visitor's own toggle alone.
  const isOpen = depth < expandDepth;
  return el("li", { class: "wg-tree-node" }, [
    el(
      "details",
      { class: "wg-tree-branch", ...(isOpen ? { open: "" } : {}) },
      [
        el("summary", { class: "wg-tree-label" }, labelChildren(node)),
        el(
          "ul",
          { class: "wg-tree-children" },
          childNodes.map((child) => renderNode(child, depth + 1, expandDepth))
        )
      ]
    )
  ]);
}
