// @vitest-environment happy-dom
/**
 * Host theming of the designer chrome (widget-designer spec, "Designer
 * chrome is themeable by the host"): the exported token list, the `chrome`
 * option and attribute, the untouched defaults, and a structural audit
 * that the stylesheet paints with tokens only outside its declaration
 * blocks. Computed values need a real browser (happy-dom does not cascade
 * `var()`); that check is recorded in TESTING.md.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { darkTheme } from "@widgentic/core";
import {
  CHROME_DEFAULTS,
  CHROME_TOKENS,
  chromeCss,
  createActionDesigner,
  createDesigner,
  createSchemaDesigner,
  createThemeDesigner,
  defineActionDesignerElement,
  defineDesignerElement,
  defineSchemaDesignerElement,
  defineThemeDesignerElement
} from "../index.js";
import type { ChromeOptions } from "../index.js";

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function rootOf(container: Element): HTMLElement {
  const root = container.querySelector(".wgd-root");
  if (!(root instanceof HTMLElement)) throw new Error("no .wgd-root mounted");
  return root;
}

function chromeSheet(): string {
  return document.head.querySelector("style[data-widgentic-designer]")?.textContent ?? "";
}

/** `--wgd-<name>: <value>` pairs of one declaration block. */
function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of block.matchAll(/--wgd-([a-z-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) out.set(name, value.trim());
  }
  return out;
}

const COLOUR_TOKENS = CHROME_TOKENS.slice(0, 18);
const HOST_MAP: ChromeOptions = {
  bg: "#101820",
  accent: "var(--brand)",
  font: "Inter, sans-serif",
  "font-size-sm": "12.5px",
  radius: "8px",
  shadow: "none"
};

const FACTORIES = [
  ["createDesigner", createDesigner],
  ["createThemeDesigner", createThemeDesigner],
  ["createSchemaDesigner", createSchemaDesigner],
  ["createActionDesigner", createActionDesigner]
] as const;

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("chrome tokens", () => {
  it("exports the documented list — colours first, then typography, shape and shadow", () => {
    expect(CHROME_TOKENS).toHaveLength(28);
    expect(COLOUR_TOKENS).toEqual([
      "bg", "panel", "border", "line", "text", "muted",
      "accent", "accent-bg", "accent-line",
      "danger", "danger-bg", "danger-line", "hover",
      "hl-key", "hl-str", "hl-num", "hl-bool", "hl-punct"
    ]);
    expect(CHROME_TOKENS.slice(18)).toEqual([
      "font", "font-mono", "font-size", "font-size-sm", "font-size-xs",
      "radius-sm", "radius", "radius-lg", "gap", "shadow"
    ]);
  });

  it("applies a host map inline on the root of every factory", () => {
    for (const [name, factory] of FACTORIES) {
      const container = host();
      factory(container, { chrome: HOST_MAP });
      const root = rootOf(container);
      for (const [token, value] of Object.entries(HOST_MAP)) {
        expect(root.style.getPropertyValue(`--wgd-${token}`), `${name} --wgd-${token}`).toBe(value);
      }
      // Nothing leaks onto the preview or the widget tokens.
      expect(root.style.getPropertyValue("--wg-bg")).toBe("");
    }
  });

  it("ignores unknown tokens, non-string values and CSS-wide keywords", () => {
    const container = host();
    const garbage = {
      nope: "#ffffff",
      bg: 12,
      font: "inherit",
      radius: " INITIAL ",
      text: "unset",
      gap: "revert-layer",
      accent: "#40a0c8"
    } as unknown as ChromeOptions;
    createDesigner(container, { chrome: garbage });
    const style = rootOf(container).getAttribute("style") ?? "";
    expect(style).toContain("--wgd-accent: #40a0c8");
    for (const absent of ["--wgd-nope", "--wgd-bg", "--wgd-font", "--wgd-radius", "--wgd-text", "--wgd-gap"]) {
      expect(style, absent).not.toContain(absent);
    }
  });

  it("sets nothing when no chrome is given", () => {
    for (const [, factory] of FACTORIES) {
      const container = host();
      factory(container);
      expect(rootOf(container).getAttribute("style") ?? "").toBe("");
    }
  });

  it("elements read the map from a JSON attribute and ignore anything else", () => {
    defineDesignerElement();
    defineThemeDesignerElement();
    defineSchemaDesignerElement();
    defineActionDesignerElement();
    document.body.innerHTML = `
      <widgentic-designer appearance="dark" chrome='{"accent":"#40A0C8"}'></widgentic-designer>
      <widgentic-theme-designer chrome='not json'></widgentic-theme-designer>
      <widgentic-schema-designer chrome='[1, 2]'></widgentic-schema-designer>
      <widgentic-action-designer chrome='{"accent":"#40A0C8","bogus":"x","font":"inherit"}'></widgentic-action-designer>
    `;
    const [widget, theme, schema, action] = [
      "widgentic-designer",
      "widgentic-theme-designer",
      "widgentic-schema-designer",
      "widgentic-action-designer"
    ].map((tag) => {
      const element = document.querySelector(tag);
      if (element === null) throw new Error(`missing <${tag}>`);
      return rootOf(element);
    });
    expect(widget?.style.getPropertyValue("--wgd-accent")).toBe("#40A0C8");
    expect(widget?.getAttribute("data-wgd-theme")).toBe("dark");
    expect(theme?.getAttribute("style") ?? "").toBe("");
    expect(schema?.getAttribute("style") ?? "").toBe("");
    expect(action?.style.getPropertyValue("--wgd-accent")).toBe("#40A0C8");
    expect(action?.getAttribute("style") ?? "").not.toMatch(/bogus|--wgd-font/);
  });

  it("leaves the widget preview's --wg-* tokens to the selected theme", () => {
    const container = host();
    createDesigner(container, { chrome: { bg: "#101820", text: "#eeeeee" }, initialTheme: darkTheme });
    const preview = container.querySelector(".wgd-preview");
    if (!(preview instanceof HTMLElement)) throw new Error("no preview");
    expect(darkTheme.bg).toBeDefined();
    expect(preview.style.getPropertyValue("--wg-bg")).toBe(darkTheme.bg);
    expect(preview.getAttribute("style") ?? "").not.toContain("--wgd-");
    expect(rootOf(container).getAttribute("style") ?? "").not.toContain("--wg-");
  });
});

function blocks(): { light: Map<string, string>; media: Map<string, string>; pinned: Map<string, string>; rules: string } {
  createDesigner(host());
  const sheet = chromeSheet();
  const light = sheet.match(/\.wgd-root \{([^}]*)\}/);
  const media = sheet.match(/\.wgd-root:not\(\[data-wgd-theme="light"\]\) \{([^}]*)\}/);
  const pinned = sheet.match(/\.wgd-root\[data-wgd-theme="dark"\] \{([^}]*)\}/);
  const start = sheet.indexOf(".wgd-root { display: flex;");
  if (!light?.[1] || !media?.[1] || !pinned?.[1] || start < 0) throw new Error("stylesheet layout changed");
  return {
    light: declarations(light[1]),
    media: declarations(media[1]),
    pinned: declarations(pinned[1]),
    // Comments are not paint: the audit reads declarations only.
    rules: sheet.slice(start).replace(/\/\*[\s\S]*?\*\//g, "")
  };
}

describe("chrome stylesheet", () => {

  it("declares exactly the chrome tokens, with the documented defaults", () => {
    const { light, media, pinned } = blocks();
    // Every block declares every token: each scheme is a complete palette
    // (the product shadow differs between them), so nothing falls back.
    expect([...light.keys()].sort()).toEqual([...CHROME_TOKENS].sort());
    expect([...media.keys()].sort()).toEqual([...CHROME_TOKENS].sort());
    expect([...pinned.keys()].sort()).toEqual([...CHROME_TOKENS].sort());
    expect(media).toEqual(pinned);
    // The stylesheet IS the exported palette — not a copy that can drift.
    expect(Object.fromEntries(light)).toEqual(CHROME_DEFAULTS.light);
    expect(Object.fromEntries(pinned)).toEqual(CHROME_DEFAULTS.dark);
    // Typography and spacing are unbranded and identical in both schemes.
    for (const token of ["font", "font-mono", "font-size", "font-size-sm", "font-size-xs", "gap"] as const) {
      expect(media.get(token)).toBe(light.get(token));
    }
    expect(Object.fromEntries(light)).toMatchObject({
      font: "system-ui, sans-serif",
      "font-mono": "ui-monospace, monospace",
      "font-size": "13px",
      "font-size-sm": "12px",
      "font-size-xs": "11px",
      "radius-sm": "4px",
      radius: "6px",
      "radius-lg": "8px",
      gap: "16px"
    });
  });

  it("lets a host replace the whole palette with its own", () => {
    const container = host();
    // A host owns its look by passing values, not by reaching for a second
    // palette we ship — there is only one default.
    const own = Object.fromEntries(CHROME_TOKENS.map((token) => [token, "#123456"]));
    createDesigner(container, { chrome: own });
    const style = rootOf(container).style;
    for (const token of CHROME_TOKENS) {
      expect(style.getPropertyValue(`--wgd-${token}`)).toBe("#123456");
    }
  });

  it("lets a partial host map override the product defaults", () => {
    const container = host();
    createDesigner(container, { chrome: { accent: "#123456" } });
    const style = rootOf(container).style;
    expect(style.getPropertyValue("--wgd-accent")).toBe("#123456");
    // Everything the host did not name still comes from the stylesheet block.
    expect(style.getPropertyValue("--wgd-bg")).toBe("");
  });
});

describe("chromeCss", () => {
  it("declares every token under the given prefix, in both schemes", () => {
    const css = chromeCss(CHROME_DEFAULTS, { prefix: "--host" });
    for (const token of CHROME_TOKENS) {
      expect(css).toContain(`--host-${token}: ${CHROME_DEFAULTS.light[token]};`);
      expect(css).toContain(`--host-${token}: ${CHROME_DEFAULTS.dark[token]};`);
    }
    expect(css).toContain(":root {");
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("writes the dark values under an explicit selector when asked", () => {
    const css = chromeCss(CHROME_DEFAULTS, { selector: ".x", darkSelector: '.x[data-theme="dark"]' });
    expect(css).toContain(".x {");
    expect(css).toContain('.x[data-theme="dark"] {');
    expect(css).toContain(`--wgd-bg: ${CHROME_DEFAULTS.dark.bg};`);
  });

  it("is what the designer stylesheet is built from", () => {
    createDesigner(host());
    const expected = chromeCss(CHROME_DEFAULTS, {
      selector: ".wgd-root",
      darkMediaSelector: '.wgd-root:not([data-wgd-theme="light"])',
      darkSelector: '.wgd-root[data-wgd-theme="dark"]'
    });
    expect(chromeSheet()).toContain(expected);
  });
});

describe("chrome stylesheet literals", () => {
  it("paints the component rules with tokens only — no literals, no dead fallbacks", () => {
    const { rules } = blocks();
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    expect(rules).not.toMatch(/system-ui|monospace|sans-serif|serif/);
    // A fallback would mean a token the blocks (or the widget base stylesheet) do not define.
    expect(rules).not.toMatch(/var\(--wgd?-[a-z-]+\s*,/);

    const values = (property: RegExp): string[] =>
      [...rules.matchAll(property)].map((match) => (match[1] ?? "").trim());
    const size = /^(var\(--wgd-font-size(-sm|-xs)?\)|calc\(var\(--wgd-font-size-xs\) - 1px\))$/;
    const family = /^var\(--wgd-font(-mono)?\)$/;

    const families = values(/font-family:\s*([^;}]+)/g);
    expect(families.length).toBeGreaterThan(10);
    for (const value of families) expect(value).toMatch(family);

    const sizes = values(/font-size:\s*([^;}]+)/g);
    expect(sizes.length).toBeGreaterThan(20);
    for (const value of sizes) expect(value).toMatch(size);

    const shorthands = values(/[\s;{]font:\s*([^;}]+)/g);
    expect(shorthands.length).toBeGreaterThan(2);
    for (const value of shorthands) {
      if (value === "inherit") continue;
      const [sizePart, familyPart] = value.split(/\s+(?=var\(--wgd-font)/);
      expect(sizePart ?? "").toMatch(size);
      expect(familyPart ?? "").toMatch(family);
    }

    const radii = values(/border-radius:\s*([^;}]+)/g);
    expect(radii.length).toBeGreaterThan(15);
    // 50% is a shape (the busy spinner's circle), not a radius step.
    for (const value of radii) expect(value).toMatch(/^(var\(--wgd-radius(-sm|-lg)?\)|50%)$/);

    for (const value of values(/box-shadow:\s*([^;}]+)/g)) {
      expect(value).toMatch(/^(var\(--wgd-shadow\)|none)$/);
    }
    expect(rules).toMatch(/\.wgd-root \{ display: flex; gap: var\(--wgd-gap\);/);
  });
});
