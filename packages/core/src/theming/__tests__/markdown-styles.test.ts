// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { baseStylesheet, themeToCss } from "../index.js";
import { compileTemplate } from "../../templates/index.js";
import { renderToHtml } from "../../catalog/index.js";

function mount(notes: string, theme?: Record<string, string>): void {
  const themeCss = theme === undefined ? "" : themeToCss(theme);
  document.head.innerHTML = `<style>${baseStylesheet}\n${themeCss}</style>`;
  document.body.innerHTML = renderToHtml(compileTemplate({ bind: "notes", markdown: true })({ kind: "x", data: { notes } }));
}

describe("Markdown output follows the theme", () => {
  it("links take the theme's accent", () => {
    mount("See [docs](https://example.com).", { accent: "rgb(1, 2, 3)" });
    expect(getComputedStyle(document.querySelector(".wg-md a") as Element).color).toBe("rgb(1, 2, 3)");
  });

  it("block spacing follows the spacing token and the last block sits flush", () => {
    mount("one\n\ntwo", { spacing: "7px" });
    const [first, last] = Array.from(document.querySelectorAll(".wg-md p"));
    expect(getComputedStyle(first as Element).marginBottom).toBe("7px");
    expect(getComputedStyle(last as Element).marginBottom).toBe("0px");
  });
});
