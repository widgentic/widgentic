import { describe, it, expect } from "vitest";
import { registerTemplate, InvalidTemplateError } from "../index.js";
import { createCatalog, renderToHtml, DuplicateKindError } from "../../catalog/index.js";

const invoiceTemplate = {
  tag: "div",
  attrs: { class: "invoice" },
  children: [
    { tag: "h2", children: [{ bind: "$meta.title" }] },
    {
      each: "lines",
      template: { tag: "li", children: [{ bind: "item" }, ": ", { bind: "amount" }] }
    }
  ]
};

describe("registerTemplate", () => {
  it("registers a kind that renders through the catalog", () => {
    const catalog = createCatalog();
    registerTemplate(catalog, "invoice", invoiceTemplate);
    expect(catalog.has("invoice")).toBe(true);

    const result = catalog.render({
      kind: "invoice",
      data: { lines: [{ item: "widgets", amount: 3 }] },
      meta: { title: "Invoice #1" }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = renderToHtml(result.node);
    expect(output).toContain("Invoice #1");
    expect(output).toContain("<li>widgets: 3</li>");
  });

  it("throws DuplicateKindError on duplicate kinds", () => {
    const catalog = createCatalog();
    registerTemplate(catalog, "invoice", invoiceTemplate);
    expect(() => registerTemplate(catalog, "invoice", invoiceTemplate)).toThrow(
      DuplicateKindError
    );
  });

  it("throws InvalidTemplateError carrying the structured error", () => {
    const catalog = createCatalog();
    let caught: unknown;
    try {
      registerTemplate(catalog, "bad", { bind: 42 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidTemplateError);
    const invalid = caught as InvalidTemplateError;
    expect(invalid.templateError.code).toBe("INVALID_TEMPLATE_NODE");
    expect(invalid.message).toContain("bad");
    expect(catalog.has("bad")).toBe(false);
  });
});
