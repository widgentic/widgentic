import { describe, it, expect } from "vitest";
import {
  THEME_TOKENS,
  TOKEN_DEFAULTS,
  baseStylesheet,
  isSafeTokenValue
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
      "thumb-size"
    ]) {
      expect(THEME_TOKENS).toContain(token);
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
      ".wg-custom",
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
    expect(baseStylesheet).toMatch(/\.wg-img-hero[^}]*max-width: 100%/);
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

  it("collapses tree children when data-expanded is false", () => {
    expect(baseStylesheet).toContain(
      '.wg-tree-node[data-expanded="false"] > .wg-tree-children'
    );
  });
});
