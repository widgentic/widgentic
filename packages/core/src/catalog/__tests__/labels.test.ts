import { describe, expect, it } from "vitest";
import { analyzeHints, createCatalog, LABEL_STYLE_RULE, renderToHtml } from "../index.js";

const catalog = createCatalog();

function html(payload: Record<string, unknown>): string {
  const result = catalog.render(payload);
  if (!result.ok) throw new Error(result.error.message);
  return renderToHtml(result.node);
}

const keysOf = (output: string, className: string): string[] =>
  [...output.matchAll(new RegExp(`class="${className}">([^<]*)<`, "g"))].map((m) => m[1] ?? "");

describe("field and column labels", () => {
  it("a card shows its labels and keeps its keys in the payload", () => {
    const payload = {
      kind: "card",
      data: { fields: { first_name: "Ada", order_total: 42 } },
      hints: { labels: { first_name: "First Name", order_total: "Order Total" } }
    };
    const output = html(payload);
    expect(keysOf(output, "wg-card-field-key")).toEqual(["First Name", "Order Total"]);
    expect(output).toContain(">Ada<");
    expect(output).toContain(">42<");
    expect(Object.keys(payload.data.fields)).toEqual(["first_name", "order_total"]);
  });

  it("a table shows its labels in the columns hints.columns selects", () => {
    const output = html({
      kind: "table",
      data: [{ first_name: "Ada", last_name: "Lovelace", id: 1 }],
      hints: { columns: ["last_name", "first_name"], labels: { first_name: "First Name", last_name: "Last Name" } }
    });
    expect(keysOf(output, "wg-table-header")).toEqual(["Last Name", "First Name"]);
    expect([...output.matchAll(/class="wg-table-cell">([^<]*)</g)].map((m) => m[1])).toEqual(["Lovelace", "Ada"]);
  });

  it("an unlabelled key, or a blank label, shows the key; no labels changes nothing", () => {
    const data = { a: 1, b: 2 };
    expect(keysOf(html({ kind: "card", data, hints: { labels: { a: "Alpha", b: "" } } }), "wg-card-field-key")).toEqual(["Alpha", "b"]);
    expect(keysOf(html({ kind: "card", data, hints: { labels: { a: "  ", b: 3 } } }), "wg-card-field-key")).toEqual(["a", "b"]);
    const plain = html({ kind: "card", data });
    expect(html({ kind: "card", data, hints: {} })).toBe(plain);
    expect(html({ kind: "card", data, hints: { labels: {} } })).toBe(plain);
    expect(html({ kind: "table", data: [data], hints: { labels: "nope" } })).toBe(html({ kind: "table", data: [data] }));
  });

  it("a label is escaped text, never markup", () => {
    const output = html({ kind: "card", data: { total: 1 }, hints: { labels: { total: "<b>Total</b>" } } });
    expect(output).toContain("&lt;b&gt;Total&lt;/b&gt;");
    expect(output).not.toContain("<b>");
  });

  it("other hints stay keyed by data", () => {
    const output = html({
      kind: "card",
      data: { fields: { unit_price: 9.99 } },
      hints: { labels: { unit_price: "Unit Price" }, fieldFormat: { unit_price: "${value}" } }
    });
    expect(keysOf(output, "wg-card-field-key")).toEqual(["Unit Price"]);
    expect(output).toContain(">$9.99<");
  });

  it("a labelled image takes its label as alt text", () => {
    const output = html({
      kind: "table",
      data: [{ avatar_url: "https://cdn.example/a/ada.png" }],
      hints: { labels: { avatar_url: "Avatar" } }
    });
    expect(output).toContain('alt="Avatar"');
    expect(html({ kind: "card", data: { fields: { photo: "https://cdn.example/p.jpg" } } })).toContain('alt="photo"');
  });

  it("the card and table descriptors carry the steering rule", () => {
    for (const kind of ["card", "table"]) {
      expect(catalog.describe(kind)?.hints?.labels).toContain(LABEL_STYLE_RULE);
    }
    expect(LABEL_STYLE_RULE).toContain("Title Case");
  });
});

describe("label hint analysis", () => {
  const card = catalog.describe("card");
  const table = catalog.describe("table");

  it("reports labels that match no field, and labels that are not non-empty strings", () => {
    const data = { fields: { first_name: "Ada" } };
    const found = analyzeHints("card", data, { labels: { first_name: "First Name", last_name: "Last Name", age: 7 } }, card);
    expect(found.map((d) => [d.hint, d.code])).toEqual([
      ["labels.last_name", "NO_MATCH"],
      ["labels.age", "NO_MATCH"]
    ]);
    for (const label of ["", "  ", 1, null]) {
      expect(analyzeHints("card", data, { labels: { first_name: label } }, card).map((d) => [d.hint, d.code])).toEqual([
        ["labels.first_name", "INVALID_VALUE"]
      ]);
    }
    expect(analyzeHints("card", data, { labels: "First Name" }, card).map((d) => [d.hint, d.code])).toEqual([["labels", "INVALID_VALUE"]]);
  });

  it("checks table labels against columns, and coherent labels are silent", () => {
    const rows = [{ total: 1 }];
    expect(analyzeHints("table", rows, { labels: { totl: "Total" } }, table).map((d) => [d.hint, d.code])).toEqual([["labels.totl", "NO_MATCH"]]);
    expect(analyzeHints("table", rows, { labels: { total: "Total" } }, table)).toEqual([]);
  });
});
