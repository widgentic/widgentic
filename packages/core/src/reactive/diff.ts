import type { WidgetElementNode, WidgetNode } from "../catalog/index.js";
import { buildDom } from "./build.js";

/**
 * Patch `dom` in place so it reflects `next`, given that it currently
 * reflects `prev`. Returns the node now representing `next` — the same node
 * when patched in place, a freshly built replacement when the shape (tag or
 * node type) changed. Identity is preserved wherever shape matches.
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
