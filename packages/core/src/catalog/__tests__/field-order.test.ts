import { describe, expect, it } from "vitest";
import { analyzeHints, createCatalog, FIELD_ORDER_RULE, renderToHtml } from "../index.js";

const catalog = createCatalog();

function html(payload: Record<string, unknown>): string {
  const result = catalog.render(payload);
  if (!result.ok) throw new Error(result.error.message);
  return renderToHtml(result.node);
}

const keysOf = (output: string): string[] =>
  [...output.matchAll(/class="wg-card-field-key">([^<]*)</g)].map((m) => m[1] ?? "");

describe("card field order and selection", () => {
  it("renders the hinted fields in the hinted order, chrome untouched", () => {
    const output = html({
      kind: "card",
      data: {
        title: "Olivia",
        fields: { avatar: "x", company: "Northwind", email: "o@example.com", role: "Designer" }
      },
      hints: { fields: ["role", "company", "email"] }
    });
    expect(keysOf(output)).toEqual(["role", "company", "email"]);
    expect(output).toContain('class="wg-card-title">Olivia<');
    expect(output).not.toContain(">avatar<");
  });

  it("orders top-level entries too, never title or subtitle", () => {
    const output = html({
      kind: "card",
      data: { title: "T", subtitle: "S", b: 2, a: 1 },
      hints: { fields: ["a", "title", "b"] }
    });
    expect(keysOf(output)).toEqual(["a", "b"]);
    expect(output).toContain('class="wg-card-subtitle">S<');
  });

  it("skips missing keys and renders a repeated key once", () => {
    expect(keysOf(html({ kind: "card", data: { a: 1, b: 2 }, hints: { fields: ["b", "zzz", "b", "a"] } }))).toEqual([
      "b",
      "a"
    ]);
    expect(keysOf(html({ kind: "card", data: { a: 1 }, hints: { fields: [] } }))).toEqual([]);
  });

  it("falls back to data order for a malformed value, byte-identical to no hint", () => {
    const plain = html({ kind: "card", data: { b: 2, a: 1 } });
    expect(keysOf(plain)).toEqual(["b", "a"]);
    for (const fields of ["a", ["a", 3], { a: 0 }, null]) {
      expect(html({ kind: "card", data: { b: 2, a: 1 }, hints: { fields } }), JSON.stringify(fields)).toBe(plain);
    }
  });

  it("leaves the other hints addressing keys", () => {
    const output = html({
      kind: "card",
      data: { fields: { unit_price: 9.99, sku: "A1" } },
      hints: { fields: ["unit_price", "sku"], labels: { unit_price: "Unit Price" }, fieldFormat: { unit_price: "${value}" } }
    });
    expect(keysOf(output)).toEqual(["Unit Price", "sku"]);
    expect(output).toContain(">$9.99<");
    expect(output).toContain(">A1<");
  });

  it("documents fields and columns with the field-order rule", () => {
    expect(catalog.describe("card")?.hints?.fields).toContain(FIELD_ORDER_RULE);
    expect(catalog.describe("table")?.hints?.columns).toContain(FIELD_ORDER_RULE);
    expect(catalog.describe("card")?.dataShape).toContain("hints.fields");
  });
});

describe("field order hint analysis", () => {
  const card = catalog.describe("card");

  it("reports entries that match no field and a malformed value", () => {
    const data = { fields: { price: 1, stock: 2 } };
    expect(analyzeHints("card", data, { fields: ["stock", "cost"] }, card)).toEqual([
      { hint: "fields.cost", code: "NO_MATCH", message: "field 'cost' matches no field in data" }
    ]);
    const malformed = analyzeHints("card", data, { fields: "stock" }, card);
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toMatchObject({ hint: "fields", code: "INVALID_VALUE" });
  });

  it("is silent for coherent fields", () => {
    expect(analyzeHints("card", { fields: { price: 1, stock: 2 } }, { fields: ["stock", "price"] }, card)).toEqual([]);
  });
});
