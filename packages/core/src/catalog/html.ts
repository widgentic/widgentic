import type { WidgetNode } from "./node.js";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr"
]);

// Tags and attribute names come from renderer code, never from data; these
// allowlists are defense in depth against a misbehaving custom renderer.
const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const ATTR_NAME = /^[a-zA-Z_][a-zA-Z0-9_:.-]*$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize a render tree to an HTML string. All text and attribute values
 * are escaped; the render tree has no raw-HTML node type, so agent-supplied
 * data can never inject markup.
 */
export function renderToHtml(node: WidgetNode): string {
  if (typeof node === "string") return escapeHtml(node);
  if (!TAG_NAME.test(node.tag)) return "";
  const tag = node.tag.toLowerCase();
  const attrs = node.attrs
    ? Object.entries(node.attrs)
        .filter(([name]) => ATTR_NAME.test(name))
        .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
        .join("")
    : "";
  const open = `<${tag}${attrs}>`;
  if (VOID_ELEMENTS.has(tag)) return open;
  const children = node.children?.map(renderToHtml).join("") ?? "";
  return `${open}${children}</${tag}>`;
}
