// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  THEME_TOKENS,
  TOKEN_DEFAULTS,
  TOKEN_SPECS,
  applyTheme,
  baseStylesheet,
  isSafeTokenValue,
  themeToCss
} from "../index.js";

describe("token registry", () => {
  it("contains the documented tokens", () => {
    for (const token of [
      "bg",
      "fg",
      "muted",
      "accent",
      "border",
      "radius",
      "spacing",
      "font-family",
      "font-size",
      "shadow",
      "avatar-size",
      "thumb-size",
      "surface",
      "accent-fg",
      "border-width",
      "radius-sm",
      "radius-lg",
      "spacing-sm",
      "spacing-lg",
      "font-mono",
      "font-size-sm",
      "font-size-lg",
      "line-height",
      "danger",
      "success",
      "warning",
      "info"
    ]) {
      expect(THEME_TOKENS).toContain(token);
    }
  });

  it("every token declares a type and a documented use", () => {
    const types = new Set([
      "color",
      "dimension",
      "number",
      "font-family",
      "font-weight",
      "shadow"
    ]);
    for (const token of THEME_TOKENS) {
      const spec = TOKEN_SPECS[token];
      expect(types.has(spec.type), `${token}: ${spec.type}`).toBe(true);
      expect(spec.use.length, token).toBeGreaterThan(10);
      // Color tokens must actually carry color defaults — the metadata is
      // what tooling trusts instead of guessing.
      if (spec.type === "color") {
        expect(spec.default, token).toMatch(/^#[0-9a-f]{3,8}$/i);
      }
    }
    expect(TOKEN_DEFAULTS.bg).toBe(TOKEN_SPECS.bg.default);
  });

  it("every token has a non-empty default so omitting it changes nothing", () => {
    for (const token of THEME_TOKENS) {
      expect(TOKEN_DEFAULTS[token], token).toBeTypeOf("string");
      expect(TOKEN_DEFAULTS[token].length, token).toBeGreaterThan(0);
    }
  });

  it("every default value passes the safety guard", () => {
    for (const token of THEME_TOKENS) {
      expect(isSafeTokenValue(TOKEN_DEFAULTS[token])).toBe(true);
    }
  });
});

describe("baseStylesheet", () => {
  it("covers the built-in widget classes", () => {
    for (const cls of [
      ".wg-card",
      ".wg-table",
      ".wg-tree",
      ".wg-code",
      ".wg-template",
      ".wg-img",
      ".wg-img-avatar",
      ".wg-img-thumb",
      ".wg-img-hero"
    ]) {
      expect(baseStylesheet).toContain(cls);
    }
  });

  it("sizes image shapes from the registry tokens", () => {
    expect(baseStylesheet).toMatch(/\.wg-img-avatar[^}]*var\(--wg-avatar-size,/);
    expect(baseStylesheet).toMatch(/\.wg-img-thumb[^}]*var\(--wg-thumb-size,/);
    // Heroes SPAN the available width (spec), not merely cap at it.
    expect(baseStylesheet).toMatch(/\.wg-img-hero[^}]*width: 100%/);
    expect(baseStylesheet).toMatch(/\.wg-img-hero[^}]*max-width: 100%/);
  });

  it("defines EVERY registry token at :root so bare var() refs resolve", () => {
    // Custom widget styles use bare var(--wg-x) (per the authoring
    // guide); without these definitions, any token the active theme
    // doesn't set silently invalidates the author's declaration.
    const rootBlock = /^:root \{([\s\S]*?)\}/.exec(baseStylesheet.trim())?.[1] ?? "";
    for (const token of THEME_TOKENS) {
      expect(rootBlock, token).toContain(`--wg-${token}: ${TOKEN_DEFAULTS[token]};`);
    }
  });

  it("consumes EVERY registry token — no decorative tokens", () => {
    // The standing rule: a token exists because the stylesheet uses it.
    // This is what makes the registry a design system rather than a
    // wish list; it caught four unused tokens when first written.
    const referenced = new Set(
      [...baseStylesheet.matchAll(/var\(--wg-([a-z-]+)/g)].map((m) => m[1])
    );
    const unused = THEME_TOKENS.filter((token) => !referenced.has(token));
    expect(unused, `unused tokens: ${unused.join(", ")}`).toEqual([]);
  });

  it("status utilities pair each status color with its text color", () => {
    for (const status of ["danger", "success", "warning", "info", "accent"]) {
      expect(baseStylesheet).toContain(`.wg-status-${status}`);
      expect(baseStylesheet).toMatch(
        new RegExp(`\\.wg-status-${status}[^}]*var\\(--wg-${status}-fg,`)
      );
    }
  });

  it("consumes the new density and mono tokens", () => {
    expect(baseStylesheet).toMatch(/line-height: var\(--wg-line-height,/);
    expect(baseStylesheet).toMatch(/\.wg-code \{[^}]*font-family: var\(--wg-font-mono,/);
  });

  it("widget surfaces fall back from surface to bg", () => {
    // The nested chain is the back-compat guarantee: themes setting only
    // `bg` color surfaces exactly as before; `surface` overrides when set.
    for (const cls of ["\\.wg-card", "\\.wg-table", "\\.wg-code"]) {
      expect(baseStylesheet).toMatch(
        new RegExp(`${cls} \\{[^}]*background: var\\(--wg-surface, var\\(--wg-bg,`)
      );
    }
  });

  it("a bg-only theme carries surface with it (the chain, resolved)", () => {
    // The text assertion above passed throughout a live regression: once
    // the :root defaults block defined --wg-surface, the rules' fallback
    // became unreachable and bg-only dark themes painted white cards.
    // Custom-property substitution happens where the property is
    // DECLARED, so the relationship is resolved at theme-application
    // time — assert the emitted declarations, not the stylesheet text.
    const bgOnly = themeToCss({ bg: "#0f131c" }, ":root");
    expect(bgOnly).toContain("--wg-bg: #0f131c;");
    expect(bgOnly).toContain("--wg-surface: #0f131c;");

    // An explicit surface is never overwritten by the fallback.
    const both = themeToCss({ bg: "#0f131c", surface: "#1a2130" }, ":root");
    expect(both).toContain("--wg-surface: #1a2130;");

    // Nothing to inherit from: no surface is invented, so the :root
    // default (white) still applies.
    expect(themeToCss({ fg: "#fff" }, ":root")).not.toContain("--wg-surface");
  });

  it("applyTheme resolves declared fallbacks onto the element", () => {
    const el = document.createElement("div");
    applyTheme(el, { bg: "#0f131c" });
    expect(el.style.getPropertyValue("--wg-surface")).toBe("#0f131c");
    // Replace semantics still hold: re-applying without bg clears both.
    applyTheme(el, {});
    expect(el.style.getPropertyValue("--wg-surface")).toBe("");
  });

  it("every token declaring a fallback names a real token", () => {
    for (const token of THEME_TOKENS) {
      const fallback = (TOKEN_SPECS[token] as { fallback?: string }).fallback;
      if (fallback === undefined) continue;
      expect(THEME_TOKENS).toContain(fallback);
    }
  });

  it("references only registry tokens, always with a fallback", () => {
    const known = new Set<string>(THEME_TOKENS);
    const refs = [...baseStylesheet.matchAll(/var\(--wg-([a-z-]+)([,)])/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(known.has(ref[1] ?? "")).toBe(true);
      expect(ref[2]).toBe(","); // fallback present
    }
  });

  it("styles the tree's native disclosure instead of hiding children by CSS", () => {
    // Collapsing is the details element's own semantics — a CSS rule
    // hiding children would fight the platform behavior.
    expect(baseStylesheet).not.toContain("data-expanded");
    expect(baseStylesheet).toMatch(
      /\.wg-tree-branch > \.wg-tree-label \{[^}]*cursor: pointer/
    );
    // one marker, ours: the platform's is suppressed on both engines
    expect(baseStylesheet).toMatch(
      /\.wg-tree-branch > \.wg-tree-label \{[^}]*list-style: none/
    );
    expect(baseStylesheet).toContain(
      ".wg-tree-branch > .wg-tree-label::-webkit-details-marker"
    );
    // the chevron is token-colored and turns with the open state
    expect(baseStylesheet).toMatch(
      /\.wg-tree-branch > \.wg-tree-label::before \{[^}]*var\(--wg-muted,/
    );
    expect(baseStylesheet).toMatch(
      /\.wg-tree-branch\[open\] > \.wg-tree-label::before \{[^}]*rotate/
    );
  });

  it("keeps the tree's indent and hairline on the children list", () => {
    expect(baseStylesheet).toMatch(
      /\.wg-tree-children \{[^}]*padding-left: var\(--wg-spacing-lg,/
    );
    expect(baseStylesheet).toMatch(
      /\.wg-tree-children \{[^}]*border-left: var\(--wg-border-width,/
    );
  });

  it("sizes text and image node icons to the same em box", () => {
    const box = (cls: string) =>
      new RegExp(`\\${cls} \\{[^}]*width: ([0-9.]+em)`).exec(baseStylesheet)?.[1];
    expect(box(".wg-tree-icon")).toBeDefined();
    expect(box(".wg-img-icon")).toBe(box(".wg-tree-icon"));
  });
});
