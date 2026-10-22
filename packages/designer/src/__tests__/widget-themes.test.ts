// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { WIDGET_THEMES_RULE } from "@widgentic/core";
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
    expect(light.title).toBe(WIDGET_THEMES_RULE);
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
