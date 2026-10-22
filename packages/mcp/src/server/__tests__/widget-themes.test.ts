import { describe, expect, it } from "vitest";
import { composeCatalog, composeThemes, createMemoryStore } from "../../store/index.js";
import type { StoredAction, StoredWidget } from "../../store/index.js";
import { handleExecuteAction, handleListWidgets, handlePreviewWidget, handleRenderWidget, RENDER_WIDGET_TOOL } from "../index.js";
import type { GuardedFetchDeps } from "../index.js";
import type { WidgetThemes } from "@widgentic/core";

const LIGHT = ':root:not([data-theme="dark"])';
const DARK = ':root[data-theme="dark"]';

const refresh: StoredAction = {
  name: "refresh",
  definition: {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/promo",
    input: { type: "object", properties: { id: { type: "string" } } },
    output: { type: "object", properties: { title: { type: "string" } } }
  }
};

const widgetNaming = (kind: string, themes?: WidgetThemes): StoredWidget => ({
  kind,
  template: {
    tag: "div",
    children: [
      { tag: "h3", children: [{ bind: "title" }] },
      { tag: "button", action: { ref: "refresh", input: { id: "id" } }, children: ["Refresh"] }
    ]
  },
  descriptor: { description: kind, dataShape: "{ id, title }", ...(themes === undefined ? {} : { themes }) }
});

const THEMES = [
  { name: "acme", tokens: { accent: "#aa0001" } },
  { name: "acme-night", tokens: { accent: "#aa0002" } },
  { name: "ledger", tokens: { accent: "#aa0003" } },
  { name: "brand", tokens: { accent: "#bb0001" } },
  { name: "brand-dark", tokens: { accent: "#bb0002" } }
];

/** A principal whose defaults are brand/brand-dark, with widgets naming themes. */
async function rig(widgets: StoredWidget[], options: { defaults?: boolean; themes?: typeof THEMES } = {}) {
  const store = createMemoryStore([
    {
      principal: { id: "p", scopes: ["read", "execute"] },
      themes: options.themes ?? THEMES,
      widgets,
      actions: [refresh],
      ...(options.defaults === false ? {} : { settings: { defaultThemes: { light: "brand", dark: "brand-dark" } } })
    }
  ]);
  const composed = await composeCatalog(store, "p", { executeAllowed: true });
  const themes = (await composeThemes(store, "p")).value;
  return { catalog: composed.value, actions: composed.actions, themes };
}
const cssOf = (result: { structuredContent?: unknown }) => String((result.structuredContent as { css: string }).css);
const textOf = (result: { content: { type: string; text?: string }[] }) =>
  result.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n");
/** The declarations under one scope selector. */
function scoped(css: string, scope: string): string {
  const at = css.indexOf(`${scope} {`);
  return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
}

const data = { id: "1", title: "Sale" };

describe("a widget's own themes take priority over the defaults", () => {
  it("a widget's themes dress each mode", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme", dark: "acme-night" })]);
    const css = cssOf(handleRenderWidget(catalog, { widget: "promo", data }, { themes }));
    expect(scoped(css, LIGHT)).toContain("--wg-accent: #aa0001");
    expect(scoped(css, DARK)).toContain("--wg-accent: #aa0002");
    expect(css).not.toContain("#bb0001");
    expect(css).not.toContain("#bb0002");
  });

  it("a widget naming one mode keeps the other default", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme" })]);
    const css = cssOf(handleRenderWidget(catalog, { widget: "promo", data }, { themes }));
    expect(scoped(css, LIGHT)).toContain("#aa0001");
    expect(scoped(css, DARK)).toContain("#bb0002");
  });

  it("a built-in name opts out of a brand default", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "light" })]);
    const css = cssOf(handleRenderWidget(catalog, { widget: "promo", data }, { themes }));
    expect(scoped(css, LIGHT)).toBe("");
    expect(css).not.toContain("#bb0001");
    expect(scoped(css, DARK)).toContain("#bb0002");
  });

  it("one theme for both modes is emitted as an explicit theme is", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme", dark: "acme" }), widgetNaming("plain")]);
    const own = cssOf(handleRenderWidget(catalog, { widget: "promo", data }, { themes }));
    const explicit = cssOf(handleRenderWidget(catalog, { widget: "plain", data, theme: "acme" }, { themes }));
    expect(own).toBe(explicit);
  });

  it("an explicit theme still wins", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme" }), widgetNaming("plain")]);
    const result = handleRenderWidget(catalog, { widget: "promo", data, theme: "dark" }, { themes });
    expect(cssOf(result)).not.toContain("#aa0001");
    expect(cssOf(result)).toBe(cssOf(handleRenderWidget(catalog, { widget: "plain", data, theme: "dark" }, { themes })));
    expect(textOf(result)).not.toContain("Theme notes");
  });

  it("previews, re-renders and pages follow the widget", async () => {
    const { catalog, actions, themes } = await rig([widgetNaming("promo", { light: "acme" })]);
    const render = handleRenderWidget(catalog, { widget: "promo", data }, { themes });
    const preview = handlePreviewWidget(catalog, { widget: "promo", data }, { themes });
    expect(scoped(cssOf(preview), LIGHT)).toBe(scoped(cssOf(render), LIGHT));
    expect(scoped(cssOf(preview), LIGHT)).toContain("#aa0001");

    const deps: GuardedFetchDeps = {
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async () => new Response(JSON.stringify({ title: "Sale!" }), { headers: { "content-type": "application/json" } })
    };
    const held = (render.structuredContent as { payload: Record<string, unknown> }).payload;
    const rerender = await handleExecuteAction(
      catalog,
      { widget: "promo", action: "children.1", args: { id: "1" }, payload: held },
      { actions, scopes: ["read", "execute"], secrets: async () => undefined, fetchDeps: deps, themes }
    );
    expect(rerender.isError).toBeUndefined();
    expect(scoped(cssOf(rerender), LIGHT)).toContain("#aa0001");

    const page = textOf(handleRenderWidget(catalog, { widget: "promo", data, format: "page" }, { themes }));
    expect(page).toContain("--wg-accent: #aa0001");
    expect(page).not.toContain("#bb0001");
  });

  it("a group whose items agree wears their themes", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme" })]);
    const result = handleRenderWidget(
      catalog,
      {
        widget: "group",
        data: { items: [{ kind: "promo", data }, { kind: "card", data: { title: "x" } }, { kind: "promo", data }] }
      },
      { themes }
    );
    expect(scoped(cssOf(result), LIGHT)).toContain("#aa0001");
    expect(scoped(cssOf(result), DARK)).toContain("#bb0002");
    expect(textOf(result)).not.toContain("Theme notes");
  });

  it("a group whose items disagree wears the defaults and says so", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme" }), widgetNaming("report", { light: "ledger" })]);
    const input = { widget: "group", data: { items: [{ kind: "promo", data }, { kind: "report", data }] } };
    const result = handleRenderWidget(catalog, input, { themes });
    expect(scoped(cssOf(result), LIGHT)).toContain("#bb0001");
    expect(cssOf(result)).not.toContain("#aa0001");
    expect(textOf(result)).toContain(
      "Theme notes: group light theme: items name different themes (data.items[0] 'acme', data.items[1] 'ledger'); the default applies; pass 'theme' to choose one look for the whole group, or, when the user wants each widget in its own theme, render them as separate widgets instead of one group"
    );
    expect(textOf(result)).not.toContain("one.");
    const html = textOf(handleRenderWidget(catalog, { ...input, format: "html" }, { themes }));
    expect(html).toContain("Theme notes:");
    const page = handleRenderWidget(catalog, { ...input, format: "page" }, { themes });
    expect(String(page.content[0]?.type === "text" ? page.content[0].text : "")).not.toContain("Theme notes");
  });

  it("a group disagreeing in both modes notes each mode and advises once", async () => {
    const { catalog, themes } = await rig([
      widgetNaming("promo", { light: "acme", dark: "acme-night" }),
      widgetNaming("report", { light: "light", dark: "dark" })
    ]);
    const text = textOf(
      handleRenderWidget(catalog, { widget: "group", data: { items: [{ kind: "promo", data }, { kind: "report", data }] } }, { themes })
    );
    expect(text).toContain("group light theme: items name different themes (data.items[0] 'acme', data.items[1] 'light'); the default applies");
    expect(text).toContain("group dark theme: items name different themes (data.items[0] 'acme-night', data.items[1] 'dark'); the default applies");
    expect(text.split("render them as separate widgets").length - 1).toBe(1);
  });

  it("a missing theme falls back with a note", async () => {
    const { catalog, themes } = await rig([widgetNaming("promo", { light: "acme" })], {
      themes: THEMES.filter((theme) => theme.name !== "acme")
    }).catch(async () => {
      // The store refuses the widget at the door; compose it out of band instead.
      const withAcme = await rig([widgetNaming("promo", { light: "acme" })]);
      const without = await rig([], { themes: THEMES.filter((theme) => theme.name !== "acme") });
      return { catalog: withAcme.catalog, themes: without.themes, actions: withAcme.actions };
    });
    const result = handleRenderWidget(catalog, { widget: "promo", data }, { themes });
    expect(scoped(cssOf(result), LIGHT)).toContain("#bb0001");
    expect(textOf(result)).toContain(
      "Theme notes: widget 'promo' names light theme 'acme', which is not available; the default applies"
    );
  });

  it("agents see a widget's themes", async () => {
    const { catalog } = await rig([widgetNaming("promo", { light: "acme", dark: "acme-night" })]);
    const listed = JSON.parse(textOf(handleListWidgets(catalog))) as { kind: string; themes?: unknown }[];
    expect(listed.find((entry) => entry.kind === "promo")?.themes).toEqual({ light: "acme", dark: "acme-night" });
    const theme = (RENDER_WIDGET_TOOL.inputSchema as { properties: { theme: { description: string } } }).properties.theme;
    expect(theme.description).toContain("widget's own themes");
  });

  it("widgets without themes render byte-identically", async () => {
    const { catalog, themes } = await rig([widgetNaming("plain")]);
    const result = handleRenderWidget(catalog, { widget: "plain", data }, { themes });
    expect(scoped(cssOf(result), LIGHT)).toContain("#bb0001");
    expect(scoped(cssOf(result), DARK)).toContain("#bb0002");
    expect(textOf(result)).not.toContain("Theme notes");
  });
});
