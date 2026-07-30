import { baseStylesheet } from "widgentic/theming";

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
function render(sc) {
  if (typeof sc.css === "string") dynamicCss.textContent = sc.css;
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

  return (
    `<!doctype html>\n<meta charset="utf-8">\n<title>widgentic</title>\n` +
    `<style>\n${baseStylesheet}\n${hostTokenBridgeCss}\n</style>\n` +
    `<style id="wg-dynamic-css"></style>\n` +
    `<body><div id="wg-root"></div>\n<script>${bridge}</script></body>`
  );
}
