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
function render(sc) {
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
  if (message.method === "ui/notifications/tool-input") {
    const widget = message.params && message.params.arguments && message.params.arguments.widget;
    root.textContent = "Rendering " + (typeof widget === "string" ? "'" + widget + "'" : "widget") + "\\u2026";
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
