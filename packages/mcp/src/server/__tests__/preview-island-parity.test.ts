// @vitest-environment happy-dom
/**
 * The designers' preview island renders what a host renders: the tree and
 * CSS the designer posts to its frame equal `render_widget`'s
 * structuredContent for the same widget and theme, with only the
 * designer's action badge appended. As a host, it supplies every style
 * variable the template bridges.
 */
import { describe, expect, it } from "vitest";
import { compileTemplate, createCatalog, createThemeRegistry, darkTheme, TOKEN_SPECS, validateTemplate } from "@widgentic/core";
import type { ThemeToken } from "@widgentic/core";
import { createDesigner } from "@widgentic/designer";
import type { WidgetDefinition } from "@widgentic/designer";
import { buildAppTemplate } from "../app-template.js";
import { handleRenderWidget } from "../handlers.js";

const WIDGET: WidgetDefinition = {
  kind: "island-parity",
  template: {
    tag: "section",
    attrs: { class: "wg-parity" },
    children: [
      { tag: "h2", attrs: { class: "wg-title" }, children: [{ bind: "name" }] },
      { tag: "ul", children: [{ each: "tags", template: { tag: "li", children: [{ bind: "." }] } }] }
    ]
  },
  descriptor: {
    description: "parity",
    dataShape: "{ name, tags[] }",
    dataExample: { name: "Ada", tags: ["math", "engines"] },
    styles: { ".wg-parity": { padding: "8px" }, ".wg-title": { color: "rgb(4, 5, 6)" } }
  }
};

const BRAND = { name: "brand", tokens: { accent: "#0b6e4f", radius: "6px" }, styles: { ".wg-btn": { color: "rgb(1, 2, 3)" } } };

interface Island {
  content: { tree: unknown; css: string };
  variables: Record<string, string>;
}

/** What the designer answers and posts to its frame for the draft, once the frame initializes. */
function boot(): Island {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const designer = createDesigner(container, {
    previewFrame: "about:blank",
    initialWidget: WIDGET,
    themes: [BRAND],
    previewTheme: "brand"
  });
  const frame = container.querySelector("iframe") as HTMLIFrameElement;
  const sent: {
    id?: number;
    method?: string;
    result?: { hostContext?: { styles?: { variables?: Record<string, string> } } };
    params?: { structuredContent?: { tree: unknown; css: string } };
  }[] = [];
  const fake = { postMessage: (message: (typeof sent)[number]) => sent.push(message) };
  Object.defineProperty(frame, "contentWindow", { configurable: true, get: () => fake });
  const post = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source: fake as unknown as Window }));
  post({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} });
  post({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
  const content = sent.find((message) => message.method === "ui/notifications/tool-result")?.params?.structuredContent;
  const variables = sent.find((message) => message.id === 1)?.result?.hostContext?.styles?.variables ?? {};
  designer.dispose();
  if (content === undefined) throw new Error("the island sent no result");
  return { content, variables };
}

describe("the preview island renders what render_widget renders", () => {
  it("posts the same tree and the same CSS, in the same order, plus the action badge", () => {
    const catalog = createCatalog();
    const validated = validateTemplate(WIDGET.template);
    if (!validated.ok) throw new Error("fixture template is invalid");
    catalog.register(WIDGET.kind, compileTemplate(validated.template), WIDGET.descriptor);
    const themes = createThemeRegistry();
    themes.register(BRAND);
    const rendered = handleRenderWidget(
      catalog,
      { widget: WIDGET.kind, data: WIDGET.descriptor.dataExample, theme: "brand" },
      { themes }
    );
    const host = rendered.structuredContent as { tree: unknown; css: string };

    const island = boot().content;
    expect(JSON.stringify(host.tree)).toContain("engines");
    expect(island.tree).toEqual(host.tree);
    expect(island.css.startsWith(`${host.css}\n`)).toBe(true);
    expect(island.css.slice(host.css.length)).toContain("[data-wg-action]::after");
  });

  it("supplies every host variable the template bridges, from the built-in theme of its scheme", () => {
    const bridged = new Map(
      [...buildAppTemplate().matchAll(/--wg-([a-z-]+): var\((--[a-z-]+),/g)].map((m) => [m[2] as string, m[1] as ThemeToken])
    );
    expect(bridged.size).toBeGreaterThan(0);
    document.documentElement.setAttribute("data-theme", "dark");
    try {
      const { variables } = boot();
      expect(Object.keys(variables).sort()).toEqual([...bridged.keys()].sort());
      for (const [variable, token] of bridged) {
        expect(variables[variable], variable).toBe(darkTheme[token] ?? TOKEN_SPECS[token].default);
      }
    } finally {
      document.documentElement.removeAttribute("data-theme");
    }
  });
});
