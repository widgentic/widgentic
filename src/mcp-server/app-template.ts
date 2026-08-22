import { baseStylesheet, darkTheme } from "../theming/index.js";

/**
 * The declared MCP Apps template (`ui://widgentic/app.html`).
 *
 * A self-contained loader: widgentic base stylesheet inline, host-variable
 * token mapping, and a minimal hand-rolled bridge implementing the Apps
 * iframe protocol (JSON-RPC over postMessage, spec 2026-01-26):
 *   - `ui/initialize` handshake + `ui/notifications/initialized`
 *   - host context integration (theme, style variables, safe-area insets),
 *     applied from the initialize result and on `host-context-changed`
 *   - `tool-input` placeholder, `tool-result` rendering of structuredContent
 *     (native mount from `tree` — DOM built from data and patched in place
 *     across results; `html` injection only as the tree-less fallback)
 *   - ResizeObserver-driven `size-changed` notifications
 *   - `ping` and `ui/resource-teardown` responders
 * Widget content stays script-free and fully escaped; this loader is fixed
 * infrastructure. No external references; CSP domains are never declared.
 */
export function buildAppTemplate(): string {
  const bridge = `
const root = document.getElementById("wg-root");
const dynamicCss = document.getElementById("wg-dynamic-css");
const pending = new Map();
let nextId = 1;
function send(message) { window.parent.postMessage(message, "*"); }
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
  });
}
function applyHostContext(ctx) {
  if (!ctx) return;
  if (ctx.theme === "light" || ctx.theme === "dark") {
    document.documentElement.setAttribute("data-theme", ctx.theme);
    document.documentElement.style.colorScheme = ctx.theme;
  }
  if (ctx.styles && ctx.styles.variables) {
    for (const key in ctx.styles.variables) {
      const value = ctx.styles.variables[key];
      if (typeof value === "string") {
        document.documentElement.style.setProperty(key, value);
      }
    }
  }
  if (ctx.safeAreaInsets) {
    const s = ctx.safeAreaInsets;
    document.body.style.padding =
      s.top + "px " + s.right + "px " + s.bottom + "px " + s.left + "px";
  }
}
// --- Native tree mounter -------------------------------------------------
// Mirrors src/reactive build/patch semantics over the JSON render tree in
// structuredContent.tree: DOM built from data (no HTML parsing), successive
// results patch in place preserving node identity where shape matches.
// Applies the serializer's discipline even to a tampered tree: tag and
// attribute names allowlisted, on* attributes skipped.
const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const ATTR_NAME = /^[a-zA-Z_][a-zA-Z0-9_:.-]*$/;
function isElement(node) {
  return node !== null && typeof node === "object" && !Array.isArray(node) &&
    typeof node.tag === "string" && TAG_NAME.test(node.tag);
}
function build(node) {
  if (typeof node === "string") return document.createTextNode(node);
  if (!isElement(node)) return document.createTextNode("");
  const el = document.createElement(node.tag);
  if (node.attrs) {
    for (const name in node.attrs) {
      if (!ATTR_NAME.test(name) || /^on/i.test(name)) continue;
      const value = node.attrs[name];
      if (typeof value === "string") el.setAttribute(name, value);
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) el.appendChild(build(child));
  }
  return el;
}
function patch(prev, next, dom) {
  if (typeof prev === "string" && typeof next === "string") {
    if (prev !== next) dom.nodeValue = next;
    return dom;
  }
  if (typeof prev === "string" || !isElement(next) || !isElement(prev) ||
      prev.tag !== next.tag) {
    const built = build(next);
    dom.replaceWith(built);
    return built;
  }
  const prevAttrs = prev.attrs || {};
  const nextAttrs = next.attrs || {};
  for (const name in prevAttrs) {
    if (!(name in nextAttrs)) dom.removeAttribute(name);
  }
  for (const name in nextAttrs) {
    if (!ATTR_NAME.test(name) || /^on/i.test(name)) continue;
    const value = nextAttrs[name];
    if (typeof value !== "string") { dom.removeAttribute(name); continue; }
    if (prevAttrs[name] !== value) dom.setAttribute(name, value);
  }
  const prevKids = Array.isArray(prev.children) ? prev.children : [];
  const nextKids = Array.isArray(next.children) ? next.children : [];
  const domKids = [];
  for (let i = 0; i < dom.childNodes.length; i++) domKids.push(dom.childNodes[i]);
  const shared = Math.min(prevKids.length, nextKids.length, domKids.length);
  for (let i = 0; i < shared; i++) patch(prevKids[i], nextKids[i], domKids[i]);
  for (let i = domKids.length - 1; i >= nextKids.length; i--) {
    dom.removeChild(domKids[i]);
  }
  for (let i = prevKids.length; i < nextKids.length; i++) {
    dom.appendChild(build(nextKids[i]));
  }
  return dom;
}
let mountedTree;
let mountedRoot;
let resultRendered = false;
function render(sc) {
  resultRendered = true;
  root.removeAttribute("data-wgd-preview");
  if (typeof sc.css === "string") dynamicCss.textContent = sc.css;
  if (sc.tree !== undefined && sc.tree !== null) {
    if (mountedTree !== undefined && mountedRoot && mountedRoot.parentNode === root) {
      mountedRoot = patch(mountedTree, sc.tree, mountedRoot);
    } else {
      const built = build(sc.tree);
      root.replaceChildren(built);
      mountedRoot = built;
    }
    mountedTree = sc.tree;
    return;
  }
  // Fallback projection for results that predate the tree.
  mountedTree = undefined;
  mountedRoot = undefined;
  if (typeof sc.html === "string") root.innerHTML = sc.html;
}
// --- Streaming input preview ----------------------------------------------
// Hosts stream partial tool arguments (host-healed snapshots) while the
// model generates them; built-in kinds preview client-side through the SAME
// tree mounter so the widget draws itself as the agent types. Preview trees
// mirror the catalog renderers' shapes (drift is pinned by tests comparing
// against the real renderers); custom kinds get a labeled skeleton — never
// a guessed render. The tool result stays the only authority.
function isObj(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fmt(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try { return JSON.stringify(value) || String(value); } catch (e) { return String(value); }
}
// Bounded peel of client-stringified data — mid-stream strings that do not
// parse stay raw (the next snapshot will complete them).
function coerceData(data) {
  if (typeof data !== "string") return data;
  let candidate = data;
  for (let depth = 0; depth < 3 && typeof candidate === "string"; depth++) {
    const trimmed = candidate.trim();
    const first = trimmed.charAt(0);
    if (first !== "{" && first !== "[" && first !== '"') break;
    try { candidate = JSON.parse(trimmed); } catch (e) { break; }
  }
  return typeof candidate === "object" && candidate !== null ? candidate : data;
}
function pattern(patternText, value) {
  return patternText.indexOf("{value}") !== -1
    ? patternText.split("{value}").join(value)
    : patternText + value;
}
function cellNode(key, raw, hints, cls) {
  let text = fmt(raw);
  const formats = isObj(hints) && isObj(hints.fieldFormat) ? hints.fieldFormat : undefined;
  if (formats && typeof formats[key] === "string") text = pattern(formats[key], text);
  const links = isObj(hints) && isObj(hints.links) ? hints.links : undefined;
  const hint = links ? links[key] : undefined;
  if (typeof raw === "string" && raw !== "" && hint !== undefined && hint !== false) {
    const href = hint === true ? raw : typeof hint === "string" ? hint + raw : undefined;
    if (href !== undefined &&
        /^(https?|mailto|tel):/i.test(href.replace(/[\\u0000-\\u0020]+/g, ""))) {
      return { tag: "td", attrs: { class: cls }, children: [
        { tag: "a", attrs: { class: "wg-link", href: href, rel: "noopener noreferrer" },
          children: [text] }
      ] };
    }
  }
  return { tag: "td", attrs: { class: cls }, children: [text] };
}
function previewCard(data, hints, meta) {
  let title, subtitle, entries = [], value;
  if (isObj(data)) {
    title = data.title; subtitle = data.subtitle;
    if (isObj(data.fields)) {
      for (const key in data.fields) entries.push([key, data.fields[key]]);
    } else {
      for (const key in data) {
        if (key !== "title" && key !== "subtitle") entries.push([key, data[key]]);
      }
    }
  } else if (data !== undefined) {
    value = fmt(data);
  }
  if (title === undefined && isObj(meta)) title = meta.title;
  if (subtitle === undefined && isObj(meta)) subtitle = meta.subtitle;
  const children = [];
  if (title !== undefined) {
    children.push({ tag: "div", attrs: { class: "wg-card-title" }, children: [fmt(title)] });
  }
  if (subtitle !== undefined) {
    children.push({ tag: "div", attrs: { class: "wg-card-subtitle" }, children: [fmt(subtitle)] });
  }
  if (value !== undefined) {
    children.push({ tag: "div", attrs: { class: "wg-card-value" }, children: [value] });
  }
  if (entries.length > 0) {
    children.push({ tag: "dl", attrs: { class: "wg-card-fields" },
      children: entries.map(function (entry) {
        const valueCell = cellNode(entry[0], entry[1], hints, "x");
        return { tag: "div", attrs: { class: "wg-card-field" }, children: [
          { tag: "dt", attrs: { class: "wg-card-field-key" }, children: [entry[0]] },
          { tag: "dd", attrs: { class: "wg-card-field-value" }, children: valueCell.children }
        ] };
      }) });
  }
  return { tag: "div", attrs: { class: "wg-card" }, children: children };
}
function previewTable(data, hints, meta) {
  const rows = Array.isArray(data) ? data : data === undefined ? [] : [data];
  const records = rows.map(function (row) { return isObj(row) ? row : { value: row }; });
  let columns = [];
  const hinted = isObj(hints) ? hints.columns : undefined;
  if (Array.isArray(hinted) && hinted.every(function (c) { return typeof c === "string"; })) {
    columns = hinted;
  } else {
    const seen = {};
    records.forEach(function (record) {
      for (const key in record) {
        if (!seen[key]) { seen[key] = true; columns.push(key); }
      }
    });
  }
  const children = [];
  const title = isObj(meta) ? meta.title : undefined;
  const subtitle = isObj(meta) ? meta.subtitle : undefined;
  if (title !== undefined || subtitle !== undefined) {
    const parts = [];
    if (title !== undefined) {
      parts.push({ tag: "span", attrs: { class: "wg-table-title" }, children: [fmt(title)] });
    }
    if (subtitle !== undefined) {
      parts.push({ tag: "span", attrs: { class: "wg-table-subtitle" }, children: [fmt(subtitle)] });
    }
    children.push({ tag: "caption", attrs: { class: "wg-table-caption" }, children: parts });
  }
  children.push({ tag: "thead", attrs: { class: "wg-table-head" }, children: [
    { tag: "tr", children: columns.map(function (column) {
      return { tag: "th", attrs: { class: "wg-table-header" }, children: [column] };
    }) }
  ] });
  children.push({ tag: "tbody", attrs: { class: "wg-table-body" },
    children: records.map(function (record) {
      return { tag: "tr", attrs: { class: "wg-table-row" },
        children: columns.map(function (column) {
          if (!(column in record)) {
            return { tag: "td", attrs: { class: "wg-table-cell" }, children: [""] };
          }
          return cellNode(column, record[column], hints, "wg-table-cell");
        }) };
    }) });
  return { tag: "table", attrs: { class: "wg-table" }, children: children };
}
function previewTreeNode(node, depth) {
  const hasChildren = isObj(node) && Array.isArray(node.children) && node.children.length > 0;
  const label = isObj(node) && node.label !== undefined ? fmt(node.label) : fmt(node);
  const children = [{ tag: "span", attrs: { class: "wg-tree-label" }, children: [label] }];
  if (hasChildren && depth < 12) {
    children.push({ tag: "ul", attrs: { class: "wg-tree-children" },
      children: node.children.map(function (child) {
        return previewTreeNode(child, depth + 1);
      }) });
  }
  const attrs = hasChildren
    ? { class: "wg-tree-node", "data-expanded": "true" }
    : { class: "wg-tree-node" };
  return { tag: "li", attrs: attrs, children: children };
}
function previewTree(data, hints, meta) {
  const roots = Array.isArray(data) ? data : data === undefined ? [] : [data];
  const list = { tag: "ul", attrs: { class: "wg-tree" },
    children: roots.map(function (node) { return previewTreeNode(node, 0); }) };
  const title = isObj(meta) ? meta.title : undefined;
  if (title === undefined) return list;
  return { tag: "div", attrs: { class: "wg-tree-titled" }, children: [
    { tag: "div", attrs: { class: "wg-tree-title" }, children: [fmt(title)] }, list
  ] };
}
function skeletonTree(kind) {
  return { tag: "div", attrs: { class: "wg-preview-skeleton" }, children: [
    "Generating '" + kind + "'\u2026"
  ] };
}
function previewGroup(data, hints) {
  const layouts = ["stack", "row", "grid"];
  const gaps = ["none", "sm", "md", "lg"];
  const layout = isObj(hints) && layouts.indexOf(hints.layout) !== -1 ? hints.layout : "stack";
  const gap = isObj(hints) && gaps.indexOf(hints.gap) !== -1 ? hints.gap : "md";
  const classes = ["wg-group", "wg-group-" + layout, "wg-gap-" + gap];
  if (layout === "grid") {
    const raw = isObj(hints) && typeof hints.columns === "number" ? hints.columns : 2;
    classes.push("wg-cols-" + Math.min(4, Math.max(1, Math.trunc(raw) || 2)));
  }
  const items = isObj(data) && Array.isArray(data.items) ? data.items : [];
  const children = [];
  items.forEach(function (item) {
    if (!isObj(item) || typeof item.kind !== "string") return;
    const tree = previewFor(item.kind, coerceData(item.data), item.hints, item.meta);
    children.push(tree !== undefined ? tree : skeletonTree(item.kind));
  });
  return { tag: "div", attrs: { class: classes.join(" ") }, children: children };
}
function previewFor(widget, data, hints, meta) {
  if (widget === "card") return previewCard(data, hints, meta);
  if (widget === "table") return previewTable(data, hints, meta);
  if (widget === "tree") return previewTree(data, hints, meta);
  if (widget === "group") return previewGroup(data, hints);
  return undefined;
}
// State: placeholder -> preview (input snapshots) -> rendered (result).
// Coalesced to one preview build per animation frame; the result always
// wins — a late partial can never overwrite it.
let previewArgs;
let previewQueued = false;
const scheduleFrame = typeof window.requestAnimationFrame === "function"
  ? window.requestAnimationFrame.bind(window)
  : function (fn) { setTimeout(fn, 16); };
function mountPreviewTree(tree) {
  if (mountedTree !== undefined && mountedRoot && mountedRoot.parentNode === root) {
    mountedRoot = patch(mountedTree, tree, mountedRoot);
  } else {
    const built = build(tree);
    root.replaceChildren(built);
    mountedRoot = built;
  }
  mountedTree = tree;
}
function applyPreview() {
  previewQueued = false;
  if (resultRendered || previewArgs === undefined) return;
  const args = previewArgs;
  const widget = typeof args.widget === "string" ? args.widget : undefined;
  if (widget === undefined) return; // nothing nameable yet
  const tree = previewFor(widget, coerceData(args.data), args.hints, args.meta);
  mountPreviewTree(tree !== undefined ? tree : skeletonTree(widget));
  root.setAttribute("data-wgd-preview", "true");
}
function onToolInput(params) {
  // Input after a result is a NEW call on a reused frame (basic-host
  // reuses frames; claude.ai mounts per render) — start a fresh cycle.
  resultRendered = false;
  previewArgs = params && isObj(params.arguments) ? params.arguments : undefined;
  if (previewArgs === undefined) return;
  if (!previewQueued) {
    previewQueued = true;
    scheduleFrame(applyPreview);
  }
}
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.id !== undefined && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    message.error ? entry.reject(message.error) : entry.resolve(message.result);
    return;
  }
  if (message.id !== undefined && (message.method === "ping" || message.method === "ui/resource-teardown")) {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "ui/notifications/tool-input-partial" ||
      message.method === "ui/notifications/tool-input") {
    onToolInput(message.params);
    return;
  }
  if (message.method === "ui/notifications/tool-cancelled") {
    // Back to the pre-input placeholder: an abandoned preview must not
    // linger looking like a rendered widget.
    previewArgs = undefined;
    resultRendered = false;
    root.removeAttribute("data-wgd-preview");
    mountedTree = undefined;
    mountedRoot = undefined;
    root.textContent = "";
    return;
  }
  if (message.method === "ui/notifications/tool-result") {
    const params = message.params || {};
    if (params.structuredContent) {
      render(params.structuredContent);
      return;
    }
    // Error (or structured-content-less) result: replace any pending
    // placeholder with the error message — never leave a stale
    // "Rendering…" state on screen.
    let text = "Render failed.";
    const block = Array.isArray(params.content)
      ? params.content.find(function (b) { return b && b.type === "text"; })
      : undefined;
    if (block && typeof block.text === "string") {
      try {
        const parsed = JSON.parse(block.text);
        text = typeof parsed.message === "string" ? parsed.message : block.text;
      } catch (error) {
        text = block.text;
      }
    }
    resultRendered = true;
    root.removeAttribute("data-wgd-preview");
    mountedTree = undefined;
    mountedRoot = undefined;
    root.textContent = "";
    const notice = document.createElement("div");
    notice.className = "wg-app-error";
    notice.textContent = text;
    root.appendChild(notice);
    return;
  }
  if (message.method === "ui/notifications/host-context-changed") {
    applyHostContext(message.params);
  }
});
// Links NEVER navigate the sandboxed frame — the frame IS the widget, and
// an in-frame navigation to an external origin is blocked by the host's
// sandbox, replacing the widget with an error page (observed live on
// claude.ai). ui/open-link asks the HOST to open the URL in the default
// browser instead; a host that denies leaves the widget intact.
document.addEventListener("click", function (event) {
  const target = event.target;
  const anchor = target && target.closest ? target.closest("a[href]") : null;
  if (!anchor) return;
  event.preventDefault();
  const url = anchor.getAttribute("href") || "";
  if (!/^(https?:|mailto:|tel:)/i.test(url)) return;
  request("ui/open-link", { url: url }).catch(function () {
    // Denied or unsupported: nothing to do — the widget stays on screen.
  });
}, true);
let lastWidth = 0, lastHeight = 0;
function notifySize() {
  const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
  const width = Math.ceil(window.innerWidth);
  if (width === lastWidth && height === lastHeight) return;
  lastWidth = width; lastHeight = height;
  send({ jsonrpc: "2.0", method: "ui/notifications/size-changed",
         params: { width, height } });
}
request("ui/initialize", {
  appInfo: { name: "widgentic", version: "0.1.0" },
  appCapabilities: {},
  protocolVersion: "2026-01-26"
}).then((result) => {
  applyHostContext(result && result.hostContext);
  send({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
  const observer = new ResizeObserver(notifySize);
  observer.observe(document.documentElement);
  observer.observe(document.body);
  notifySize();
});
`;

  // Host style variables (set by applyHostContext) flow into the widgentic
  // tokens with our light literals as the final fallback; an explicit
  // widgentic theme from structuredContent.css overrides both (its :root
  // block lands in the later #wg-dynamic-css style element).
  const hostTokenBridgeCss = `
:root {
  --wg-bg: var(--color-background-primary, #ffffff);
  --wg-fg: var(--color-text-primary, #1f2430);
  --wg-muted: var(--color-text-secondary, #6b7280);
  --wg-border: var(--color-border-primary, #e2e8f0);
  --wg-accent: var(--color-text-info, #2563eb);
  --wg-font-family: var(--font-sans, system-ui, -apple-system, 'Segoe UI', sans-serif);
  --wg-radius: var(--border-radius-md, 6px);
  --wg-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.12));
}
body {
  background: var(--wg-bg);
  color: var(--wg-fg);
  font-family: var(--wg-font-family);
  margin: 8px;
}
#wg-root[data-wgd-preview] {
  opacity: 0.78;
  animation: wg-preview-pulse 1.4s ease-in-out infinite;
}
@keyframes wg-preview-pulse {
  0%, 100% { opacity: 0.78; }
  50% { opacity: 0.6; }
}
.wg-preview-skeleton {
  border: 1px dashed var(--wg-border, #e2e8f0);
  border-radius: var(--wg-radius, 6px);
  padding: calc(var(--wg-spacing, 8px) * 2);
  color: var(--wg-muted, #6b7280);
  font-family: var(--wg-font-family, system-ui);
}
.wg-app-error {
  color: var(--color-text-danger, #b91c1c);
  border: 1px solid var(--wg-border, #e2e8f0);
  border-radius: var(--wg-radius, 6px);
  padding: calc(var(--wg-spacing, 8px) * 2);
}`;

  // Theme coherence for tokens the host bridge does NOT map: the base
  // stylesheet's :root defaults are the LIGHT literals, so on dark hosts
  // (data-theme set by applyHostContext) the unbridged colors must flip
  // to the dark preset — otherwise a light `surface` card renders under
  // the host's near-white bridged `fg` (observed live at v19: white-on-
  // white values). Bridged tokens are excluded so host-exact values keep
  // winning in both modes; an explicit render theme still beats this via
  // the later dynamic style element at equal specificity.
  const bridgedTokens = new Set([
    "bg", "fg", "muted", "border", "accent", "font-family", "radius", "shadow"
  ]);
  const darkOverridesCss =
    `:root[data-theme="dark"] {\n` +
    Object.entries(darkTheme)
      .filter(([token]) => !bridgedTokens.has(token))
      .map(([token, value]) => `  --wg-${token}: ${value};`)
      .join("\n") +
    `\n}`;

  return (
    `<!doctype html>\n<meta charset="utf-8">\n<title>widgentic</title>\n` +
    `<style>\n${baseStylesheet}\n${hostTokenBridgeCss}\n${darkOverridesCss}\n</style>\n` +
    `<style id="wg-dynamic-css"></style>\n` +
    `<body><div id="wg-root"></div>\n<script>${bridge}</script></body>`
  );
}
