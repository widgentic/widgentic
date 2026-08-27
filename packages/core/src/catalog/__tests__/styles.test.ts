import { describe, it, expect } from "vitest";
import { widgetStylesToCss, createCatalog, el } from "../index.js";

describe("widgetStylesToCss", () => {
  it("generates rules from safe entries, tokens allowed", () => {
    const css = widgetStylesToCss({
      ".wg-invoice": {
        border: "1px solid var(--wg-border, #e2e8f0)",
        padding: "8px"
      },
      ".wg-invoice h2, .wg-invoice li": { color: "var(--wg-accent)" }
    });
    expect(css).toContain(".wg-invoice {");
    expect(css).toContain("border: 1px solid var(--wg-border, #e2e8f0);");
    expect(css).toContain(".wg-invoice h2, .wg-invoice li {");
  });

  it("drops unsafe selectors, properties, and values but keeps safe siblings", () => {
    const css = widgetStylesToCss({
      body: { display: "none" },
      ".wg-x, body": { display: "none" },
      ".wg-evil": {
        background: "url(https://evil.example/x)",
        "behavior{": "x",
        color: "red; } * { display: none",
        width: "expression(alert(1))"
      },
      ".wg-ok": { color: "tomato" }
    });
    expect(css).not.toContain("body");
    expect(css).not.toContain("url(");
    expect(css).not.toContain("expression(");
    expect(css).not.toContain("display: none");
    expect(css).toContain(".wg-ok {\n  color: tomato;\n}");
  });

  it("returns empty string when nothing survives", () => {
    expect(widgetStylesToCss({ body: { margin: "0" } })).toBe("");
  });
});

describe("descriptor styles storage", () => {
  it("register stores styles and list exposes them", () => {
    const catalog = createCatalog();
    const styles = { ".wg-badge": { color: "var(--wg-accent)" } };
    catalog.register("badge", () => el("span"), {
      description: "d",
      dataShape: "s",
      styles
    });
    expect(catalog.describe("badge")?.styles).toEqual(styles);
    expect(catalog.list().find((d) => d.kind === "badge")?.styles).toEqual(
      styles
    );
  });
});
