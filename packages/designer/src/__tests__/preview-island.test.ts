// @vitest-environment happy-dom
/**
 * The preview island: with `previewFrame`, the widget and theme designers
 * preview in a framed app template and act as its minimal MCP Apps host.
 * The frame's window is faked so every message the designer sends is seen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileTemplate, darkTheme, TOKEN_SPECS } from "@widgentic/core";
import type { WidgetTemplate } from "@widgentic/core";
import { createDesigner, createThemeDesigner, defineDesignerElement } from "../index.js";
import type { WidgetDefinition } from "../index.js";

/** Any URL works; about:blank keeps happy-dom from fetching it. */
const FRAME = "about:blank";

interface Sent {
  jsonrpc: string;
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

/** The draft every test previews: styled title, bound data. */
const WIDGET: WidgetDefinition = {
  kind: "island-card",
  template: { tag: "section", children: [{ tag: "h2", attrs: { class: "wg-title" }, children: [{ bind: "name" }] }] },
  descriptor: {
    description: "d",
    dataShape: "{ name }",
    dataExample: { name: "Ada" },
    styles: { ".wg-title": { color: "rgb(4, 5, 6)" } }
  }
};

const BRAND = { name: "brand", tokens: { accent: "#0b6e4f" }, styles: { ".wg-btn": { color: "rgb(1, 2, 3)" } } };

/** Mount a designer and fake its frame's window; returns what the designer posts. */
function islandDesigner(options: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const designer = createDesigner(container, { previewFrame: FRAME, initialWidget: WIDGET, ...options });
  const frame = container.querySelector("iframe.wgd-preview-frame") as HTMLIFrameElement;
  const sent: Sent[] = [];
  const fake = { postMessage: (message: Sent) => sent.push(message) };
  Object.defineProperty(frame, "contentWindow", { configurable: true, get: () => fake });
  const fromFrame = (data: unknown, source: unknown = fake) =>
    window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }));
  const boot = () => {
    fromFrame({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { protocolVersion: "2026-01-26" } });
    fromFrame({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
  };
  const results = () => sent.filter((m) => m.method === "ui/notifications/tool-result");
  return { container, designer, frame, sent, fromFrame, boot, results };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => vi.restoreAllMocks());

describe("the preview island", () => {
  it("renders in a sandboxed frame, as the in-page pipeline renders, once the frame initializes", () => {
    const { container, frame, sent, boot, results } = islandDesigner({ themes: [BRAND], previewTheme: "brand" });
    expect(frame.getAttribute("src")).toBe(FRAME);
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(container.querySelector(".wgd-preview")).toBeNull();
    expect(results()).toHaveLength(0); // held until initialized
    boot();
    const init = sent.find((m) => m.id === 1);
    expect(init?.result).toMatchObject({ hostCapabilities: {}, hostContext: { theme: "light" } });
    const [result] = results();
    const content = result?.params?.structuredContent as { tree: unknown; css: string; payload: unknown };
    const expected = compileTemplate(WIDGET.template as WidgetTemplate)({ kind: "x", data: { name: "Ada" } });
    expect(content.tree).toEqual(expected);
    // The order a render's css uses: theme styles, kind styles, tokens; unscoped.
    const themeRule = content.css.indexOf(".wg-btn {");
    const ownRule = content.css.indexOf(".wg-title {");
    const tokens = content.css.indexOf(':root, :root[data-theme="dark"] {');
    expect(themeRule).toBeGreaterThanOrEqual(0);
    expect(themeRule).toBeLessThan(ownRule);
    expect(ownRule).toBeLessThan(tokens);
    expect(content.css).not.toContain("data-wgd-scope");
    expect(content.css).toContain("[data-wg-action]::after");
  });

  it("sends one more result per valid edit through the same frame", () => {
    const { designer, frame, boot, results } = islandDesigner();
    boot();
    expect(results()).toHaveLength(1);
    designer.loadWidget({ ...WIDGET, descriptor: { ...WIDGET.descriptor, dataExample: { name: "Lin" } } });
    expect(results()).toHaveLength(2);
    expect(JSON.stringify(results()[1]?.params?.structuredContent)).toContain("Lin");
    expect(frame.isConnected).toBe(true);
    expect(frame.getAttribute("src")).toBe(FRAME);
  });

  it("sends nothing for an invalid draft and shows the error in the designer", () => {
    const { container, boot, results } = islandDesigner();
    boot();
    const json = container.querySelector(".wgd-template-json") as HTMLTextAreaElement;
    json.value = JSON.stringify({ tag: "button", attrs: { onclick: "x()" } });
    json.dispatchEvent(new Event("input", { bubbles: true }));
    expect(results()).toHaveLength(1);
    const banner = container.querySelector(".wgd-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("FORBIDDEN_ATTRIBUTE");
  });

  it("never runs a tool", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sent, fromFrame, boot } = islandDesigner();
    boot();
    fromFrame({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "execute_action", arguments: {} } });
    expect(sent.find((m) => m.id === 7)?.error?.code).toBe(-32601);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens safe links outside and refuses the rest", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { sent, fromFrame, boot } = islandDesigner();
    boot();
    fromFrame({ jsonrpc: "2.0", id: 8, method: "ui/open-link", params: { url: "https://example.com/a" } });
    fromFrame({ jsonrpc: "2.0", id: 9, method: "ui/open-link", params: { url: "javascript:alert(1)" } });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener");
    expect(sent.find((m) => m.id === 8)?.result).toEqual({});
    expect(sent.find((m) => m.id === 9)?.error).toBeDefined();
  });

  it("answers ui/message without composing anything", () => {
    const { sent, fromFrame, boot } = islandDesigner();
    boot();
    fromFrame({ jsonrpc: "2.0", id: 10, method: "ui/message", params: { role: "user", content: [{ type: "text", text: "hi" }] } });
    expect(sent.find((m) => m.id === 10)?.result).toEqual({});
  });

  it("takes the frame's reported height", () => {
    const { frame, fromFrame, boot } = islandDesigner();
    boot();
    fromFrame({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: 600, height: 480 } });
    expect(frame.style.height).toBe("480px");
  });

  it("ignores messages from any other window", () => {
    const { frame, sent, fromFrame } = islandDesigner();
    const stranger = { postMessage: () => undefined };
    fromFrame({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} }, stranger);
    fromFrame({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 900 } }, stranger);
    expect(sent).toHaveLength(0);
    expect(frame.style.height).toBe("120px");
  });

  it("follows the page's color scheme, before and after initialize", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { sent, boot } = islandDesigner();
    boot();
    expect(sent.find((m) => m.id === 1)?.result).toMatchObject({ hostContext: { theme: "dark" } });
    document.documentElement.setAttribute("data-theme", "light");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.find((m) => m.method === "ui/notifications/host-context-changed")?.params).toMatchObject({ theme: "light" });
  });

  it("hands the frame the built-in palette of its scheme, as a host hands its own", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { sent, boot } = islandDesigner();
    boot();
    const init = sent.find((m) => m.id === 1)?.result as { hostContext: { styles: { variables: Record<string, string> } } };
    expect(init.hostContext.styles.variables["--color-background-primary"]).toBe(darkTheme.bg);
    expect(init.hostContext.styles.variables["--color-text-primary"]).toBe(darkTheme.fg);
    document.documentElement.setAttribute("data-theme", "light");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const changed = sent.find((m) => m.method === "ui/notifications/host-context-changed")?.params as {
      styles: { variables: Record<string, string> };
    };
    expect(changed.styles.variables["--color-background-primary"]).toBe(TOKEN_SPECS.bg.default);
    expect(changed.styles.variables["--color-text-primary"]).toBe(TOKEN_SPECS.fg.default);
  });

  it("emits its styles only into the frame, never into the page", () => {
    const outside = document.createElement("h2");
    outside.className = "wg-title";
    document.body.appendChild(outside);
    const { boot, results } = islandDesigner();
    boot();
    expect((results()[0]?.params?.structuredContent as { css: string }).css).toContain(".wg-title {");
    const pageCss = [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
    expect(pageCss).not.toContain("rgb(4, 5, 6)");
  });

  it("dispose removes the frame and stops listening", () => {
    const { container, designer, sent, fromFrame } = islandDesigner();
    designer.dispose();
    expect(container.querySelector("iframe")).toBeNull();
    fromFrame({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} });
    expect(sent).toHaveLength(0);
  });

  it("previews in the page, with no frame, when no previewFrame is given", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    createDesigner(container, { initialWidget: WIDGET });
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector(".wgd-preview")?.textContent).toContain("Ada");
  });

  it("the theme designer previews catalog kinds in the island too", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    createThemeDesigner(container, { previewFrame: FRAME, initialTheme: BRAND });
    const frame = container.querySelector("iframe.wgd-preview-frame") as HTMLIFrameElement;
    const sent: Sent[] = [];
    const fake = { postMessage: (message: Sent) => sent.push(message) };
    Object.defineProperty(frame, "contentWindow", { configurable: true, get: () => fake });
    const post = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source: fake as unknown as Window }));
    post({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} });
    post({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
    const result = sent.find((m) => m.method === "ui/notifications/tool-result");
    const content = result?.params?.structuredContent as { css: string; payload: { kind: string } };
    expect(content.payload.kind).toBe("card");
    expect(content.css).toContain("--wg-accent: #0b6e4f");
  });

  it("the element reads the preview-frame attribute", () => {
    defineDesignerElement("island-designer");
    const element = document.createElement("island-designer");
    element.setAttribute("preview-frame", FRAME);
    document.body.appendChild(element);
    expect(element.querySelector("iframe.wgd-preview-frame")?.getAttribute("src")).toBe(FRAME);
  });
});
