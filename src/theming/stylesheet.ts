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
  line-height: ${v("line-height")};
  color: ${v("fg")};
}
.wg-card {
  background: var(--wg-surface, ${v("bg")});
  border: ${v("border-width")} solid ${v("border")};
  border-radius: ${v("radius-lg")};
  box-shadow: ${v("shadow")};
  padding: ${v("spacing-lg")};
}
.wg-card-title {
  color: ${v("accent")};
  font-size: ${v("font-size-lg")};
  font-weight: ${v("font-weight-bold")};
  margin-bottom: ${v("spacing")};
}
.wg-card-subtitle {
  color: ${v("muted")};
  font-size: ${v("font-size-sm")};
  margin-bottom: ${v("spacing")};
}
.wg-card-fields {
  margin: 0;
}
.wg-card-field {
  display: flex;
  gap: ${v("spacing")};
  padding: ${v("spacing-sm")} 0;
}
.wg-card-field-key {
  color: ${v("muted")};
}
.wg-card-field-value {
  margin: 0;
}
.wg-table {
  background: var(--wg-surface, ${v("bg")});
  border: ${v("border-width")} solid ${v("border")};
  border-radius: ${v("radius")};
  border-collapse: collapse;
}
.wg-table-header {
  color: ${v("muted")};
  font-size: ${v("font-size-sm")};
  font-weight: ${v("font-weight-bold")};
  text-align: left;
  border-bottom: calc(${v("border-width")} * 2) solid ${v("border")};
  padding: ${v("spacing")};
}
.wg-table-cell {
  border-bottom: ${v("border-width")} solid ${v("border")};
  padding: ${v("spacing")};
}
.wg-tree {
  list-style: none;
  margin: 0;
  padding-left: 0;
}
.wg-tree-children {
  list-style: none;
  padding-left: ${v("spacing-lg")};
  border-left: ${v("border-width")} solid ${v("border")};
}
.wg-tree-node {
  padding: ${v("spacing-sm")} 0;
}
.wg-tree-node[data-expanded="false"] > .wg-tree-children {
  display: none;
}
.wg-custom {
  font-family: ${v("font-mono")};
  background: var(--wg-surface, ${v("bg")});
  border: ${v("border-width")} solid ${v("border")};
  border-radius: ${v("radius")};
  padding: ${v("spacing")};
  overflow: auto;
}
.wg-status {
  display: inline-block;
  padding: 0 ${v("spacing-sm")};
  border-radius: ${v("radius-sm")};
  font-size: ${v("font-size-sm")};
  font-weight: ${v("font-weight-bold")};
}
.wg-status-danger { background: ${v("danger")}; color: ${v("danger-fg")}; }
.wg-status-success { background: ${v("success")}; color: ${v("success-fg")}; }
.wg-status-warning { background: ${v("warning")}; color: ${v("warning-fg")}; }
.wg-status-info { background: ${v("info")}; color: ${v("info-fg")}; }
.wg-status-accent { background: ${v("accent")}; color: ${v("accent-fg")}; }
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
