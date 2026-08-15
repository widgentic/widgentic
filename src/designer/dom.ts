/**
 * Tiny DOM helpers for the designer chrome — the same hand-rolled
 * discipline as the rest of the project, sized for form-heavy panels.
 * Designer chrome classes are prefixed `wgd-` (widget content inside the
 * preview keeps the normal `wg-` classes).
 */

export type Child = Node | string;

export function h(
  tag: string,
  attrs?: Record<string, string>,
  children?: Child[]
): HTMLElement {
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
  const input = h("input", { type: "text", class: "wgd-input" }) as HTMLInputElement;
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
  }) as HTMLTextAreaElement;
  area.value = value;
  area.addEventListener("input", () => onInput(area.value));
  return h("label", { class: "wgd-field" }, [
    h("span", { class: "wgd-field-label" }, [label]),
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

const STYLE_MARKER = "data-widgentic-designer";

/** Designer chrome stylesheet — injected once per document. */
export function injectDesignerStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${STYLE_MARKER}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(STYLE_MARKER, "chrome");
  style.textContent = `
/* Chrome palette — light values, overridden for dark below. Widget
   content inside the preview keeps its own --wg-* theme tokens. */
.wgd-root {
  --wgd-bg: #ffffff; --wgd-panel: #fbfcfe; --wgd-border: #d5dbe3;
  --wgd-line: #e2e8f0; --wgd-text: #1f2430; --wgd-muted: #5b6472;
  --wgd-accent: #2563eb; --wgd-accent-bg: #e8eef9; --wgd-accent-line: #b9c9e8;
  --wgd-danger: #b91c1c; --wgd-danger-bg: #fdf2f2; --wgd-danger-line: #f0b4b4;
  --wgd-hover: #eef2f7;
  --wgd-hl-key: #0b5fa5; --wgd-hl-str: #0a7a3d; --wgd-hl-num: #b45309;
  --wgd-hl-bool: #7c3aed; --wgd-hl-punct: #7a8494;
}
@media (prefers-color-scheme: dark) {
  .wgd-root:not([data-wgd-theme="light"]) {
    --wgd-bg: #0f131c; --wgd-panel: #161b26; --wgd-border: #2a3140;
    --wgd-line: #232a37; --wgd-text: #e5e9f0; --wgd-muted: #96a0b5;
    --wgd-accent: #7aa2f7; --wgd-accent-bg: #1c2740; --wgd-accent-line: #35507f;
    --wgd-danger: #f0a3a3; --wgd-danger-bg: #2a1a1c; --wgd-danger-line: #5c2b2b;
    --wgd-hover: #1e2532;
    --wgd-hl-key: #7aa2f7; --wgd-hl-str: #9ece6a; --wgd-hl-num: #ff9e64;
    --wgd-hl-bool: #bb9af7; --wgd-hl-punct: #8b94a7;
  }
}
.wgd-root[data-wgd-theme="dark"] {
  --wgd-bg: #0f131c; --wgd-panel: #161b26; --wgd-border: #2a3140;
  --wgd-line: #232a37; --wgd-text: #e5e9f0; --wgd-muted: #96a0b5;
  --wgd-accent: #7aa2f7; --wgd-accent-bg: #1c2740; --wgd-accent-line: #35507f;
  --wgd-danger: #f0a3a3; --wgd-danger-bg: #2a1a1c; --wgd-danger-line: #5c2b2b;
  --wgd-hover: #1e2532;
  --wgd-hl-key: #7aa2f7; --wgd-hl-str: #9ece6a; --wgd-hl-num: #ff9e64;
  --wgd-hl-bool: #bb9af7; --wgd-hl-punct: #8b94a7;
}
.wgd-root { display: flex; gap: 16px; font-family: system-ui, sans-serif; font-size: 13px; align-items: flex-start; color: var(--wgd-text); background: var(--wgd-bg); }
.wgd-panels { flex: 1 1 460px; min-width: 340px; display: flex; flex-direction: column; gap: 8px; }
.wgd-side { flex: 1 1 420px; min-width: 320px; display: flex; flex-direction: column; gap: 8px; position: sticky; top: 8px; }
.wgd-preview-pane { display: flex; flex-direction: column; gap: 8px; }
.wgd-section { border: 1px solid var(--wgd-border); border-radius: 6px; padding: 6px 10px; background: var(--wgd-panel); }
.wgd-section-title { cursor: pointer; font-weight: 600; }
.wgd-section-body { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.wgd-field { display: flex; flex-direction: column; gap: 2px; }
.wgd-field-label { color: var(--wgd-muted); font-size: 12px; }
.wgd-input, .wgd-textarea, .wgd-select { font: inherit; padding: 4px 6px; border: 1px solid var(--wgd-border); border-radius: 4px; background: var(--wgd-bg); color: var(--wgd-text); }
/* Textareas fill their panel regardless of the intrinsic cols width. */
.wgd-textarea { font-family: ui-monospace, monospace; white-space: pre; width: 100%; box-sizing: border-box; min-width: 0; resize: vertical; }
.wgd-diagnostic { color: var(--wgd-danger); font-size: 12px; white-space: pre-wrap; }
.wgd-banner { border: 1px solid var(--wgd-danger-line); background: var(--wgd-danger-bg); color: var(--wgd-danger); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
/* The preview is the WIDGET's surface, not chrome: it establishes the
   --wg-* context (like composePage does for page output) so widget content
   — including custom kinds the base stylesheet doesn't color — never
   inherits the designer's own text/background. */
.wgd-preview { border: 1px dashed var(--wgd-border); border-radius: 6px; padding: 16px; background: var(--wg-bg, #ffffff); color: var(--wg-fg, #1f2430); }
.wgd-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.wgd-button { font: inherit; padding: 4px 10px; border: 1px solid var(--wgd-border); border-radius: 4px; background: var(--wgd-bg); color: var(--wgd-text); cursor: pointer; }
.wgd-button:hover { background: var(--wgd-hover); }
.wgd-tab-active { background: var(--wgd-accent-bg); border-color: var(--wgd-accent); }
/* Shared tree/editor chrome (JSON tree, schema builder/form, template tree) */
.wgd-jt-children, .wgd-children { margin-left: 10px; padding-left: 10px; border-left: 2px solid var(--wgd-line); display: flex; flex-direction: column; gap: 4px; }
.wgd-jt-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.wgd-jt-entry { padding: 2px 0; }
.wgd-jt-key { font-family: ui-monospace, monospace; color: var(--wgd-muted); min-width: 2ch; }
.wgd-jt-keyinput, .wgd-jt-type { max-width: 12ch; }
.wgd-jt-summary { cursor: pointer; color: var(--wgd-muted); font-size: 12px; }
.wgd-sf-object { border: 1px solid var(--wgd-line); border-radius: 6px; padding: 6px 10px; margin: 4px 0; }
/* Schema builder: property name + type + required on one row. */
.wgd-sb-node { margin-left: 8px; padding: 1px 0 1px 8px; border-left: 2px solid var(--wgd-line); }
.wgd-sb-row { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; padding: 1px 0; }
.wgd-sb-constraints { padding-left: 12px; }
.wgd-sb-label { color: var(--wgd-muted); font-size: 11px; flex: 0 0 auto; }
.wgd-sb-prop { flex: 1 1 auto; min-width: 6ch; font-family: ui-monospace, monospace; }
.wgd-sb-type { flex: 0 0 auto; max-width: 11ch; font-size: 12px; }
.wgd-sb-req { display: flex; gap: 2px; align-items: center; color: var(--wgd-muted); font-size: 11px; flex: 0 0 auto; }
.wgd-sb-constraint { flex: 1 1 auto; min-width: 6ch; font-size: 12px; }
.wgd-sb-root { padding: 2px 0 2px 8px; border-left: 2px solid transparent; }
.wgd-schemabuilder .wgd-input, .wgd-schemabuilder .wgd-select { padding: 1px 4px; }
.wgd-remove { color: var(--wgd-danger); }
/* Breathing room between a tab strip and its active pane. */
.wgd-tabs > .wgd-row { margin-bottom: 6px; }
/* Template tree: one node = one slim row; sub-structure indents below.
   Controls stay flat (chrome appears on hover/focus) so a deep template
   reads like the JSON it projects, not like a form. */
.wgd-node { padding: 0 0 0 4px; }
.wgd-node-row { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; padding: 1px 0; border-radius: 3px; }
.wgd-node-row:hover { background: var(--wgd-hover); }
.wgd-node-badge { font-family: ui-monospace, monospace; font-size: 11px; color: var(--wgd-accent); background: var(--wgd-accent-bg); border-radius: 3px; padding: 0 5px; flex: 0 0 auto; }
.wgd-node-icons { display: flex; gap: 2px; margin-left: auto; flex: 0 0 auto; visibility: hidden; }
.wgd-node-row:hover > .wgd-node-icons, .wgd-node-row:focus-within > .wgd-node-icons { visibility: visible; }
.wgd-node-value { flex: 1 1 auto; min-width: 4ch; }
.wgd-icon { font: inherit; font-size: 11px; line-height: 1.4; padding: 0 5px; border: 1px solid var(--wgd-border); border-radius: 3px; background: var(--wgd-bg); cursor: pointer; color: var(--wgd-muted); }
.wgd-icon:hover { background: var(--wgd-hover); }
.wgd-node .wgd-input, .wgd-node .wgd-select { padding: 1px 4px; font-size: 12px; border-color: transparent; background: transparent; }
.wgd-node .wgd-input:hover, .wgd-node .wgd-select:hover,
.wgd-node .wgd-input:focus, .wgd-node .wgd-select:focus { border-color: var(--wgd-border); background: var(--wgd-bg); }
.wgd-tagwrap, .wgd-pathwrap { display: contents; }
/* Collapse chevron: every tree row reserves the column so values align. */
.wgd-chevron { flex: 0 0 auto; width: 16px; padding: 0; border: none; background: none; color: var(--wgd-muted); font-size: 10px; cursor: pointer; }
.wgd-chevron-none { visibility: hidden; }
.wgd-node-summary { color: var(--wgd-muted); font-size: 11px; flex: 0 0 auto; }
/* Attrs vs children: attributes group under a dotted muted rail with
   key-colored names; children keep the solid accent rail. */
.wgd-attrs { margin-left: 14px; padding-left: 8px; border-left: 2px dotted var(--wgd-border); display: flex; flex-direction: column; gap: 1px; }
.wgd-attr-row { display: flex; gap: 4px; align-items: center; flex-wrap: nowrap; padding: 0; }
.wgd-attr-row > .wgd-icon { visibility: hidden; }
.wgd-attr-row:hover > .wgd-icon, .wgd-attr-row:focus-within > .wgd-icon { visibility: visible; }
.wgd-attr-name { font-family: ui-monospace, monospace; color: var(--wgd-hl-key); flex: 0 1 auto; min-width: 5ch; }
.wgd-attr-mode { flex: 0 0 auto; color: var(--wgd-muted); font-size: 11px; }
.wgd-children { margin-left: 14px; padding-left: 8px; border-left: 2px solid var(--wgd-accent-line); gap: 1px; }
.wgd-slot { display: flex; flex-direction: column; gap: 1px; }
.wgd-slot-label { color: var(--wgd-muted); font-size: 11px; font-style: italic; padding-left: 4px; }
/* Add menu: one toggle, options in a popover. */
.wgd-menuwrap { position: relative; display: inline-flex; }
.wgd-menu-toggle { color: var(--wgd-accent); }
.wgd-menu { position: absolute; top: 100%; left: 0; z-index: 10; min-width: 9ch; display: flex; flex-direction: column; background: var(--wgd-panel); border: 1px solid var(--wgd-border); border-radius: 4px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); padding: 2px; }
/* display:flex above would defeat the hidden attribute — restate it. */
.wgd-menu[hidden] { display: none; }
/* An OPEN menu must not inherit the icons' hover-gated visibility:
   visibility (unlike display) lets a child re-assert visible. */
.wgd-menu:not([hidden]) { visibility: visible; }
.wgd-menuwrap:has(> .wgd-menu:not([hidden])) { visibility: visible; }
/* Menus in the right-aligned icons area hang leftward, not off-panel. */
.wgd-node-icons .wgd-menu { left: auto; right: 0; }
.wgd-menu-item { font: inherit; font-size: 12px; text-align: left; padding: 3px 8px; border: none; border-radius: 3px; background: none; color: var(--wgd-text); cursor: pointer; white-space: nowrap; }
.wgd-menu-item:hover { background: var(--wgd-accent-bg); color: var(--wgd-accent); }
/* The tag select IS the element node's label: flat, accent, monospace. */
.wgd-node .wgd-tag { flex: 0 0 auto; max-width: 14ch; font-family: ui-monospace, monospace; font-size: 11px; color: var(--wgd-accent); background: var(--wgd-accent-bg); border: 1px solid transparent; border-radius: 3px; padding: 0 4px; }
.wgd-node .wgd-tag:hover, .wgd-node .wgd-tag:focus { border-color: var(--wgd-accent-line); }
.wgd-node .wgd-path { flex: 1 1 auto; min-width: 6ch; font-family: ui-monospace, monospace; }
/* Theme panel: swatch beside each color token. */
/* Syntax coloring: <pre> layer behind a transparent-text textarea. Every
   metric here must mirror .wgd-textarea or the glyphs drift apart. */
.wgd-hlwrap { position: relative; }
.wgd-hl, .wgd-hl-input {
  font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.45;
  padding: 4px 6px; border: 1px solid transparent; border-radius: 4px;
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
.wgd-swatch { flex: 0 0 auto; width: 26px; height: 22px; padding: 0; border: 1px solid var(--wgd-border); border-radius: 4px; background: none; cursor: pointer; }
.wgd-token-row { display: flex; gap: 6px; align-items: center; }
.wgd-token-row .wgd-input { flex: 1 1 auto; min-width: 6ch; font-family: ui-monospace, monospace; font-size: 12px; }
.wgd-token-ref { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; margin-top: 4px; }
.wgd-token-ref-row { display: flex; gap: 6px; align-items: center; font-size: 11px; }
.wgd-token-ref-swatch { flex: 0 0 auto; width: 14px; height: 14px; border: 1px solid var(--wgd-border); border-radius: 3px; }
.wgd-token-ref-noswatch { border-style: dashed; opacity: 0.35; }
.wgd-token-ref-name { font-family: ui-monospace, monospace; color: var(--wgd-accent, #2563eb); }
.wgd-token-ref-value { color: var(--wgd-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wgd-token-ref-details summary { cursor: pointer; }
`;
  doc.head.appendChild(style);
}
