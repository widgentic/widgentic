import type { WidgetNode } from "../catalog/index.js";

/**
 * Materialize a render tree as fresh DOM. Text becomes text nodes (no HTML
 * parsing), matching the catalog DOM layer's safety discipline. Private to
 * the reactive module — the catalog's builder stays private to its own.
 */
export function buildDom(node: WidgetNode, doc: Document): Node {
  if (typeof node === "string") return doc.createTextNode(node);
  const element = doc.createElement(node.tag);
  if (node.attrs) {
    for (const [name, value] of Object.entries(node.attrs)) {
      element.setAttribute(name, value);
    }
  }
  if (node.children) {
    for (const child of node.children) {
      element.appendChild(buildDom(child, doc));
    }
  }
  return element;
}
