import { describe, it, expect } from "vitest";
import { validateTemplate } from "../index.js";
import type { TemplateNode } from "../index.js";

describe("validateTemplate", () => {
  it("accepts a template using all five node forms", () => {
    const template = {
      tag: "div",
      attrs: { class: "invoice", title: { bind: "$meta.title" } },
      children: [
        "Customer: ",
        { bind: "customer.name" },
        {
          when: "paid",
          template: { tag: "span", children: ["paid"] },
          else: { tag: "span", children: ["due"] }
        },
        {
          each: "lines",
          template: { tag: "li", children: [{ bind: "amount" }] },
          empty: "no lines"
        }
      ]
    };
    expect(validateTemplate(template)).toEqual({ ok: true, template });
  });

  it("locates a malformed bind node", () => {
    const result = validateTemplate({
      tag: "div",
      children: [{ bind: 42 }]
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
      expect(result.error.path).toBe("children.0");
    }
  });

  it("rejects invalid path syntax", () => {
    for (const bad of ["", ".leading", "trailing.", "double..dot", "$meta."]) {
      const result = validateTemplate({ bind: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_PATH");
    }
  });

  it("rejects event-handler attributes", () => {
    const result = validateTemplate({
      tag: "button",
      attrs: { onclick: "x()" }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN_ATTRIBUTE");
      expect(result.error.path).toBe("attrs.onclick");
    }
  });

  it("rejects malformed attr values and missing each template", () => {
    const badAttr = validateTemplate({ tag: "a", attrs: { href: 42 } });
    expect(!badAttr.ok && badAttr.error.code).toBe("INVALID_TEMPLATE_NODE");

    const noTemplate = validateTemplate({ each: "items" });
    expect(!noTemplate.ok && noTemplate.error.code).toBe(
      "INVALID_TEMPLATE_NODE"
    );

    const badChildren = validateTemplate({ tag: "div", children: "x" });
    expect(!badChildren.ok && badChildren.error.code).toBe(
      "INVALID_TEMPLATE_NODE"
    );
  });

  it("rejects unknown node forms and non-node values", () => {
    const unknown = validateTemplate({ mystery: true });
    expect(!unknown.ok && unknown.error.code).toBe("INVALID_TEMPLATE_NODE");

    const number = validateTemplate(42);
    expect(!number.ok && number.error.code).toBe("INVALID_TEMPLATE_NODE");
  });

  it("rejects nesting deeper than the cap", () => {
    let node: TemplateNode = "leaf";
    for (let i = 0; i < 70; i++) {
      node = { tag: "div", children: [node] };
    }
    const result = validateTemplate(node);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TEMPLATE_TOO_DEEP");
  });
});

describe("attr transform validation", () => {
  function attr(value: unknown) {
    return validateTemplate({ tag: "span", attrs: { class: value } });
  }

  it("accepts the documented transform forms", () => {
    expect(attr({ bind: "s", map: { a: "x" } }).ok).toBe(true);
    expect(attr({ bind: "s", map: { a: "x" }, default: "d" }).ok).toBe(true);
    expect(attr({ bind: "s", prefix: "mailto:" }).ok).toBe(true);
  });

  it("locates malformed transforms with dotted paths", () => {
    for (const bad of [
      { bind: "s", map: "nope" },
      { bind: "s", map: { a: 1 } },
      { bind: "s", prefix: 42 },
      { bind: "s", map: { a: "x" }, prefix: "y" },
      { bind: "s", default: "d" } // default requires map
    ]) {
      const result = attr(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
        expect(result.error.path).toBe("attrs.class");
      }
    }
  });

  it("a transform without bind is outside the forms", () => {
    const result = attr({ map: { a: "x" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("{ bind, map, default? }");
  });
});
