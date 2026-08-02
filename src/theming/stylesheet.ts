import type { ThemeToken } from "./tokens.js";
import { TOKEN_DEFAULTS } from "./tokens.js";

/** `var(--wg-<token>, <light default>)` — every themeable knob goes through this. */
function v(token: ThemeToken): string {
  return `var(--wg-${token}, ${TOKEN_DEFAULTS[token]})`;
}

/**
 * Predefined styles for the built-in `wg-*` classes. Generated from the
 * token defaults table, so the light theme lives in exactly one place and
 * every visual knob is overridable by a theme.
 */
export const baseStylesheet = `
.wg-card, .wg-table, .wg-tree, .wg-custom, .wg-template {
  font-family: ${v("font-family")};
  font-size: ${v("font-size")};
  color: ${v("fg")};
}
.wg-card {
  background: var(--wg-surface, ${v("bg")});
  border: 1px solid ${v("border")};
  border-radius: ${v("radius")};
  box-shadow: ${v("shadow")};
  padding: calc(${v("spacing")} * 2);
}
.wg-card-title {
  color: ${v("accent")};
  font-weight: 600;
  margin-bottom: ${v("spacing")};
}
.wg-card-subtitle {
  color: ${v("muted")};
  margin-bottom: ${v("spacing")};
}
.wg-card-fields {
  margin: 0;
}
.wg-card-field {
  display: flex;
  gap: ${v("spacing")};
  padding: calc(${v("spacing")} / 2) 0;
}
.wg-card-field-key {
  color: ${v("muted")};
}
.wg-card-field-value {
  margin: 0;
}
.wg-table {
  background: var(--wg-surface, ${v("bg")});
  border: 1px solid ${v("border")};
  border-radius: ${v("radius")};
  border-collapse: collapse;
}
.wg-table-header {
  color: ${v("muted")};
  text-align: left;
  border-bottom: 2px solid ${v("border")};
  padding: ${v("spacing")};
}
.wg-table-cell {
  border-bottom: 1px solid ${v("border")};
  padding: ${v("spacing")};
}
.wg-tree {
  list-style: none;
  margin: 0;
  padding-left: 0;
}
.wg-tree-children {
  list-style: none;
  padding-left: calc(${v("spacing")} * 2);
  border-left: 1px solid ${v("border")};
}
.wg-tree-node {
  padding: calc(${v("spacing")} / 2) 0;
}
.wg-tree-node[data-expanded="false"] > .wg-tree-children {
  display: none;
}
.wg-custom {
  background: var(--wg-surface, ${v("bg")});
  border: 1px solid ${v("border")};
  border-radius: ${v("radius")};
  padding: ${v("spacing")};
  overflow: auto;
}
.wg-img {
  object-fit: cover;
  vertical-align: middle;
  background: ${v("border")};
}
.wg-img-avatar {
  width: ${v("avatar-size")};
  height: ${v("avatar-size")};
  border-radius: 50%;
}
.wg-img-thumb {
  width: ${v("thumb-size")};
  height: ${v("thumb-size")};
  border-radius: ${v("radius")};
}
.wg-img-hero {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: ${v("radius")};
}
`.trim();

const STYLE_MARKER = "data-widgentic";

/**
 * Append the base stylesheet to the document head as a marked `<style>`
 * element. Idempotent: repeated calls leave exactly one element.
 */
export function injectBaseStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${STYLE_MARKER}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_MARKER, "base");
  style.textContent = baseStylesheet;
  doc.head.appendChild(style);
}
