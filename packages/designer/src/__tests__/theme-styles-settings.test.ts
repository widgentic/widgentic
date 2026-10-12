// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { ThemeEntry } from "@widgentic/core";
import {
  createDesigner,
  createSettingsDesigner,
  createThemeDesigner,
  defineSettingsDesignerElement
} from "../index.js";
import type { SettingsRecord, WidgetDefinition } from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function sectionTitled(root: Element, title: string): HTMLElement {
  const found = [...root.querySelectorAll(".wgd-section")].find((section) =>
    section.querySelector(".wgd-section-title, summary, h3")?.textContent?.includes(title)
  );
  if (found === undefined) throw new Error(`No section titled '${title}'`);
  return found as HTMLElement;
}

function change(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("theme designer styles", () => {
  it("edits styles with the widget designer's Tree and JSON tabs", () => {
    const root = host();
    const designer = createThemeDesigner(root);
    const styles = sectionTitled(root, "Styles");
    expect([...styles.querySelectorAll(".wgd-tab")].map((tab) => tab.textContent)).toEqual(["Tree", "JSON"]);

    (styles.querySelector(".wgd-st-add") as HTMLButtonElement).click();
    change(styles.querySelector(".wgd-st-selector") as HTMLInputElement, ".wg-btn");
    (styles.querySelector('button[title="Add declaration"]') as HTMLButtonElement).click();
    change(styles.querySelector(".wgd-st-prop") as HTMLInputElement, "padding");
    change(styles.querySelector(".wgd-st-value") as HTMLInputElement, "4px 8px");

    expect(designer.getTheme().styles).toEqual({ ".wg-btn": { padding: "4px 8px" } });
    // The JSON view shows the same value.
    const json = styles.querySelector("textarea") as HTMLTextAreaElement;
    expect(JSON.parse(json.value)).toEqual({ ".wg-btn": { padding: "4px 8px" } });
  });

  it("omits styles from the export when emptied and round-trips them otherwise", () => {
    const entry: ThemeEntry = { name: "brand", tokens: { accent: "#ff5a1f" }, styles: { ".wg-btn": { padding: "4px" } } };
    const designer = createThemeDesigner(host(), { initialTheme: entry });
    expect(designer.getTheme()).toEqual(entry);
    expect(designer.loadTheme({ name: "plain", tokens: {} })).toEqual({ ok: true });
    expect(designer.getTheme()).not.toHaveProperty("styles");
    const refused = designer.loadTheme({ name: "bad", tokens: {}, styles: { ".wg-btn": "padding: 4px" } });
    expect(refused.ok).toBe(false);
    expect(designer.getTheme().name).toBe("plain");
  });

  it("dresses the preview with the theme's styles", () => {
    const root = host();
    createThemeDesigner(root, {
      initialTheme: { name: "brand", tokens: {}, styles: { ".wg-card-title": { color: "rgb(1, 2, 3)" } } }
    });
    const title = root.querySelector(".wgd-preview .wg-card-title");
    if (title === null) throw new Error("the card preview did not mount");
    expect(getComputedStyle(title).color).toBe("rgb(1, 2, 3)");
  });

  it("flags entries the renderer would drop and keeps them out of the preview", () => {
    const root = host();
    createThemeDesigner(root, {
      initialTheme: { name: "brand", tokens: {}, styles: { body: { color: "red" }, ".wg-card-title": { color: "rgb(1, 2, 3)" } } }
    });
    const styles = sectionTitled(root, "Styles");
    expect(styles.textContent).toContain("body: Selector would be skipped");
    const css = [...root.querySelectorAll(".wgd-preview-pane style")].map((el) => el.textContent ?? "").join("\n");
    expect(css).not.toMatch(/(^|\s)body \{/);
    expect(css).toContain(".wg-card-title");
  });
});

describe("theme styles in the widget designer's preview", () => {
  const widget: WidgetDefinition = {
    kind: "pay-card",
    template: { tag: "button", attrs: { class: "wg-btn" }, children: ["Pay"] },
    descriptor: { description: "A pay button.", dataShape: "{}", dataExample: {} }
  };
  const themes: ThemeEntry[] = [{ name: "brand", tokens: {}, styles: { ".wg-btn": { color: "rgb(1, 2, 3)" } } }];

  function previewColor(definition: WidgetDefinition, theme: string): string {
    const root = host();
    createDesigner(root, { initialWidget: definition, themes });
    change(root.querySelector(".wgd-theme-select") as HTMLSelectElement, theme);
    const button = root.querySelector(".wgd-preview .wg-btn");
    if (button === null) throw new Error("the draft did not mount");
    return getComputedStyle(button).color;
  }

  it("applies the selected theme's shared class", () => {
    expect(previewColor(widget, "brand")).toBe("rgb(1, 2, 3)");
  });

  it("lets the draft's own rule win", () => {
    const styled = { ...widget, descriptor: { ...widget.descriptor, styles: { ".wg-btn": { color: "rgb(4, 5, 6)" } } } };
    expect(previewColor(styled, "brand")).toBe("rgb(4, 5, 6)");
  });

  it("removes the theme's rule when none is chosen and never exports it", () => {
    const root = host();
    const designer = createDesigner(root, { initialWidget: widget, themes });
    const select = root.querySelector(".wgd-theme-select") as HTMLSelectElement;
    change(select, "brand");
    const css = () => [...root.querySelectorAll(".wgd-preview-pane style")].map((el) => el.textContent ?? "").join("\n");
    expect(css()).toContain(".wg-btn");
    expect(Object.keys(designer.getDraft())).toContain("themeStyles");
    change(select, "");
    expect(css()).not.toContain(".wg-btn");
    expect(designer.getDraft()).not.toHaveProperty("themeStyles");
  });
});

describe("a host-chosen preview theme", () => {
  const widget: WidgetDefinition = {
    kind: "pay-card",
    template: { tag: "button", attrs: { class: "wg-btn" }, children: ["Pay"] },
    descriptor: { description: "A pay button.", dataShape: "{}", dataExample: {} }
  };
  const themes: ThemeEntry[] = [
    { name: "light", tokens: {} },
    { name: "brand", tokens: {}, styles: { ".wg-btn": { color: "rgb(1, 2, 3)" } } },
    { name: "night", tokens: { accent: "#0a84ff" } }
  ];
  const css = (root: Element) =>
    [...root.querySelectorAll(".wgd-preview-pane style")].map((el) => el.textContent ?? "").join("\n");

  it("opens with the named entry selected, tokens and styles applied from the first render", () => {
    const root = host();
    const designer = createDesigner(root, { initialWidget: widget, themes, previewTheme: "brand" });
    const select = root.querySelector(".wgd-theme-select") as HTMLSelectElement;
    expect(select.value).toBe("brand");
    const button = root.querySelector(".wgd-preview .wg-btn");
    if (button === null) throw new Error("the draft did not mount");
    expect(getComputedStyle(button).color).toBe("rgb(1, 2, 3)");
    expect(designer.getDraft().themeStyles).toEqual({ ".wg-btn": { color: "rgb(1, 2, 3)" } });
    change(select, "");
    expect(css(root)).not.toContain(".wg-btn");
    expect(designer.getDraft()).not.toHaveProperty("theme");
  });

  it("applies a tokens-only entry and ignores a name it was not given", () => {
    const night = createDesigner(host(), { initialWidget: widget, themes, previewTheme: "night" });
    expect(night.getDraft().theme).toEqual({ accent: "#0a84ff" });
    const root = host();
    const missing = createDesigner(root, { initialWidget: widget, themes, previewTheme: "missing" });
    expect((root.querySelector(".wgd-theme-select") as HTMLSelectElement).value).toBe("");
    expect(missing.getDraft()).not.toHaveProperty("theme");
  });

  it("keeps the preview theme, styles included, when a widget is loaded", () => {
    const root = host();
    const designer = createDesigner(root, { themes, previewTheme: "brand" });
    expect(designer.loadWidget(widget)).toEqual({ ok: true });
    expect(designer.getDraft().themeStyles).toEqual({ ".wg-btn": { color: "rgb(1, 2, 3)" } });
    expect((root.querySelector(".wgd-theme-select") as HTMLSelectElement).value).toBe("brand");
    expect(css(root)).toContain(".wg-btn");
  });
});

describe("settings designer", () => {
  const themes = [
    { name: "ocean", label: "Ocean" },
    { name: "night", label: "Night" }
  ];
  const select = (root: Element, mode: "light" | "dark") =>
    root.querySelector(`select.wgd-default-theme[data-mode="${mode}"]`) as HTMLSelectElement;

  it("mounts on its own and registers its element on the explicit call only", () => {
    const root = host();
    createSettingsDesigner(root, { themes });
    expect(root.querySelector(".wgd-settings-designer")).not.toBeNull();
    expect(root.querySelector(".wgd-preview-pane")).toBeNull();
    expect(root.querySelector(".wgd-styles")).toBeNull();
    expect(customElements.get("widgentic-settings-designer")).toBeUndefined();
    defineSettingsDesignerElement();
    const element = document.createElement("widgentic-settings-designer");
    const seen: unknown[] = [];
    element.addEventListener("widgentic-change", (event) => seen.push((event as CustomEvent).detail));
    document.body.appendChild(element);
    change(select(element, "light"), "light");
    expect(seen.length).toBeGreaterThan(0);
    expect((seen.at(-1) as { settings: SettingsRecord }).settings).toHaveProperty("defaultThemes");
  });

  it("choosing defaults edits the record and notifies", () => {
    const root = host();
    const designer = createSettingsDesigner(root, { themes });
    const heard: SettingsRecord[] = [];
    designer.subscribe((settings) => heard.push(settings));
    change(select(root, "light"), "ocean");
    change(select(root, "dark"), "night");
    expect(designer.getSettings()).toEqual({ defaultThemes: { light: "ocean", dark: "night" } });
    expect(heard.at(-1)).toEqual({ defaultThemes: { light: "ocean", dark: "night" } });
    change(select(root, "dark"), "");
    expect(designer.getSettings()).toEqual({ defaultThemes: { light: "ocean" } });
  });

  it("offers the built-in first and lets one theme serve both modes", () => {
    const root = host();
    const designer = createSettingsDesigner(root, { themes });
    expect([...select(root, "light").options].map((o) => o.textContent)).toEqual(["Built-in light", "Ocean", "Night"]);
    expect([...select(root, "dark").options].map((o) => o.textContent)).toEqual(["Built-in dark", "Ocean", "Night"]);
    change(select(root, "light"), "ocean");
    change(select(root, "dark"), "ocean");
    expect(designer.getSettings()).toEqual({ defaultThemes: { light: "ocean", dark: "ocean" } });
  });

  it("shows a missing theme as unavailable instead of dropping it", () => {
    const root = host();
    const designer = createSettingsDesigner(root, { themes });
    expect(designer.loadSettings({ defaultThemes: { dark: "gone" } })).toEqual({ ok: true });
    const dark = select(root, "dark");
    expect(dark.value).toBe("gone");
    expect(dark.selectedOptions[0]?.textContent).toBe("gone (unavailable)");
    expect(designer.getSettings()).toEqual({ defaultThemes: { dark: "gone" } });
    change(dark, "night");
    expect(designer.getSettings()).toEqual({ defaultThemes: { dark: "night" } });
  });

  it("passes sections it does not edit through untouched", () => {
    const root = host();
    const designer = createSettingsDesigner(root, {
      themes,
      initialSettings: { defaultThemes: { light: "ocean" }, fonts: { body: "Inter" } }
    });
    change(select(root, "light"), "night");
    expect(designer.getSettings()).toEqual({ defaultThemes: { light: "night" }, fonts: { body: "Inter" } });
  });

  it("refuses a malformed record without changing the current one", () => {
    const designer = createSettingsDesigner(host(), { themes, initialSettings: { defaultThemes: { light: "ocean" } } });
    expect(designer.loadSettings({ defaultThemes: { sepia: "ocean" } }).ok).toBe(false);
    expect(designer.loadSettings([]).ok).toBe(false);
    expect(designer.getSettings()).toEqual({ defaultThemes: { light: "ocean" } });
  });

  it("is visible but inert when read-only", () => {
    const root = host();
    const designer = createSettingsDesigner(root, { themes, readOnly: true, initialSettings: { defaultThemes: { light: "night" } } });
    expect(select(root, "light").value).toBe("night");
    expect(select(root, "light").closest("[inert]")).not.toBeNull();
    designer.setReadOnly(false);
    expect(select(root, "light").closest("[inert]")).toBeNull();
  });
});
