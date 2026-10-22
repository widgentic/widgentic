// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { ThemeEntry } from "@widgentic/core";
import { createDesigner, exportWidgetJson, importWidgetJson } from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

const themes: ThemeEntry[] = [
  { name: "acme", label: "Acme", tokens: { accent: "#aa0001" }, styles: { ".wg-btn": { color: "rgb(1, 2, 3)" } } },
  { name: "acme-night", tokens: { accent: "#aa0002" } }
];
const widget = (extra: Record<string, unknown> = {}) => ({
  kind: "promo",
  template: { tag: "div", children: [{ bind: "title" }] },
  descriptor: { description: "promo", dataShape: "{ title }", dataExample: { title: "Sale" }, ...extra }
});
function host(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}
const change = (select: HTMLSelectElement, value: string): void => {
  select.value = value;
  select.dispatchEvent(new Event("change"));
};
const selectFor = (root: Element, mode: "light" | "dark") =>
  root.querySelector(`.wgd-widget-theme-${mode}`) as HTMLSelectElement;

describe("the widget designer sets the widget's themes", () => {
  it("choosing themes edits the descriptor", () => {
    const root = host();
    const designer = createDesigner(root, { initialWidget: widget(), themes });
    const light = selectFor(root, "light");
    expect([...light.options].map((option) => option.value)).toEqual(["", "light", "dark", "acme", "acme-night"]);
    expect(light.title).toContain("wears on light hosts when a render names none");
    expect(light.title).not.toContain("list_themes");
    change(light, "acme");
    change(selectFor(root, "dark"), "dark");
    const draft = designer.getDraft();
    expect(draft.descriptor.themes).toEqual({ light: "acme", dark: "dark" });
    expect((root.querySelector(".wgd-theme-select") as HTMLSelectElement).value).toBe("acme");
    expect(draft.previewTheme).toBe("acme");
    expect(draft.themeStyles).toEqual({ ".wg-btn": { color: "rgb(1, 2, 3)" } });
    const exported = JSON.parse(exportWidgetJson(draft)) as Record<string, unknown>;
    expect(Object.keys(exported)).toEqual(["kind", "template", "descriptor"]);
    expect((exported.descriptor as { themes?: unknown }).themes).toEqual({ light: "acme", dark: "dark" });
  });

  it("settings default omits the mode", () => {
    const root = host();
    const designer = createDesigner(root, { initialWidget: widget({ themes: { light: "acme", dark: "acme-night" } }), themes });
    expect(selectFor(root, "light").value).toBe("acme");
    expect(selectFor(root, "dark").value).toBe("acme-night");
    change(selectFor(root, "light"), "");
    expect(designer.getDraft().descriptor.themes).toEqual({ dark: "acme-night" });
    change(selectFor(root, "dark"), "");
    expect(designer.getDraft().descriptor).not.toHaveProperty("themes");
  });

  it("a missing theme stays visible", () => {
    const root = host();
    const designer = createDesigner(root, { initialWidget: widget({ themes: { light: "ghost" } }), themes });
    const light = selectFor(root, "light");
    expect(light.value).toBe("ghost");
    expect(light.selectedOptions[0]?.textContent).toBe("ghost (missing)");
    expect(designer.getDraft().descriptor.themes).toEqual({ light: "ghost" });
    change(light, "acme");
    expect(light.querySelector(".wgd-widget-theme-missing")).toBeNull();
    expect(designer.getDraft().descriptor.themes).toEqual({ light: "acme" });
  });

  it("import refuses a malformed themes field in the store's terms", () => {
    const bad = importWidgetJson(JSON.stringify(widget({ themes: { sepia: "acme" } })));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join("\n")).toContain("descriptor: INVALID_SHAPE — 'descriptor.themes.sepia'");
    expect(importWidgetJson(JSON.stringify(widget({ themes: { dark: "dark" } }))).ok).toBe(true);
  });
});

describe("the preview opens on the widget's own theme", () => {
  const brand: ThemeEntry = { name: "brand", tokens: { accent: "#bb0001" } };
  const all = [brand, ...themes];
  const shown = (root: Element) => (root.querySelector(".wgd-theme-select") as HTMLSelectElement).value;

  it("a widget's own theme opens as the preview theme", () => {
    const own = createDesigner(host(), {
      appearance: "light",
      initialWidget: widget({ themes: { light: "acme" } }),
      themes: all,
      defaultPreviewTheme: "brand"
    });
    expect(own.getDraft().previewTheme).toBe("acme");
    expect(own.getDraft().themeStyles).toEqual({ ".wg-btn": { color: "rgb(1, 2, 3)" } });

    const root = host();
    createDesigner(root, { appearance: "light", initialWidget: widget(), themes: all, defaultPreviewTheme: "brand" });
    expect(shown(root)).toBe("brand");

    const picked = createDesigner(host(), {
      appearance: "light",
      initialWidget: widget({ themes: { light: "acme" } }),
      themes: all,
      previewTheme: "brand",
      defaultPreviewTheme: "brand"
    });
    expect(picked.getDraft().previewTheme).toBe("brand");

    // A widget naming only the other scheme's theme opens on the fallback.
    const dark = createDesigner(host(), {
      appearance: "light",
      initialWidget: widget({ themes: { dark: "acme-night" } }),
      themes: all,
      defaultPreviewTheme: "brand"
    });
    expect(dark.getDraft().previewTheme).toBe("brand");
  });

  it("loading a widget switches to its own theme", () => {
    const root = host();
    const designer = createDesigner(root, { appearance: "dark", themes: all, previewTheme: "brand" });
    expect(shown(root)).toBe("brand");
    expect(designer.loadWidget(widget({ themes: { light: "acme", dark: "acme-night" } })).ok).toBe(true);
    expect(shown(root)).toBe("acme-night");
    expect(designer.getDraft().theme).toEqual({ accent: "#aa0002" });
  });

  it("loading a widget that names no theme for the scheme keeps the preview theme", () => {
    const root = host();
    const designer = createDesigner(root, { appearance: "dark", themes: all, previewTheme: "brand" });
    expect(designer.loadWidget(widget({ themes: { light: "acme" } })).ok).toBe(true);
    expect(shown(root)).toBe("brand");
    expect(designer.loadWidget(widget()).ok).toBe(true);
    expect(designer.getDraft().theme).toEqual({ accent: "#bb0001" });
  });
});
