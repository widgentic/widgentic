import type { ThemeToken } from "./tokens.js";
import { THEME_TOKENS, TOKEN_DEFAULTS } from "./tokens.js";

/** `var(--wg-<token>, <light default>)` — every themeable knob goes through this. */
function v(token: ThemeToken): string {
  return `var(--wg-${token}, ${TOKEN_DEFAULTS[token]})`;
}

/**
 * Every registry token DEFINED at :root with its default, so custom
 * widget styles may reference bare `var(--wg-<token>)` and always
 * resolve. The built-in rules below carry their own fallbacks and never
 * needed this; custom authors write plain references (per the authoring
 * guide), and before this block an applied theme was the only thing that
 * defined tokens — every token it didn't set silently collapsed the
 * author's declaration (observed live: a valid widget rendered jammed
 * because `--wg-spacing-lg` was "not defined"). Themes override these
 * (later style elements and element-level applyTheme both win).
 *
 * Literals only — a chain here would NOT work: `--wg-surface:
 * var(--wg-bg, …)` substitutes against `:root`'s own `--wg-bg` at
 * computed-value time and inherits that resolved value, so a descendant
 * overriding `--wg-bg` never reaches it. Tokens declaring a `fallback`
 * are resolved where the theme is applied instead (see `withFallbacks`
 * in apply.ts); this block only guarantees a bare `var(--wg-<token>)`
 * always resolves to something.
 */
const tokenDefaultsBlock = `:root {
${THEME_TOKENS.map((token) => `  --wg-${token}: ${TOKEN_DEFAULTS[token]};`).join("\n")}
}`;

/**
 * Predefined styles for the built-in `wg-*` classes. Generated from the
 * token defaults table, so the light theme lives in exactly one place and
 * every visual knob is overridable by a theme.
 */
// One em-box for both icon forms, so an emoji and an image align on the
// same slot by construction rather than by two literals kept equal.
const ICON_BOX = "1.25em";

export const baseStylesheet = `
${tokenDefaultsBlock}
.wg-card, .wg-table, .wg-tree, .wg-code, .wg-template {
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
.wg-tree-label {
  display: flex;
  align-items: center;
  gap: ${v("spacing-sm")};
}
.wg-tree-branch > .wg-tree-label {
  cursor: pointer;
  list-style: none;
}
.wg-tree-branch > .wg-tree-label::-webkit-details-marker {
  display: none;
}
.wg-tree-branch > .wg-tree-label::before {
  content: "";
  flex: 0 0 auto;
  width: 0;
  height: 0;
  border-left: 0.4em solid ${v("muted")};
  border-top: 0.3em solid transparent;
  border-bottom: 0.3em solid transparent;
}
.wg-tree-branch[open] > .wg-tree-label::before {
  transform: rotate(90deg);
}
.wg-tree-icon {
  flex: 0 0 auto;
  width: ${ICON_BOX};
  text-align: center;
}
.wg-img-icon {
  flex: 0 0 auto;
  width: ${ICON_BOX};
  height: ${ICON_BOX};
  border-radius: ${v("radius-sm")};
}
/* Monospace block utility. No built-in emits it: it is a styling surface
   template authors opt into, and what keeps the font-mono token consumed. */
.wg-code {
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
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: ${v("radius")};
}
.wg-table-caption {
  caption-side: top;
  text-align: left;
  padding-bottom: ${v("spacing")};
}
.wg-table-title {
  display: block;
  color: ${v("accent")};
  font-size: ${v("font-size-lg")};
  font-weight: ${v("font-weight-bold")};
  margin-bottom: ${v("spacing-sm")};
}
.wg-table-subtitle {
  display: block;
  color: ${v("muted")};
  font-size: ${v("font-size-sm")};
}
.wg-tree-title {
  color: ${v("accent")};
  font-size: ${v("font-size-lg")};
  font-weight: ${v("font-weight-bold")};
  margin-bottom: ${v("spacing")};
}
.wg-link {
  color: ${v("accent")};
  text-decoration: underline;
}
.wg-group {
  display: flex;
  flex-direction: column;
}
.wg-group-row {
  flex-direction: row;
  flex-wrap: wrap;
}
.wg-group-row > * {
  flex: 1 1 240px;
  min-width: 0;
}
.wg-group-grid {
  display: grid;
}
.wg-group-grid > * {
  min-width: 0;
}
.wg-cols-1 { grid-template-columns: 1fr; }
.wg-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.wg-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.wg-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.wg-gap-none { gap: 0; }
.wg-gap-sm { gap: ${v("spacing-sm")}; }
.wg-gap-md { gap: ${v("spacing")}; }
.wg-gap-lg { gap: ${v("spacing-lg")}; }
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
