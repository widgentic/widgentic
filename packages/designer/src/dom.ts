/**
 * Tiny DOM helpers for the designer chrome — the same hand-rolled
 * discipline as the rest of the project, sized for form-heavy panels.
 * Designer chrome classes are prefixed `wgd-` (widget content inside the
 * preview keeps the normal `wg-` classes).
 */
import { CHROME_DEFAULTS, CHROME_TOKENS, chromeCss } from "./chrome-defaults.js";
import type { ChromeOptions } from "./chrome-defaults.js";

export type Child = Node | string;

/** The first `<selector>` under `parent`, which the caller's own markup guarantees exists. */
export function requireChild<K extends keyof HTMLElementTagNameMap>(
  parent: ParentNode,
  selector: K
): HTMLElementTagNameMap[K] {
  const found = parent.querySelector(selector);
  if (found === null) throw new Error(`Designer chrome is missing a <${selector}> element.`);
  return found;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: Child[]
): HTMLElementTagNameMap[K];
export function h(tag: string, attrs?: Record<string, string>, children?: Child[]): HTMLElement;
export function h(tag: string, attrs?: Record<string, string>, children?: Child[]): HTMLElement {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value);
    }
  }
  if (children) {
    for (const child of children) {
      element.append(child);
    }
  }
  return element;
}

/** Labeled single-line input bound through a callback. */
export function textField(
  label: string,
  value: string,
  onInput: (value: string) => void
): HTMLElement {
  const input = h("input", { type: "text", class: "wgd-input" });
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return h("label", { class: "wgd-field" }, [
    h("span", { class: "wgd-field-label" }, [label]),
    input
  ]);
}

/** Labeled multi-line textarea bound through a callback. */
export function textArea(
  label: string,
  value: string,
  onInput: (value: string) => void,
  rows = 6
): HTMLElement {
  const area = h("textarea", {
    class: "wgd-textarea",
    rows: String(rows),
    spellcheck: "false"
  });
  area.value = value;
  area.addEventListener("input", () => onInput(area.value));
  // An empty label means the surrounding chrome already names the field —
  // no legend row.
  return h("label", { class: "wgd-field" }, [
    ...(label === "" ? [] : [h("span", { class: "wgd-field-label" }, [label])]),
    area
  ]);
}

/** Collapsible titled section (open by default). */
export function section(title: string, children: Child[], open = true): HTMLElement {
  const attrs: Record<string, string> = { class: "wgd-section" };
  if (open) attrs.open = "";
  return h("details", attrs, [
    h("summary", { class: "wgd-section-title" }, [title]),
    h("div", { class: "wgd-section-body" }, children)
  ]);
}

/**
 * Size a select to its SELECTED label (a bare <select> sizes to its
 * widest option, or to whatever flex hands it), so the caret sits beside
 * the text instead of drifting with leftover row width. ch tracks
 * monospace text exactly; the em term scales with padding, and the px
 * term covers the UA's caret region, which does NOT scale with font size
 * (11px selects clip under a pure em term). Re-fits on change.
 */
export function fitSelect(select: HTMLSelectElement): void {
  const fit = (): void => {
    const label = select.options[select.selectedIndex]?.text ?? select.value;
    select.style.width = `calc(${Math.max(label.length, 1)}ch + 1.2em + 18px)`;
  };
  fit();
  select.addEventListener("change", fit);
}

/**
 * Compact add-menu: one toggle button revealing the options on demand —
 * the tree stays calm instead of carrying a button per option at every
 * level. Closes on pick, outside pointer-down, or Escape.
 */
export function menuButton(
  label: string,
  title: string,
  options: string[],
  onPick: (option: string) => void
): HTMLElement {
  const wrap = h("span", { class: "wgd-menuwrap" });
  const toggle = h(
    "button",
    { class: "wgd-icon wgd-menu-toggle", type: "button", title },
    [label]
  );
  const menu = h("div", { class: "wgd-menu" });
  menu.hidden = true;

  const close = (): void => {
    menu.hidden = true;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onOutside = (event: Event): void => {
    if (!wrap.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
  };

  toggle.addEventListener("click", () => {
    if (!menu.hidden) {
      close();
      return;
    }
    menu.hidden = false;
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  });
  for (const option of options) {
    const item = h(
      "button",
      { class: "wgd-menu-item", type: "button" },
      [option]
    );
    item.addEventListener("click", () => {
      close();
      onPick(option);
    });
    menu.append(item);
  }
  wrap.append(toggle, menu);
  return wrap;
}

/** Inline diagnostic line (empty text removes it from the flow). */
export function diagnosticLine(text: string | undefined): HTMLElement {
  const el = h("div", { class: "wgd-diagnostic" }, text === undefined ? [] : [text]);
  if (text === undefined) el.setAttribute("hidden", "");
  return el;
}

// The token list and the palettes live in chrome-defaults.ts, which the
// stylesheet below is generated from; re-exported here so the modules that
// already import chrome types from this one keep working.
export { CHROME_TOKENS } from "./chrome-defaults.js";
export type { ChromeOptions, ChromeToken } from "./chrome-defaults.js";

const CHROME_TOKEN_SET: ReadonlySet<string> = new Set<string>(CHROME_TOKENS);

// On a custom property a CSS-wide keyword acts on the property itself (it
// inherits/resets the TOKEN, not the consumer), so it never expresses what
// a host means by it; hosts pass `var(--their-token, fallback)` instead.
const CSS_WIDE_KEYWORD = /^(inherit|initial|unset|revert|revert-layer)$/i;

/**
 * Apply a host's chrome on a designer root as inline custom properties —
 * the style attribute outranks every rule in the injected stylesheet, so
 * the host's values win over the light/dark defaults. Unknown tokens,
 * non-string values and CSS-wide keywords are ignored at the door.
 */
export function applyChrome(root: HTMLElement, chrome: ChromeOptions | undefined): void {
  if (chrome === undefined) return;
  for (const [token, value] of Object.entries(chrome)) {
    if (!CHROME_TOKEN_SET.has(token)) continue;
    if (typeof value !== "string" || CSS_WIDE_KEYWORD.test(value.trim())) continue;
    root.style.setProperty(`--wgd-${token}`, value);
  }
}

/** The element form of the option: a `chrome` attribute holding JSON; anything else → nothing. */
export function parseChromeAttribute(value: string | null): ChromeOptions | undefined {
  if (value === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as ChromeOptions;
  } catch {
    return undefined;
  }
}

const STYLE_MARKER = "data-widgentic-designer";

/** Designer chrome stylesheet — injected once per document. */
export function injectDesignerStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${STYLE_MARKER}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_MARKER, "chrome");
  style.textContent = `
/* Chrome tokens (CHROME_TOKENS), generated from CHROME_DEFAULTS so the
   exported palette IS the applied one. A host overrides any of them through
   options.chrome (inline on the root, which outranks these rules). Widget
   content inside the preview keeps its own --wg-* theme tokens. */
${chromeCss(CHROME_DEFAULTS, {
  selector: ".wgd-root",
  darkMediaSelector: '.wgd-root:not([data-wgd-theme="light"])',
  darkSelector: '.wgd-root[data-wgd-theme="dark"]'
})}
.wgd-root { display: flex; gap: var(--wgd-gap); font-family: var(--wgd-font); font-size: var(--wgd-font-size); align-items: flex-start; color: var(--wgd-text); background: var(--wgd-bg); }
/* Any chrome class that sets display would silently defeat the hidden
   attribute (learned live twice: the add menu, then the styles tree as a
   tab pane). hidden always wins — scoped to the designer's own tree. */
.wgd-root [hidden] { display: none !important; }
/* Read-only: editing surfaces are inert (visible, inoperable) and read
   de-emphasized; the preview and its selectors stay full-strength. The
   controls flatten into plain values — a form that cannot be typed in
   should not look like a form (opacity alone was invisible on dark). */
.wgd-readonly .wgd-section-body[inert] { opacity: 0.75; }
/* Empty preview state — shown only when there has never been a valid
   render to freeze on; a blank pane is the one state the contract bans. */
.wgd-preview-empty { color: var(--wgd-muted); font-style: italic; font-size: var(--wgd-font-size-sm); }
.wgd-readonly [inert] .wgd-input,
.wgd-readonly [inert] .wgd-select,
.wgd-readonly [inert] .wgd-textarea,
.wgd-readonly [inert] textarea.wgd-hl-input {
  border-color: transparent; background: transparent; box-shadow: none;
}
.wgd-readonly [inert] .wgd-hl { background: transparent; }
/* Controls that only exist to mutate carry no meaning here. */
.wgd-readonly [inert] .wgd-button,
.wgd-readonly [inert] .wgd-icon,
.wgd-readonly [inert] .wgd-add,
.wgd-readonly [inert] input[type="checkbox"] { opacity: 0.4; }
.wgd-panels { flex: 1 1 460px; min-width: 340px; display: flex; flex-direction: column; gap: 8px; }
.wgd-side { flex: 1 1 420px; min-width: 320px; display: flex; flex-direction: column; gap: 8px; position: sticky; top: 8px; }
.wgd-preview-pane { display: flex; flex-direction: column; gap: 8px; }
.wgd-section { border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius-lg); padding: 6px 10px; background: var(--wgd-panel); }
.wgd-section-title { cursor: pointer; font-weight: 600; }
.wgd-section-body { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.wgd-field { display: flex; flex-direction: column; gap: 2px; }
.wgd-field-label { color: var(--wgd-muted); font-size: var(--wgd-font-size-sm); }
.wgd-input, .wgd-textarea, .wgd-select { font: inherit; padding: 4px 6px; border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius); background: var(--wgd-bg); color: var(--wgd-text); }
/* Textareas fill their panel regardless of the intrinsic cols width. */
.wgd-textarea { font-family: var(--wgd-font-mono); white-space: pre; width: 100%; box-sizing: border-box; min-width: 0; resize: vertical; }
.wgd-preview .wg-designer-action { position: relative; outline: 1px dashed var(--wgd-muted); outline-offset: 2px; }
.wgd-preview .wg-designer-action::after { content: "⚡ action"; position: absolute; top: -0.9em; right: 0; font: calc(var(--wgd-font-size-xs) - 1px) var(--wgd-font); color: var(--wgd-muted); background: var(--wgd-panel); padding: 0 4px; border-radius: var(--wgd-radius-sm); pointer-events: none; }
.wgd-binding { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; border: 1px dashed var(--wgd-border); border-radius: var(--wgd-radius); margin: 4px 0; }
.wgd-binding-field { min-width: 8ch; font-family: var(--wgd-font-mono); font-size: var(--wgd-font-size-sm); }
.wgd-action-definition { display: flex; flex-direction: column; gap: 6px; }
.wgd-action-schema { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
.wgd-test-output { font: var(--wgd-font-size-sm) var(--wgd-font-mono); white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow: auto; margin: 6px 0 0; }
.wgd-diagnostic { color: var(--wgd-danger); font-size: var(--wgd-font-size-sm); white-space: pre-wrap; }
.wgd-banner { border: 1px solid var(--wgd-danger-line); background: var(--wgd-danger-bg); color: var(--wgd-danger); border-radius: var(--wgd-radius-lg); padding: 8px 10px; margin-bottom: 8px; }
/* The preview is the WIDGET's surface, not chrome: it establishes the
   --wg-* context (like composePage does for page output) so widget content
   — including custom kinds the base stylesheet doesn't color — never
   inherits the designer's own text/background. */
.wgd-preview { border: 1px dashed var(--wgd-border); border-radius: var(--wgd-radius-lg); padding: 16px; background: var(--wg-bg); color: var(--wg-fg); }
.wgd-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.wgd-button { font: inherit; padding: 4px 10px; border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius); background: var(--wgd-bg); color: var(--wgd-text); cursor: pointer; }
.wgd-button:hover { background: var(--wgd-hover); }
.wgd-tab-active { background: var(--wgd-accent-bg); border-color: var(--wgd-accent); }
/* Shared tree/editor chrome (JSON tree, schema builder/form, template tree) */
.wgd-jt-children, .wgd-children { margin-left: 10px; padding-left: 10px; border-left: 2px solid var(--wgd-line); display: flex; flex-direction: column; gap: 4px; }
.wgd-jt-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.wgd-jt-entry { padding: 2px 0; }
.wgd-jt-key { font-family: var(--wgd-font-mono); color: var(--wgd-muted); min-width: 2ch; }
.wgd-jt-keyinput, .wgd-jt-type { max-width: 12ch; }
.wgd-jt-summary { cursor: pointer; color: var(--wgd-muted); font-size: var(--wgd-font-size-sm); }
.wgd-sf-object { border: 1px solid var(--wgd-line); border-radius: var(--wgd-radius-lg); padding: 6px 10px; margin: 4px 0; }
/* Schema builder: property name + type + required on one row. */
.wgd-sb-node { margin-left: 8px; padding: 1px 0 1px 8px; border-left: 2px solid var(--wgd-line); }
.wgd-sb-row { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; padding: 1px 0; }
.wgd-sb-constraints { padding-left: 12px; }
.wgd-sb-label { color: var(--wgd-muted); font-size: var(--wgd-font-size-xs); flex: 0 0 auto; }
.wgd-sb-prop { flex: 1 1 auto; min-width: 6ch; font-family: var(--wgd-font-mono); }
.wgd-sb-type { flex: 0 0 auto; max-width: 11ch; font-size: var(--wgd-font-size-sm); }
.wgd-sb-req { display: flex; gap: 2px; align-items: center; color: var(--wgd-muted); font-size: var(--wgd-font-size-xs); flex: 0 0 auto; }
.wgd-sb-constraint { flex: 1 1 auto; min-width: 6ch; font-size: var(--wgd-font-size-sm); }
.wgd-sb-root { padding: 2px 0 2px 8px; border-left: 2px solid transparent; }
/* Schema builder: the template tree's flat discipline — chrome on
   hover/focus only, removal revealed by the row, fitted type selects. */
.wgd-schemabuilder .wgd-input, .wgd-schemabuilder .wgd-select { padding: 1px 4px; font-size: var(--wgd-font-size-sm); border-color: transparent; background: transparent; }
.wgd-schemabuilder .wgd-input:hover, .wgd-schemabuilder .wgd-select:hover,
.wgd-schemabuilder .wgd-input:focus, .wgd-schemabuilder .wgd-select:focus { border-color: var(--wgd-border); background: var(--wgd-bg); }
.wgd-schemabuilder .wgd-sb-type { flex: 0 0 auto; box-sizing: border-box; max-width: none; color: var(--wgd-accent); }
.wgd-schemabuilder .wgd-sb-prop { font-size: var(--wgd-font-size-sm); color: var(--wgd-hl-key); }
.wgd-sb-row { border-radius: var(--wgd-radius-sm); }
.wgd-sb-row:hover { background: var(--wgd-hover); }
.wgd-sb-row > .wgd-icon { visibility: hidden; }
.wgd-sb-row:hover > .wgd-icon, .wgd-sb-row:focus-within > .wgd-icon { visibility: visible; }
.wgd-schemabuilder .wgd-button { font-size: var(--wgd-font-size-xs); padding: 0 6px; border-color: transparent; color: var(--wgd-accent); background: none; }
.wgd-schemabuilder .wgd-button:hover { border-color: var(--wgd-border); background: var(--wgd-hover); }
.wgd-remove { color: var(--wgd-danger); }
/* Breathing room between a tab strip and its active pane. */
.wgd-tabs > .wgd-row { margin-bottom: 6px; }
/* Template tree: one node = one slim row; sub-structure indents below.
   Controls stay flat (chrome appears on hover/focus) so a deep template
   reads like the JSON it projects, not like a form. */
.wgd-node { padding: 0 0 0 4px; }
.wgd-node-row { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; padding: 1px 0; border-radius: var(--wgd-radius-sm); }
.wgd-node-row:hover { background: var(--wgd-hover); }
.wgd-node-badge { font-family: var(--wgd-font-mono); font-size: var(--wgd-font-size-xs); color: var(--wgd-accent); background: var(--wgd-accent-bg); border-radius: var(--wgd-radius-sm); padding: 0 5px; flex: 0 0 auto; }
.wgd-node-icons { display: flex; gap: 2px; margin-left: auto; flex: 0 0 auto; visibility: hidden; }
.wgd-node-row:hover > .wgd-node-icons, .wgd-node-row:focus-within > .wgd-node-icons { visibility: visible; }
.wgd-node-value { flex: 1 1 auto; min-width: 4ch; }
.wgd-icon { font: inherit; font-size: var(--wgd-font-size-xs); line-height: 1.4; padding: 0 5px; border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius-sm); background: var(--wgd-bg); cursor: pointer; color: var(--wgd-muted); }
.wgd-icon:hover { background: var(--wgd-hover); }
/* Compact controls: inside tree nodes, and wherever a section opts in with
   .wgd-compact (the Load action editor mirrors an element's binding editor). */
.wgd-node .wgd-input, .wgd-node .wgd-select,
.wgd-compact .wgd-input, .wgd-compact .wgd-select { padding: 1px 4px; font-size: var(--wgd-font-size-sm); border-color: transparent; background: transparent; }
.wgd-node .wgd-input:hover, .wgd-node .wgd-select:hover, .wgd-compact .wgd-input:hover, .wgd-compact .wgd-select:hover,
.wgd-node .wgd-input:focus, .wgd-node .wgd-select:focus, .wgd-compact .wgd-input:focus, .wgd-compact .wgd-select:focus { border-color: var(--wgd-border); background: var(--wgd-bg); }
.wgd-compact .wgd-binding { border: none; padding: 0; }
/* Busy controls (the host-supplied Test call): disabled, with a spinner. */
.wgd-button.wgd-busy { opacity: 0.7; cursor: progress; }
.wgd-button.wgd-busy::after { content: ""; display: inline-block; width: 10px; height: 10px; margin-left: 6px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -1px; animation: wgd-spin 0.8s linear infinite; }
@keyframes wgd-spin { to { transform: rotate(360deg); } }
.wgd-tagwrap, .wgd-pathwrap { display: contents; }
/* Collapse chevron: every tree row reserves the column so values align. */
.wgd-chevron { flex: 0 0 auto; width: 16px; padding: 0; border: none; background: none; color: var(--wgd-muted); font-size: calc(var(--wgd-font-size-xs) - 1px); cursor: pointer; }
.wgd-chevron-none { visibility: hidden; }
.wgd-node-summary { color: var(--wgd-muted); font-size: var(--wgd-font-size-xs); flex: 0 0 auto; }
/* Attrs vs children: attributes group under a dotted muted rail with
   key-colored names; children keep the solid accent rail. */
.wgd-attrs { margin-left: 14px; padding-left: 8px; border-left: 2px dotted var(--wgd-border); display: flex; flex-direction: column; gap: 1px; }
.wgd-attr-row { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; padding: 0; }
.wgd-attr-row > .wgd-icon { visibility: hidden; }
.wgd-attr-row:hover > .wgd-icon, .wgd-attr-row:focus-within > .wgd-icon { visibility: visible; }
.wgd-attr-name { font-family: var(--wgd-font-mono); color: var(--wgd-hl-key); flex: 0 1 auto; min-width: 5ch; }
.wgd-attr-prefix { flex: 0 1 auto; min-width: 6ch; max-width: 10ch; font-family: var(--wgd-font-mono); color: var(--wgd-hl-str); }
.wgd-attr { display: flex; flex-direction: column; gap: 1px; }
/* Transform block under a bind attr: one more dotted level in. */
.wgd-attr-map { margin-left: 24px; padding-left: 8px; border-left: 2px dotted var(--wgd-border); display: flex; flex-direction: column; gap: 1px; }
.wgd-attr-map-default { flex: 1 1 auto; min-width: 8ch; }
.wgd-attr-mode { flex: 0 0 auto; color: var(--wgd-muted); font-size: var(--wgd-font-size-xs); }
.wgd-children { margin-left: 14px; padding-left: 8px; border-left: 2px solid var(--wgd-accent-line); gap: 1px; }
.wgd-slot { display: flex; flex-direction: column; gap: 1px; }
.wgd-slot-label { color: var(--wgd-muted); font-size: var(--wgd-font-size-xs); font-style: italic; padding-left: 4px; }
/* Add menu: one toggle, options in a popover. */
.wgd-menuwrap { position: relative; display: inline-flex; }
.wgd-menu-toggle { color: var(--wgd-accent); }
.wgd-menu { position: absolute; top: 100%; left: 0; z-index: 10; min-width: 9ch; display: flex; flex-direction: column; background: var(--wgd-panel); border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius); box-shadow: var(--wgd-shadow); padding: 2px; }
/* An OPEN menu must not inherit the icons' hover-gated visibility:
   visibility (unlike display) lets a child re-assert visible. */
.wgd-menu:not([hidden]) { visibility: visible; }
.wgd-menuwrap:has(> .wgd-menu:not([hidden])) { visibility: visible; }
/* Menus in the right-aligned icons area hang leftward, not off-panel. */
.wgd-node-icons .wgd-menu { left: auto; right: 0; }
.wgd-menu-item { font: inherit; font-size: var(--wgd-font-size-sm); text-align: left; padding: 3px 8px; border: none; border-radius: var(--wgd-radius-sm); background: none; color: var(--wgd-text); cursor: pointer; white-space: nowrap; }
.wgd-menu-item:hover { background: var(--wgd-accent-bg); color: var(--wgd-accent); }
/* Styles tree: selector rows with declaration rows — the same flat
   template-tree discipline (flat inputs, hover-revealed icons). */
.wgd-styles { display: flex; flex-direction: column; gap: 2px; }
.wgd-st-row { display: flex; gap: 4px; align-items: center; border-radius: var(--wgd-radius-sm); }
.wgd-st-row:hover { background: var(--wgd-hover); }
.wgd-st-row:hover > .wgd-node-icons, .wgd-st-row:focus-within > .wgd-node-icons { visibility: visible; }
.wgd-styles .wgd-input { padding: 1px 4px; font-size: var(--wgd-font-size-sm); font-family: var(--wgd-font-mono); border-color: transparent; background: transparent; }
.wgd-styles .wgd-input:hover, .wgd-styles .wgd-input:focus { border-color: var(--wgd-border); background: var(--wgd-bg); }
.wgd-st-selector { flex: 1 1 auto; min-width: 8ch; color: var(--wgd-accent); }
.wgd-st-decls { margin-left: 14px; padding-left: 8px; border-left: 2px dotted var(--wgd-border); display: flex; flex-direction: column; gap: 1px; }
.wgd-st-decl { display: flex; gap: 2px; align-items: center; border-radius: var(--wgd-radius-sm); }
.wgd-st-decl:hover { background: var(--wgd-hover); }
.wgd-st-decl > .wgd-icon { visibility: hidden; }
.wgd-st-decl:hover > .wgd-icon, .wgd-st-decl:focus-within > .wgd-icon { visibility: visible; }
.wgd-st-prop { flex: 0 1 auto; min-width: 8ch; color: var(--wgd-hl-key); }
.wgd-st-value { flex: 1 1 auto; min-width: 8ch; }
.wgd-st-colon { color: var(--wgd-muted); flex: 0 0 auto; }
.wgd-st-add { font-size: var(--wgd-font-size-xs); padding: 0 6px; border-color: transparent; color: var(--wgd-accent); background: none; }
.wgd-st-add:hover { border-color: var(--wgd-border); background: var(--wgd-hover); }
/* Import and export stack as sibling sections with the column's rhythm. */
.wgd-io { display: flex; flex-direction: column; gap: 8px; }
/* Flat string→string record rows (hints): mono keys, prose values. */
.wgd-record { display: flex; flex-direction: column; gap: 1px; }
.wgd-rec-row { display: flex; gap: 2px; align-items: center; border-radius: var(--wgd-radius-sm); }
.wgd-rec-row:hover { background: var(--wgd-hover); }
.wgd-rec-row > .wgd-icon { visibility: hidden; }
.wgd-rec-row:hover > .wgd-icon, .wgd-rec-row:focus-within > .wgd-icon { visibility: visible; }
.wgd-record .wgd-input { padding: 1px 4px; font-size: var(--wgd-font-size-sm); border-color: transparent; background: transparent; }
.wgd-record .wgd-input:hover, .wgd-record .wgd-input:focus { border-color: var(--wgd-border); background: var(--wgd-bg); }
.wgd-rec-key { flex: 0 1 auto; min-width: 8ch; font-family: var(--wgd-font-mono); color: var(--wgd-hl-key); }
.wgd-rec-value { flex: 1 1 auto; min-width: 8ch; }
/* The tag select IS the element node's label: flat, accent, monospace.
   Tag and path selects are width-fitted to their SELECTED value by the
   panel (fitSelect), so carets hug the text — no flex stretching here. */
.wgd-node .wgd-tag { flex: 0 0 auto; font-family: var(--wgd-font-mono); font-size: var(--wgd-font-size-xs); color: var(--wgd-accent); background: var(--wgd-accent-bg); border: 1px solid transparent; border-radius: var(--wgd-radius-sm); padding: 0 4px; }
.wgd-node .wgd-tag:hover, .wgd-node .wgd-tag:focus { border-color: var(--wgd-accent-line); }
.wgd-node .wgd-path { flex: 0 1 auto; min-width: 6ch; max-width: 100%; font-family: var(--wgd-font-mono); }
.wgd-node .wgd-select { box-sizing: border-box; }
/* Theme panel: swatch beside each color token. */
/* Syntax coloring: <pre> layer behind a transparent-text textarea. Every
   metric here must mirror .wgd-textarea or the glyphs drift apart. */
.wgd-hlwrap { position: relative; }
.wgd-hl, .wgd-hl-input {
  font-family: var(--wgd-font-mono); font-size: var(--wgd-font-size); line-height: 1.45;
  padding: 4px 6px; border: 1px solid transparent; border-radius: var(--wgd-radius);
  box-sizing: border-box; white-space: pre; tab-size: 2; letter-spacing: normal;
}
.wgd-hl {
  position: absolute; inset: 0; margin: 0; overflow: hidden;
  pointer-events: none; z-index: 0; background: var(--wgd-bg);
  color: var(--wgd-text);
}
textarea.wgd-hl-input {
  position: relative; z-index: 1; background: transparent; color: transparent;
  caret-color: var(--wgd-text); border-color: var(--wgd-border);
}
.wgd-hl-k { color: var(--wgd-hl-key); }
.wgd-hl-s { color: var(--wgd-hl-str); }
.wgd-hl-n { color: var(--wgd-hl-num); }
.wgd-hl-b { color: var(--wgd-hl-bool); }
.wgd-hl-p { color: var(--wgd-hl-punct); }
.wgd-swatch { flex: 0 0 auto; width: 26px; height: 22px; padding: 0; border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius); background: none; cursor: pointer; }
.wgd-token-row { display: flex; gap: 6px; align-items: center; }
.wgd-token-row .wgd-input { flex: 1 1 auto; min-width: 6ch; font-family: var(--wgd-font-mono); font-size: var(--wgd-font-size-sm); }
.wgd-token-ref { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; margin-top: 4px; }
.wgd-token-ref-row { display: flex; gap: 6px; align-items: center; font-size: var(--wgd-font-size-xs); }
.wgd-token-ref-swatch { flex: 0 0 auto; width: 14px; height: 14px; border: 1px solid var(--wgd-border); border-radius: var(--wgd-radius-sm); }
.wgd-token-ref-noswatch { border-style: dashed; opacity: 0.35; }
.wgd-token-ref-name { font-family: var(--wgd-font-mono); color: var(--wgd-accent); }
.wgd-token-ref-value { color: var(--wgd-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wgd-token-ref-details summary { cursor: pointer; }
`;
  doc.head.appendChild(style);
}
