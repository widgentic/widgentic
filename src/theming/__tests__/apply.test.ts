// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { applyTheme, injectBaseStyles, baseStylesheet, themeToCss } from "../index.js";
import type { WidgetTheme } from "../index.js";

function container(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("applyTheme", () => {
  it("sets tokens as inline custom properties", () => {
    const target = container();
    applyTheme(target, { bg: "#111", accent: "tomato" });
    expect(target.style.getPropertyValue("--wg-bg")).toBe("#111");
    expect(target.style.getPropertyValue("--wg-accent")).toBe("tomato");
  });

  it("re-application replaces previous tokens", () => {
    const target = container();
    applyTheme(target, { bg: "#111", accent: "tomato" });
    applyTheme(target, { bg: "#222" });
    expect(target.style.getPropertyValue("--wg-bg")).toBe("#222");
    expect(target.style.getPropertyValue("--wg-accent")).toBe("");
  });

  it("empty theme resets all tokens", () => {
    const target = container();
    applyTheme(target, { bg: "#111", fg: "#eee" });
    applyTheme(target, {});
    expect(target.style.getPropertyValue("--wg-bg")).toBe("");
    expect(target.style.getPropertyValue("--wg-fg")).toBe("");
  });

  it("skips unknown tokens and unsafe values silently", () => {
    const target = container();
    applyTheme(target, {
      bg: "#111",
      sneaky: "red",
      accent: "url(https://evil.example)"
    } as WidgetTheme);
    expect(target.style.getPropertyValue("--wg-bg")).toBe("#111");
    expect(target.style.getPropertyValue("--wg-sneaky")).toBe("");
    expect(target.style.getPropertyValue("--wg-accent")).toBe("");
  });

  it("avatar-size override flows through as a custom property", () => {
    const target = container();
    applyTheme(target, { "avatar-size": "48px" });
    expect(target.style.getPropertyValue("--wg-avatar-size")).toBe("48px");
  });

  it("scopes themes per container", () => {
    const a = container();
    const b = container();
    applyTheme(a, { bg: "#111" });
    applyTheme(b, { bg: "#eee" });
    expect(a.style.getPropertyValue("--wg-bg")).toBe("#111");
    expect(b.style.getPropertyValue("--wg-bg")).toBe("#eee");
  });
});

describe("injectBaseStyles", () => {
  it("appends one marked style element, idempotently", () => {
    injectBaseStyles(document);
    injectBaseStyles(document);
    const styles = document.head.querySelectorAll("style[data-widgentic]");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toBe(baseStylesheet);
  });
});

describe("custom variables in application and CSS", () => {
  it("applies and clears --wg-x-* alongside tokens", () => {
    const target = container();
    applyTheme(target, { bg: "#111", "x-badge-gap": "4px" });
    expect(target.style.getPropertyValue("--wg-bg")).toBe("#111");
    expect(target.style.getPropertyValue("--wg-x-badge-gap")).toBe("4px");
    // Replace semantics must clear custom variables as well.
    applyTheme(target, { bg: "#222" });
    expect(target.style.getPropertyValue("--wg-x-badge-gap")).toBe("");
  });

  it("skips unsafe custom values at runtime", () => {
    const target = container();
    applyTheme(target, { "x-evil": "url(https://evil.example)" });
    expect(target.style.getPropertyValue("--wg-x-evil")).toBe("");
  });

  it("emits custom variables in generated CSS", () => {
    expect(themeToCss({ "x-gap": "4px" })).toContain("--wg-x-gap: 4px;");
    expect(themeToCss({ "x-evil": "url(https://x)" })).not.toContain("--wg-x-evil");
  });
});

