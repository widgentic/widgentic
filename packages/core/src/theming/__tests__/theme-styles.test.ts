// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { widgetStylesToCss } from "../../catalog/index.js";
import { createThemeRegistry, InvalidThemeEntryError, themeStylesToCss } from "../index.js";
import type { ThemeEntry } from "../index.js";

const DARK = ':root[data-theme="dark"]';

describe("theme styles in the registry", () => {
  it("travel with the entry and merge through extends", () => {
    const registry = createThemeRegistry();
    registry.register({ name: "base", tokens: {}, styles: { ".wg-btn": { padding: "4px", color: "red" } } });
    registry.register({
      name: "child",
      extends: "base",
      tokens: {},
      styles: { ".wg-btn": { color: "blue" }, ".wg-badge": { "font-weight": "700" } }
    });
    expect(registry.get("child")?.styles).toEqual({
      ".wg-btn": { padding: "4px", color: "blue" },
      ".wg-badge": { "font-weight": "700" }
    });
    expect(registry.get("base")?.styles).toEqual({ ".wg-btn": { padding: "4px", color: "red" } });
  });

  it.each([
    ["an array", [] as unknown],
    ["a selector mapped to a string", { ".wg-btn": "padding: 4px" }],
    ["a non-string value", { ".wg-btn": { padding: 4 } }]
  ])("refuses %s with INVALID_THEME", (_label, styles) => {
    const registry = createThemeRegistry();
    let caught: unknown;
    try {
      registry.register({ name: "bad", tokens: {}, styles } as unknown as ThemeEntry);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidThemeEntryError);
    expect((caught as InvalidThemeEntryError).code).toBe("INVALID_THEME");
    expect(registry.get("bad")).toBeUndefined();
  });

  it("keeps entries without styles free of a styles key", () => {
    const registry = createThemeRegistry();
    registry.register({ name: "plain", tokens: { accent: "#ff5a1f" } });
    expect(Object.keys(registry.get("plain") ?? {})).not.toContain("styles");
    expect(registry.get("dark")).not.toHaveProperty("styles");
  });
});

describe("registry defaults", () => {
  it("start as the built-ins", () => {
    const registry = createThemeRegistry();
    expect(registry.defaults()).toEqual({ light: "light", dark: "dark" });
    expect(registry.getDefault("light").name).toBe("light");
    expect(registry.getDefault("dark").name).toBe("dark");
  });

  it("hold one default per mode, and one theme may serve both", () => {
    const registry = createThemeRegistry();
    registry.register({ name: "a", tokens: {} });
    registry.register({ name: "b", tokens: {} });
    registry.setDefault("light", "a");
    registry.setDefault("light", "b");
    expect(registry.getDefault("light").name).toBe("b");
    expect(registry.getDefault("dark").name).toBe("dark");
    registry.setDefault("dark", "b");
    expect(registry.defaults()).toEqual({ light: "b", dark: "b" });
  });

  it("accept registered entries only", () => {
    const registry = createThemeRegistry();
    expect(() => registry.setDefault("dark", "missing")).toThrow(InvalidThemeEntryError);
    expect(registry.defaults().dark).toBe("dark");
  });

  it("do not leak into another registry", () => {
    const first = createThemeRegistry();
    first.register({ name: "a", tokens: {} });
    first.setDefault("light", "a");
    expect(createThemeRegistry().defaults()).toEqual({ light: "light", dark: "dark" });
  });
});

describe("themeStylesToCss", () => {
  it("matches the widget-styles generator without a scope", () => {
    const styles = { ".wg-btn": { padding: "4px 8px" }, ".wg-a, .wg-b": { color: "red" } };
    expect(themeStylesToCss(styles)).toBe(widgetStylesToCss(styles));
  });

  it("prefixes every selector part with the scope", () => {
    const css = themeStylesToCss({ ".wg-btn, .wg-link": { color: "var(--wg-accent)" } }, DARK);
    expect(css).toBe(
      `:where(${DARK}) .wg-btn, :where(${DARK}) .wg-link {\n  color: var(--wg-accent);\n}`
    );
  });

  it("drops unsafe entries and keeps safe siblings", () => {
    const css = themeStylesToCss(
      { body: { color: "red" }, ".wg-x": { background: "url(https://evil.example/x)" }, ".wg-btn": { padding: "4px" } },
      DARK
    );
    expect(css).toBe(`:where(${DARK}) .wg-btn {\n  padding: 4px;\n}`);
  });
});

describe("a scoped rule applies only inside its scope at its author's weight", () => {
  // Each case builds the document from scratch: the computed value is read
  // once per fresh state, never after mutating the root of a styled page.
  function computedColor(darkRoot: boolean, widgetRule: boolean): string {
    document.documentElement.removeAttribute("data-theme");
    if (darkRoot) document.documentElement.setAttribute("data-theme", "dark");
    const themeCss = themeStylesToCss({ ".wg-btn": { color: "rgb(1, 2, 3)" } }, DARK);
    document.head.innerHTML = `<style>${themeCss}${widgetRule ? "\n.wg-btn { color: rgb(4, 5, 6); }" : ""}</style>`;
    document.body.innerHTML = '<button class="wg-btn">ok</button>';
    return getComputedStyle(document.querySelector(".wg-btn") as Element).color;
  }

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies inside the scope", () => {
    expect(computedColor(true, false)).toBe("rgb(1, 2, 3)");
  });

  it("loses a tie to a later widget rule", () => {
    expect(computedColor(true, true)).toBe("rgb(4, 5, 6)");
  });

  it("does not apply outside the scope", () => {
    expect(computedColor(false, false)).not.toBe("rgb(1, 2, 3)");
  });
});
