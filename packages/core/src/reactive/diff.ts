import type { WidgetElementNode, WidgetNode } from "../catalog/index.js";
import { buildDom } from "./build.js";

/**
 * Patch `dom` in place so it reflects `next`, given that it currently
 * reflects `prev`. Returns the node now representing `next` — the same node
 * when patched in place, a freshly built replacement when the shape (tag or
 * node type) changed. Identity is preserved wherever shape matches. Sibling
 * lists pair by `key` when every child of both lists is a uniquely keyed
 * element — existing nodes MOVE with their record — and by position
 * otherwise. The app template's inline patcher implements the same rule.
 */
export function patchNode(prev: WidgetNode, next: WidgetNode, dom: Node): Node {
  if (typeof prev === "string" && typeof next === "string") {
    if (prev !== next) dom.nodeValue = next;
    return dom;
  }
  if (
    typeof prev !== "string" &&
    typeof next !== "string" &&
    prev.tag === next.tag &&
    dom.nodeType === 1
  ) {
    patchElement(prev, next, dom as Element);
    return dom;
  }
  // Shape changed: replace only this subtree.
  const doc = dom.ownerDocument;
  if (!doc || !dom.parentNode) return dom;
  const replacement = buildDom(next, doc);
  dom.parentNode.replaceChild(replacement, dom);
  return replacement;
}

function patchElement(
  prev: WidgetElementNode,
  next: WidgetElementNode,
  element: Element
): void {
  const prevAttrs = prev.attrs ?? {};
  const nextAttrs = next.attrs ?? {};
  for (const [name, value] of Object.entries(nextAttrs)) {
    if (prevAttrs[name] !== value) element.setAttribute(name, value);
  }
  for (const name of Object.keys(prevAttrs)) {
    if (!(name in nextAttrs)) element.removeAttribute(name);
  }
  patchChildren(prev.children ?? [], next.children ?? [], element);
}

/**
 * Key → index for a list in which every child is an element with a unique
 * key; `undefined` for any other list (text child, unkeyed element,
 * duplicate key), which then pairs by position.
 */
function keyIndex(list: readonly WidgetNode[]): Map<string, number> | undefined {
  const index = new Map<string, number>();
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node === undefined || typeof node === "string" || typeof node.key !== "string") {
      return undefined;
    }
    if (index.has(node.key)) return undefined;
    index.set(node.key, i);
  }
  return index;
}

function patchKeyed(
  prev: readonly WidgetNode[],
  next: readonly WidgetElementNode[],
  prevIndex: Map<string, number>,
  domChildren: readonly Node[],
  element: Element
): void {
  const doc = element.ownerDocument;
  const kept = new Set<number>();
  const placed = next.map((child) => {
    const i = child.key === undefined ? undefined : prevIndex.get(child.key);
    const prevChild = i === undefined ? undefined : prev[i];
    const dom = i === undefined ? undefined : domChildren[i];
    if (i === undefined || prevChild === undefined || dom === undefined) {
      return buildDom(child, doc);
    }
    kept.add(i);
    return patchNode(prevChild, child, dom);
  });
  domChildren.forEach((dom, i) => {
    if (!kept.has(i) && dom.parentNode === element) element.removeChild(dom);
  });
  // Moving a node keeps its state (a visitor's `open`); only misplaced
  // nodes are touched.
  placed.forEach((dom, i) => {
    const at = element.childNodes[i] ?? null;
    if (dom !== at) element.insertBefore(dom, at);
  });
}

function patchChildren(
  prev: readonly WidgetNode[],
  next: readonly WidgetNode[],
  element: Element
): void {
  const doc = element.ownerDocument;
  // Snapshot: childNodes is live and patchNode may replace entries.
  const domChildren: Node[] = [];
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child) domChildren.push(child);
  }

  const prevIndex = keyIndex(prev);
  if (prevIndex !== undefined && keyIndex(next) !== undefined) {
    const elements = next.filter((child): child is WidgetElementNode => typeof child !== "string");
    patchKeyed(prev, elements, prevIndex, domChildren, element);
    return;
  }

  const shared = Math.min(prev.length, next.length);
  for (let i = 0; i < shared; i++) {
    const prevChild = prev[i];
    const nextChild = next[i];
    const childDom = domChildren[i];
    if (prevChild === undefined || nextChild === undefined) continue;
    if (childDom) {
      patchNode(prevChild, nextChild, childDom);
    } else {
      element.appendChild(buildDom(nextChild, doc));
    }
  }
  for (let i = shared; i < next.length; i++) {
    const extra = next[i];
    if (extra !== undefined) element.appendChild(buildDom(extra, doc));
  }
  for (let i = prev.length - 1; i >= shared; i--) {
    const surplus = domChildren[i];
    if (surplus) element.removeChild(surplus);
  }
}
