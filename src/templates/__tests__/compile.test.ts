import { describe, it, expect } from "vitest";
import { compileTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { renderToHtml } from "../../catalog/index.js";

function render(template: WidgetTemplate, data: unknown, meta?: Record<string, unknown>): string {
  const renderer = compileTemplate(template);
  const payload = meta
    ? { kind: "x", data, meta }
    : { kind: "x", data };
  return renderToHtml(renderer(payload));
}

describe("compileTemplate interpretation", () => {
  it("renders bind values as text", () => {
    const html = render(
      { tag: "span", children: [{ bind: "customer.name" }] },
      { customer: { name: "Ada" } }
    );
    expect(html).toBe("<span>Ada</span>");
  });

  it("repeats each with the item as scope", () => {
    const html = render(
      {
        tag: "ul",
        children: [
          { each: "lines", template: { tag: "li", children: [{ bind: "amount" }] } }
        ]
      },
      { lines: [{ amount: 1 }, { amount: 2 }] }
    );
    expect(html).toBe("<ul><li>1</li><li>2</li></ul>");
  });

  it("renders the empty fallback for empty arrays", () => {
    const html = render(
      { tag: "ul", children: [{ each: "lines", template: { tag: "li" }, empty: "no lines" }] },
      { lines: [] }
    );
    expect(html).toBe("<ul>no lines</ul>");
  });

  it("selects when/else branches", () => {
    const template: WidgetTemplate = {
      when: "paid",
      template: { tag: "b", children: ["paid"] },
      else: { tag: "i", children: ["due"] }
    };
    expect(render(template, { paid: true })).toBe("<b>paid</b>");
    expect(render(template, { paid: false })).toBe("<i>due</i>");
  });

  it("resolves bound attribute values", () => {
    const html = render(
      { tag: "a", attrs: { title: { bind: "label" } } },
      { label: "Docs" }
    );
    expect(html).toBe('<a title="Docs"></a>');
  });

  it("traverses dot paths across objects and array indices", () => {
    const html = render(
      { bind: "items.0.name" },
      { items: [{ name: "first" }] }
    );
    expect(html).toBe("first");
  });

  it("resolves '.' to the each scope", () => {
    const html = render(
      { tag: "p", children: [{ each: "tags", template: { bind: "." } }] },
      { tags: ["a", "b"] }
    );
    expect(html).toBe("<p>ab</p>");
  });

  it("resolves the $meta prefix", () => {
    const html = render({ bind: "$meta.title" }, {}, { title: "T" });
    expect(html).toBe("T");
  });

  it("treats missing paths as blanks, empty lists, and falsy", () => {
    const html = render(
      {
        tag: "div",
        children: [
          { bind: "nope.deep" },
          { each: "absent", template: { tag: "li" } },
          { when: "missing", template: "yes", else: "no" }
        ]
      },
      {}
    );
    expect(html).toBe("<div>no</div>");
  });

  it("never throws on garbage data", () => {
    const template: WidgetTemplate = {
      tag: "div",
      children: [{ bind: "a.b" }, { each: "a", template: { bind: "." } }]
    };
    for (const data of [null, 42, "str", [], { a: 7 }]) {
      expect(() => render(template, data)).not.toThrow();
    }
  });

  it("wraps multi-node roots in a wg-template container", () => {
    const html = render(
      { each: "tags", template: { tag: "li", children: [{ bind: "." }] } },
      { tags: ["a", "b"] }
    );
    expect(html).toBe('<div class="wg-template"><li>a</li><li>b</li></div>');
  });
});
