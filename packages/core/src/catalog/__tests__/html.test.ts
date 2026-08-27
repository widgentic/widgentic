import { describe, it, expect } from "vitest";
import { createCatalog, renderToHtml, el } from "../index.js";

describe("renderToHtml", () => {
  it("escapes text content from payload data", () => {
    const result = createCatalog().render({
      kind: "card",
      data: { title: "<script>alert(1)</script>" }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = renderToHtml(result.node);
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>");
  });

  it("escapes attribute values", () => {
    const output = renderToHtml(
      el("div", { title: 'he said "hi" & <left>' })
    );
    expect(output).toBe(
      '<div title="he said &quot;hi&quot; &amp; &lt;left&gt;"></div>'
    );
  });

  it("escapes ampersands and quotes in text", () => {
    expect(renderToHtml("a & 'b' < c")).toBe("a &amp; &#39;b&#39; &lt; c");
  });

  it("serializes nested trees", () => {
    const output = renderToHtml(
      el("div", { class: "outer" }, [el("span", undefined, ["x"]), "y"])
    );
    expect(output).toBe('<div class="outer"><span>x</span>y</div>');
  });

  it("handles void elements without closing tags", () => {
    expect(renderToHtml(el("br"))).toBe("<br>");
  });

  it("drops invalid tag and attribute names defensively", () => {
    expect(renderToHtml({ tag: "di v" })).toBe("");
    expect(
      renderToHtml({ tag: "div", attrs: { 'on"load': "x", ok: "1" } })
    ).toBe('<div ok="1"></div>');
  });
});
