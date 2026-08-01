// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { applyTheme, injectBaseStyles, baseStylesheet } from "../index.js";
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
