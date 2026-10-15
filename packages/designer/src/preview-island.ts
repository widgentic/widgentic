/**
 * The preview island: the preview runs in its own framed document — the
 * MCP Apps app template a host serves at `previewFrame` — and the designer
 * is that frame's host. The frame's bridge mounts and patches each tree
 * exactly as it does in Claude or ChatGPT, under the frame policy the host
 * serves, and in a sandbox without `allow-same-origin`, so it reaches
 * neither the page's styles nor its session.
 *
 * The host side is the published protocol's minimum: initialize with a
 * host context and no capabilities (no server tools, so nothing executes),
 * one tool result per revision, the frame's size, and links opened by the
 * designer when they pass the guard. Only the frame's own window is heard.
 * The host context carries the scheme and, as a host carries its palette,
 * the style variables the template bridges, from the built-in theme of
 * that scheme.
 */
import { darkTheme, isPlainObject, isSafeUrl, TOKEN_SPECS } from "@widgentic/core";
import { h } from "./dom.js";

const PROTOCOL_VERSION = "2026-01-26";
/** Height kept until the frame first reports its own. */
const MIN_HEIGHT = 120;
/** Schemes a preview link may open; anything else is refused. */
const LINKABLE = /^(https?|mailto|tel):/i;

/**
 * The MCP Apps host style variables the app template maps onto tokens.
 * Without them the template keeps those tokens light whatever the scheme;
 * a test in `@widgentic/mcp` holds this list to the template's bridge.
 */
const HOST_VARIABLES = {
  "--color-background-primary": "bg",
  "--color-text-primary": "fg",
  "--color-text-secondary": "muted",
  "--color-border-primary": "border",
  "--color-text-info": "accent",
  "--font-sans": "font-family",
  "--border-radius-md": "radius",
  "--shadow-sm": "shadow"
} as const;

export type PreviewScheme = "light" | "dark";

export interface PreviewIsland {
  readonly frame: HTMLIFrameElement;
  /** Render this structured content; held until the frame initializes, only the latest kept. */
  show(structuredContent: Record<string, unknown>): void;
  dispose(): void;
}

/** The host context for a scheme: the built-in theme's values as host variables. */
function hostContext(theme: PreviewScheme): { theme: PreviewScheme; styles: { variables: Record<string, string> } } {
  const variables: Record<string, string> = {};
  for (const [variable, token] of Object.entries(HOST_VARIABLES)) {
    variables[variable] = (theme === "dark" ? darkTheme[token] : undefined) ?? TOKEN_SPECS[token].default;
  }
  return { theme, styles: { variables } };
}

export function createPreviewIsland(src: string, scheme: () => PreviewScheme): PreviewIsland {
  const frame = h("iframe", {
    class: "wgd-preview-frame",
    src,
    sandbox: "allow-scripts",
    title: "Widget preview"
  }) as HTMLIFrameElement;
  frame.style.height = `${MIN_HEIGHT}px`;

  let ready = false;
  let held: Record<string, unknown> | undefined;
  let lastScheme: PreviewScheme | undefined;

  // The frame's origin is opaque ("null"), so the target is "*" and the
  // identity check on incoming messages is the window, never the origin.
  const post = (message: unknown) => frame.contentWindow?.postMessage(message, "*");
  const answer = (id: unknown, result: unknown) => post({ jsonrpc: "2.0", id, result });
  const refuse = (id: unknown, code: number, message: string) =>
    post({ jsonrpc: "2.0", id, error: { code, message } });

  function sendResult(structuredContent: Record<string, unknown>): void {
    post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [], structuredContent } });
  }

  function onMessage(event: MessageEvent): void {
    if (event.source === null || event.source !== frame.contentWindow) return;
    const message: unknown = event.data;
    if (!isPlainObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
    const params = isPlainObject(message.params) ? message.params : {};
    if (message.id !== undefined) {
      switch (message.method) {
        case "ui/initialize":
          lastScheme = scheme();
          answer(message.id, {
            protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
            hostInfo: { name: "widgentic-designer", version: "1" },
            hostCapabilities: {},
            hostContext: hostContext(lastScheme)
          });
          return;
        case "ping":
          answer(message.id, {});
          return;
        case "ui/message":
          // The preview proposes nothing to any conversation.
          answer(message.id, {});
          return;
        case "ui/open-link": {
          const url = typeof params.url === "string" ? params.url.trim() : "";
          if (LINKABLE.test(url) && isSafeUrl(url)) {
            window.open(url, "_blank", "noopener");
            answer(message.id, {});
          } else {
            refuse(message.id, -32602, "The preview opens only http, https, mailto and tel links.");
          }
          return;
        }
        case "tools/call":
          refuse(message.id, -32601, "The designer preview never runs tools.");
          return;
        default:
          refuse(message.id, -32601, `Method not supported by the designer preview: ${message.method}`);
          return;
      }
    }
    if (message.method === "ui/notifications/initialized") {
      ready = true;
      if (held !== undefined) sendResult(held);
      held = undefined;
      return;
    }
    if (message.method === "ui/notifications/size-changed" && typeof params.height === "number") {
      frame.style.height = `${Math.max(MIN_HEIGHT, Math.ceil(params.height))}px`;
    }
  }
  window.addEventListener("message", onMessage);

  // The frame follows the designer's scheme, as hosts keep their frames in
  // step with their own.
  function schemeChanged(): void {
    const next = scheme();
    if (!ready || next === lastScheme) return;
    lastScheme = next;
    post({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: hostContext(next) });
  }
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;
  media?.addEventListener?.("change", schemeChanged);
  const observer = typeof MutationObserver === "function" ? new MutationObserver(schemeChanged) : undefined;
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return {
    frame,
    show(structuredContent) {
      if (ready) sendResult(structuredContent);
      else held = structuredContent;
    },
    dispose() {
      window.removeEventListener("message", onMessage);
      media?.removeEventListener?.("change", schemeChanged);
      observer?.disconnect();
      frame.remove();
    }
  };
}
