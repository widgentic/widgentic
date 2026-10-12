// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { widgetStylesToCss } from "../../catalog/index.js";
import { createThemeRegistry, InvalidThemeEntryError, themeStylesToCss, validateTheme } from "../index.js";
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

  it("splits only on top-level commas, keeping pseudo-class arguments whole", () => {
    const css = themeStylesToCss({ ".wg-row:has(.wg-ok, .wg-warn), .wg-x :is(.wg-a, .wg-b)": { color: "red" } }, DARK);
    expect(css.split(" {")[0]).toBe(
      `:where(${DARK}) .wg-row:has(.wg-ok, .wg-warn), :where(${DARK}) .wg-x :is(.wg-a, .wg-b)`
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

describe("the shared style guards", () => {
  const css = (styles: Record<string, Record<string, string>>) => themeStylesToCss(styles);

  it.each([
    ["a comment in a selector", { "html /* .wg-x */": { color: "red" } }],
    ["a .wg- class only inside :not()", { "body:not(.wg-x)": { color: "red" } }],
    ["a .wg- class only inside :is()", { ":is(.wg-a, body)": { color: "red" } }],
    ["a .wg- class only inside an attribute test", { 'body[data-a=".wg-"]': { color: "red" } }],
    ["a part opening with a combinator", { ".wg-a, ~ .wg-b": { color: "red" } }],
    ["a comment opener in a value", { ".wg-a": { color: "red /*" } }],
    ["image-set() in a value", { ".wg-a": { background: 'image-set("https://evil.example/x.png" 1x)' } }],
    ["-webkit-image-set() in a value", { ".wg-a": { background: '-webkit-image-set("https://evil.example/x.png" 1x)' } }],
    ["src() in a value", { ".wg-a": { background: 'src("https://evil.example/x.png")' } }],
    ["a quoted parenthesis hiding a top-level comma", { '.wg-a[title="("], body': { color: "red" } }],
    ["a quoted bracket closing :not() early", { 'body:not([title=")"] .wg-x)': { color: "red" } }],
    ["a quoted bracket ending an attribute test early", { 'body:not([x="]].wg-"])': { color: "red" } }],
    ["an unclosed pseudo-class", { ".wg-a:is(": { color: "red" } }],
    ["an unclosed attribute test", { ".wg-a[title": { color: "red" } }],
    ["an unclosed string in a selector", { '.wg-a[title="x]': { color: "red" } }],
    ["an unclosed bracket in a value", { ".wg-a": { width: "calc(1px + (2px" } }],
    ["an unclosed call in a value", { ".wg-a": { color: "foo(" } }],
    ["a stray closer in a value", { ".wg-a": { width: "1px)" } }],
    ["an unclosed string in a value", { ".wg-a": { content: '"open' } }]
  ])("drops %s", (_label, styles) => {
    expect(css(styles)).toBe("");
    expect(widgetStylesToCss(styles)).toBe("");
  });

  it("keeps selectors held to .wg- through :is() and :where(), and quoted brackets that close", () => {
    expect(css({ ":is(.wg-btn, .wg-link):hover": { color: "red" } })).toContain(":is(.wg-btn, .wg-link):hover {");
    expect(css({ ":where(.wg-card) h3": { color: "red" } })).toContain(":where(.wg-card) h3 {");
    expect(css({ ":is(:where(.wg-a), .wg-b p)": { color: "red" } })).toContain(":is(:where(.wg-a), .wg-b p) {");
    expect(css({ '.wg-a[title="("]': { content: '"("' } })).toContain('.wg-a[title="("] {\n  content: "(";');
    expect(css({ ".wg-a": { width: "calc(1px + (2px * 3))" } })).toContain("calc(1px + (2px * 3))");
  });

  it("keeps .wg- selectors with pseudo-class arguments and root anchors", () => {
    expect(css({ ".wg-row:has(.wg-ok, .wg-warn)": { color: "red" } })).toContain(".wg-row:has(.wg-ok, .wg-warn) {");
    expect(css({ ".wg-item:not(:last-child)": { color: "red" } })).toContain(".wg-item:not(:last-child) {");
    expect(css({ ':root[data-theme="dark"] .wg-btn': { color: "red" } })).toContain(':root[data-theme="dark"] .wg-btn {');
  });

  it("refuses the same vectors in theme token values", () => {
    for (const value of [
      "red /*",
      "image-set(\"https://e.example/x\" 1x)",
      "src(\"https://e.example/x\")",
      "u\\72 l(https://e.example/x)",
      "calc(1px + (2px",
      "\"open"
    ]) {
      const result = validateTheme({ accent: value });
      expect(result.ok, value).toBe(false);
    }
  });
});

describe("scoping a root-anchored part", () => {
  it("adds the scope to the root compound instead of prefixing it", () => {
    expect(themeStylesToCss({ ':root[data-theme="dark"] .wg-btn': { color: "red" } }, DARK).split(" {")[0]).toBe(
      `:root[data-theme="dark"]:where(${DARK}) .wg-btn`
    );
    expect(themeStylesToCss({ "html .wg-x, .wg-y": { color: "red" } }, DARK).split(" {")[0]).toBe(
      `html:where(${DARK}) .wg-x, :where(${DARK}) .wg-y`
    );
  });

  it("matches a root-anchored rule only in its own scope", () => {
    function colorFor(darkRoot: boolean): string {
      document.documentElement.removeAttribute("data-theme");
      if (darkRoot) document.documentElement.setAttribute("data-theme", "dark");
      document.head.innerHTML = `<style>${themeStylesToCss({ "html .wg-btn": { color: "rgb(7, 7, 7)" } }, DARK)}</style>`;
      document.body.innerHTML = '<button class="wg-btn">ok</button>';
      return getComputedStyle(document.querySelector(".wg-btn") as Element).color;
    }
    expect(colorFor(true)).toBe("rgb(7, 7, 7)");
    expect(colorFor(false)).not.toBe("rgb(7, 7, 7)");
  });
});

describe("a quoted parenthesis cannot carry a part out of its scope", () => {
  it("scopes every part of the list", () => {
    expect(themeStylesToCss({ '.wg-a[title="("], .wg-b': { color: "red" } }, DARK).split(" {")[0]).toBe(
      `:where(${DARK}) .wg-a[title="("], :where(${DARK}) .wg-b`
    );
  });

  it("leaves .wg-b unstyled on a light root", () => {
    function colorFor(darkRoot: boolean): string {
      document.documentElement.removeAttribute("data-theme");
      if (darkRoot) document.documentElement.setAttribute("data-theme", "dark");
      document.head.innerHTML = `<style>${themeStylesToCss({ '.wg-a[title="("], .wg-b': { color: "rgb(9, 8, 7)" } }, DARK)}</style>`;
      document.body.innerHTML = '<p class="wg-b">ok</p>';
      return getComputedStyle(document.querySelector(".wg-b") as Element).color;
    }
    expect(colorFor(true)).toBe("rgb(9, 8, 7)");
    expect(colorFor(false)).not.toBe("rgb(9, 8, 7)");
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
