// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalog, createThemeRegistry } from "@widgentic/core";
import type { ThemeRegistry, WidgetCatalog } from "@widgentic/core";
import { checkThemeEntry } from "@widgentic/designer";
import { checkStoredTheme } from "../../store/validate.js";
import { buildAppTemplate } from "../index.js";
import { handleListThemes, handlePreviewWidget, handleRenderWidget, renderWidgetPage } from "../handlers.js";
import { LIST_THEMES_TOOL, RENDER_WIDGET_TOOL } from "../definitions.js";
import { handleGetAuthoringGuide } from "../guide.js";
import type { McpToolResult } from "../../output/index.js";
import { bootTemplate, toolResult } from "./template-harness.js";

const LIGHT = ':root:not([data-theme="dark"])';
const DARK = ':root[data-theme="dark"]';
const BTN = { ".wg-btn": { padding: "4px 8px" } };

/** Every block's text: a text block's own, a resource's embedded text. */
function blockTexts(result: McpToolResult): string[] {
  return result.content.map((block) => {
    const loose = block as unknown as { text?: unknown; resource?: { text?: unknown } };
    if (typeof loose.text === "string") return loose.text;
    if (typeof loose.resource?.text === "string") return loose.resource.text;
    return "";
  });
}

function textOf(result: McpToolResult): string {
  return blockTexts(result)[0] ?? "";
}

function invoiceCatalog(): WidgetCatalog {
  const catalog = createCatalog();
  catalog.register(
    "invoice",
    () => ({ tag: "div", attrs: { class: "wg-invoice" }, children: [{ tag: "button", attrs: { class: "wg-btn" }, children: ["Pay"] }] }),
    { description: "invoice", dataShape: "any", styles: { ".wg-invoice": { border: "1px solid var(--wg-border)" } } }
  );
  return catalog;
}

function registry(setup: (r: ThemeRegistry) => void = () => {}): ThemeRegistry {
  const r = createThemeRegistry();
  r.register({ name: "brand", tokens: { accent: "#ff5a1f" }, styles: { ...BTN, body: { color: "red" } } });
  r.register({ name: "brand-dark", extends: "dark", tokens: { accent: "#ff8a5c" }, styles: { ".wg-btn": { padding: "6px 10px" } } });
  setup(r);
  return r;
}

function cssOf(result: McpToolResult): string {
  return String((result.structuredContent as { css: string }).css);
}

const render = (themes: ThemeRegistry | undefined, input: Record<string, unknown> = {}) =>
  handleRenderWidget(invoiceCatalog(), { widget: "invoice", data: 1, ...input }, { themes });

describe("theme styles reach every styled output", () => {
  it("a named theme's styles come before the kind's, then its declarations", () => {
    const css = cssOf(render(registry(), { theme: "brand" }));
    const btn = css.indexOf(".wg-btn {");
    const invoice = css.indexOf(".wg-invoice {");
    const tokens = css.indexOf("--wg-accent: #ff5a1f;");
    expect(btn).toBeGreaterThanOrEqual(0);
    expect(btn).toBeLessThan(invoice);
    expect(invoice).toBeLessThan(tokens);
  });

  it("documents carry theme styles before the kind's", () => {
    for (const format of ["page", "app"]) {
      const result = render(registry(), { theme: "brand", format });
      const doc = blockTexts(result).find((text) => text.includes("<!doctype html>")) ?? "";
      expect(doc.indexOf(".wg-btn {")).toBeGreaterThan(0);
      expect(doc.indexOf(".wg-btn {")).toBeLessThan(doc.indexOf(".wg-invoice {"));
    }
  });

  it("previews carry the same theme rule as the render", () => {
    const preview = handlePreviewWidget(invoiceCatalog(), { widget: "invoice", data: 1, theme: "brand" }, { themes: registry() });
    const rule = ".wg-btn {\n  padding: 4px 8px;\n}";
    expect(cssOf(preview)).toContain(rule);
    expect(cssOf(render(registry(), { theme: "brand" }))).toContain(rule);
  });

  it("unsafe theme style entries never reach any output", () => {
    const withDefault = registry((r) => r.setDefault("light", "brand"));
    const outputs = [
      cssOf(render(registry(), { theme: "brand" })),
      textOf(render(registry(), { theme: "brand", format: "page" })),
      blockTexts(render(registry(), { theme: "brand", format: "app" })).join("\n"),
      cssOf(handlePreviewWidget(invoiceCatalog(), { widget: "invoice", data: 1, theme: "brand" }, { themes: registry() })),
      cssOf(render(withDefault)),
      blockTexts(render(withDefault, { format: "app" })).join("\n")
    ];
    for (const output of outputs) {
      expect(output).not.toMatch(/(^|\n)body \{\n  color: red;/);
      expect(output).toContain(".wg-btn {");
    }
  });

  it("an inline token map carries no styles and a styleless theme keeps today's output", () => {
    const inline = cssOf(render(registry(), { theme: { accent: "#123456" } }));
    expect(inline).not.toContain(".wg-btn");
    const plain = createThemeRegistry();
    plain.register({ name: "plain", tokens: { accent: "#123456" } });
    expect(cssOf(render(plain, { theme: "plain" }))).toBe(inline);
  });
});

describe("default themes from settings stand in for the built-ins", () => {
  it("the light default's tokens dress light hosts only; a lone default's styles serve both modes", () => {
    const css = cssOf(render(registry((r) => r.setDefault("light", "brand"))));
    expect(css).toContain(`${LIGHT} {\n  --wg-accent: #ff5a1f;\n}`);
    expect(css).not.toContain(`${DARK} {`);
    // Layout a widget relies on must not vanish on a dark host with no dark default.
    expect(css).toContain(".wg-btn {\n  padding: 4px 8px;\n}");
    expect(css).not.toContain(":where(");
  });

  it("the dark default's tokens dress dark hosts only", () => {
    const css = cssOf(render(registry((r) => r.setDefault("dark", "brand-dark"))));
    expect(css).toContain(`${DARK} {`);
    expect(css).toContain("--wg-accent: #ff8a5c;");
    expect(css).toContain(".wg-btn {\n  padding: 6px 10px;\n}");
    expect(css).not.toContain(`${LIGHT} {`);
  });

  it("two different defaults each scope their styles to their own mode", () => {
    const css = cssOf(render(registry((r) => { r.setDefault("light", "brand"); r.setDefault("dark", "brand-dark"); })));
    expect(css).toContain(`:where(${LIGHT}) .wg-btn {\n  padding: 4px 8px;\n}`);
    expect(css).toContain(`:where(${DARK}) .wg-btn {\n  padding: 6px 10px;\n}`);
  });

  it.each([
    ["the dark default has none", "night"],
    ["the dark default is the built-in", undefined]
  ])("a light default's styles serve both modes when %s", (_label, dark) => {
    const css = cssOf(render(registry((r) => {
      r.register({ name: "night", extends: "dark", tokens: { accent: "#0a84ff" } });
      r.setDefault("light", "brand");
      if (dark !== undefined) r.setDefault("dark", dark);
    })));
    expect(css).toContain(".wg-btn {\n  padding: 4px 8px;\n}");
    expect(css).not.toContain(":where(");
  });

  it("a dark default's styles serve both modes when the light default has none", () => {
    const css = cssOf(render(registry((r) => {
      r.register({ name: "day", tokens: { accent: "#123456" } });
      r.setDefault("light", "day");
      r.setDefault("dark", "brand-dark");
    })));
    expect(css).toContain(".wg-btn {\n  padding: 6px 10px;\n}");
    expect(css).not.toContain(":where(");
  });

  it("one theme serving both modes is emitted as an explicit theme is", () => {
    const both = cssOf(render(registry((r) => { r.setDefault("light", "brand"); r.setDefault("dark", "brand"); })));
    expect(both).toBe(cssOf(render(registry(), { theme: "brand" })));
  });

  it("an explicit theme replaces the defaults", () => {
    const withDefaults = registry((r) => { r.setDefault("light", "brand"); r.setDefault("dark", "brand-dark"); });
    const explicit = render(withDefaults, { theme: "dark" });
    expect(explicit).toEqual(render(registry(), { theme: "dark" }));
    expect(cssOf(explicit)).not.toContain("#ff5a1f");
    expect(cssOf(explicit)).not.toContain(".wg-btn {");
  });

  it("documents use the light default only", () => {
    const withDefaults = registry((r) => { r.setDefault("light", "brand"); r.setDefault("dark", "brand-dark"); });
    const doc = textOf(render(withDefaults, { format: "page" }));
    expect(doc).toContain(":root {\n  --wg-accent: #ff5a1f;\n}");
    expect(doc).toContain(".wg-btn {\n  padding: 4px 8px;\n}");
    expect(doc).not.toContain("#ff8a5c");
    expect(doc).not.toContain("6px 10px");
  });

  it("no defaults, no change, in every format", () => {
    for (const format of ["both", "html", "widget", "page", "app"]) {
      expect(render(createThemeRegistry(), { format })).toEqual(render(undefined, { format }));
    }
  });

  it("previews follow the defaults", () => {
    const withDefault = registry((r) => r.setDefault("light", "brand"));
    const preview = handlePreviewWidget(invoiceCatalog(), { widget: "invoice", data: 1 }, { themes: withDefault });
    expect(cssOf(preview)).toBe(cssOf(render(withDefault)));
  });
});

describe("documents and previews", () => {
  it("the widget page resource takes the light default, unchanged without one", () => {
    const catalog = invoiceCatalog();
    const withDefault = renderWidgetPage(catalog, "invoice", registry((r) => r.setDefault("light", "brand")));
    expect(withDefault).toContain(":root {\n  --wg-accent: #ff5a1f;\n}");
    expect(withDefault).toContain(".wg-btn {\n  padding: 4px 8px;\n}");
    expect(renderWidgetPage(catalog, "invoice", createThemeRegistry())).toBe(renderWidgetPage(catalog, "invoice"));
  });

  it("a theme still streaming previews with no theme, not the defaults", () => {
    const withDefault = registry((r) => r.setDefault("light", "brand"));
    const half = handlePreviewWidget(invoiceCatalog(), { widget: "invoice", data: 1, theme: "bra" }, { themes: withDefault });
    expect(cssOf(half)).not.toContain("#ff5a1f");
    expect(cssOf(half)).toBe(cssOf(handlePreviewWidget(invoiceCatalog(), { widget: "invoice", data: 1 }, { themes: createThemeRegistry() })));
  });
});

describe("the light default in the app template", () => {
  // The template's static style (base stylesheet, host bridge, dark block)
  // plus the result's css, measured once per fresh document.
  function accentOn(hostTheme: "light" | "dark", themes: ThemeRegistry = registry((r) => r.setDefault("light", "brand"))): string {
    const t = bootTemplate();
    const staticCss = buildAppTemplate().split("<style>")[1]?.split("</style>")[0] ?? "";
    document.head.insertAdjacentHTML("afterbegin", `<style>${staticCss}</style>`);
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: hostTheme } });
    const result = render(themes);
    t.dispatch(toolResult(result.structuredContent as Record<string, unknown>));
    if (t.root().querySelector(".wg-btn") === null) throw new Error("the widget did not mount");
    // Tokens are declared on the root and inherited; read them where declared.
    return getComputedStyle(document.documentElement).getPropertyValue("--wg-accent").trim();
  }

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies on a light host", () => {
    expect(accentOn("light")).toBe("#ff5a1f");
  });

  it("leaves a dark host to exactly the built-in behavior", () => {
    const withDefault = accentOn("dark");
    expect(withDefault).not.toBe("#ff5a1f");
    expect(withDefault).toBe(accentOn("dark", createThemeRegistry()));
  });

  // Two different defaults: each mode gets its own theme's classes.
  function paddingOn(hostTheme: "light" | "dark"): string {
    const t = bootTemplate();
    const staticCss = buildAppTemplate().split("<style>")[1]?.split("</style>")[0] ?? "";
    document.head.insertAdjacentHTML("afterbegin", `<style>${staticCss}</style>`);
    t.dispatch({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: hostTheme } });
    const result = render(registry((r) => { r.setDefault("light", "brand"); r.setDefault("dark", "brand-dark"); }));
    t.dispatch(toolResult(result.structuredContent as Record<string, unknown>));
    const button = t.root().querySelector(".wg-btn");
    if (button === null) throw new Error("the widget did not mount");
    return getComputedStyle(button).padding;
  }

  it("applies each mode's own theme styles", () => {
    expect(paddingOn("light")).toBe("4px 8px");
    expect(paddingOn("dark")).toBe("6px 10px");
  });
});

describe("agents see theme styles and defaults", () => {
  it("list_themes reports styles and the effective defaults", () => {
    const plain = JSON.parse(textOf(handleListThemes(createThemeRegistry()))) as { defaults: unknown };
    expect(plain.defaults).toEqual({ light: "light", dark: "dark" });
    const listing = JSON.parse(textOf(handleListThemes(registry((r) => r.setDefault("light", "brand"))))) as {
      themes: { name: string; styles?: unknown }[];
      defaults: unknown;
      rules: string;
    };
    expect(listing.themes.find((t) => t.name === "brand")?.styles).toEqual({ ...BTN, body: { color: "red" } });
    expect(listing.defaults).toEqual({ light: "brand", dark: "dark" });
    expect(listing.rules).toContain("{ name, label?, description?, tokens, styles? }");
  });

  it("list_themes and render_widget steer agents to the user's defaults", () => {
    expect(LIST_THEMES_TOOL.description).toContain("defaults");
    expect(LIST_THEMES_TOOL.description).toContain("styles");
    const themeParam = (RENDER_WIDGET_TOOL.inputSchema.properties as Record<string, { description?: string }>).theme;
    expect(themeParam?.description).toContain("Leave this out to use the user's default themes");
  });

  it("the guide teaches theme styles from the shared constants, and its drafts import cleanly", () => {
    const guide = JSON.parse(textOf(handleGetAuthoringGuide())) as {
      theme: { shape: { description: string; styles: string }; styles: Record<string, string>; defaults: string };
      rules: { styles: Record<string, string> };
    };
    expect(guide.theme.shape.description).toContain("styles?");
    expect(guide.theme.styles.banned).toBe(guide.rules.styles.banned);
    expect(guide.theme.styles.propertyNames).toBe(guide.rules.styles.propertyNames);
    expect(guide.theme.defaults).toContain("Settings");
    const drafted = { name: "drafted", tokens: { accent: "#0a84ff" }, styles: { ".wg-btn": { padding: "4px 8px" } } };
    expect(checkStoredTheme(drafted)).toBeUndefined();
    expect(checkThemeEntry(drafted)).toEqual([]);
  });
});
