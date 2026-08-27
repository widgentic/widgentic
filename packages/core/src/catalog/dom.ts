import type { WidgetNode } from "./node.js";

/**
 * Materialize a render tree into real DOM under `container`, replacing its
 * previous children (idempotent re-mount). Elements are created via
 * `container.ownerDocument`, so this works unmodified in browsers, DOM test
 * environments, and embedders; text is set via text nodes (no HTML parsing),
 * so escaping concerns cannot arise here.
 */
export function mountNode(node: WidgetNode, container: Element): void {
  container.replaceChildren(toDom(node, container.ownerDocument));
}

function toDom(node: WidgetNode, doc: Document): Node {
  if (typeof node === "string") return doc.createTextNode(node);
  const element = doc.createElement(node.tag);
  if (node.attrs) {
    for (const [name, value] of Object.entries(node.attrs)) {
      element.setAttribute(name, value);
    }
  }
  if (node.children) {
    for (const child of node.children) {
      element.appendChild(toDom(child, doc));
    }
  }
  return element;
}
