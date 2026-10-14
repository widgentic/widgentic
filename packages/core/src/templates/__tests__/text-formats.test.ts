import { describe, it, expect } from "vitest";
import { compileTemplate, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import {
  JOIN_SEPARATOR_MAX,
  PLURAL_CATEGORIES,
  PLURAL_FORM_MAX,
  TRUNCATE_ELLIPSIS_MAX,
  TRUNCATE_LENGTH_MAX,
  formatBoundValue,
  renderToHtml
} from "../../catalog/index.js";

function render(template: WidgetTemplate, data: unknown): string {
  return renderToHtml(compileTemplate(template)({ kind: "x", data }));
}

const span = (bind: string, format: unknown): WidgetTemplate =>
  ({ tag: "span", children: [{ bind, format }] }) as WidgetTemplate;

describe("text formats", () => {
  it("render on a text bind and an attribute alike", () => {
    const template = {
      tag: "span",
      attrs: { title: { bind: "tags", format: { type: "join" } } },
      children: [{ bind: "tags", format: { type: "count" } }]
    } as WidgetTemplate;
    expect(render(template, { tags: ["red", "green"] })).toBe('<span title="red, green">2</span>');
  });

  it("count: an array's length, grouped; anything else is its plain text", () => {
    expect(render(span("items", { type: "count" }), { items: Array.from({ length: 1234 }, () => 0) })).toBe(
      "<span>1,234</span>"
    );
    expect(render(span("items", { type: "count" }), { items: "n/a" })).toBe("<span>n/a</span>");
    expect(render(span("items", { type: "count" }), { items: [] })).toBe("<span>0</span>");
    expect(formatBoundValue(Array.from({ length: 1234 }, () => 0), { type: "count", locale: "de-DE" })).toBe("1.234");
  });

  it("join: author separators, sparse items skipped", () => {
    expect(
      render(span("tags", { type: "join", separator: ", ", last: " and " }), { tags: ["red", "", null, "green", "blue"] })
    ).toBe("<span>red, green and blue</span>");
    expect(formatBoundValue(["red", "green"], { type: "join", last: " and " })).toBe("red and green");
    expect(formatBoundValue(["red"], { type: "join", last: " and " })).toBe("red");
    expect(formatBoundValue([1, true, 2.5], { type: "join", separator: " · " })).toBe("1 · true · 2.5");
    expect(formatBoundValue("solo", { type: "join" })).toBe("solo");
  });

  it("join: a field is read in each item's scope", () => {
    expect(render(span("people", { type: "join", field: "name" }), { people: [{ name: "Ada" }, { name: "Lin" }] })).toBe(
      "<span>Ada, Lin</span>"
    );
    expect(
      formatBoundValue([{ owner: { name: "Ada" } }, { owner: {} }, "Lin"], { type: "join", field: "owner.name" })
    ).toBe("Ada, Lin");
  });

  it("truncate: code points kept, trailing space trimmed, the ellipsis appended", () => {
    const template = span("title", { type: "truncate", length: 10 });
    expect(render(template, { title: "Quarterly revenue summary" })).toBe("<span>Quarterly…</span>");
    expect(render(template, { title: "Short" })).toBe("<span>Short</span>");
    expect(formatBoundValue("👍👍👍", { type: "truncate", length: 2, ellipsis: "..." })).toBe("👍👍...");
    expect(formatBoundValue("exactly10!", { type: "truncate", length: 10 })).toBe("exactly10!");
    expect(formatBoundValue("abcdef", { type: "truncate", length: 3, ellipsis: "" })).toBe("abc");
  });

  it("pluralize: zero, one and other forms with the grouped count", () => {
    const template = span("n", {
      type: "pluralize",
      forms: { zero: "No items", one: "{count} item", other: "{count} items" }
    });
    const outputs = [0, 1, 1200, "2", ["a", "b", "c"], "lots"].map((n) => render(template, { n }));
    expect(outputs).toEqual([
      "<span>No items</span>",
      "<span>1 item</span>",
      "<span>1,200 items</span>",
      "<span>2 items</span>",
      "<span>3 items</span>",
      "<span>lots</span>"
    ]);
    // Without a zero form, English reads 0 as "other".
    expect(formatBoundValue(0, { type: "pluralize", forms: { one: "{count} item", other: "{count} items" } })).toBe(
      "0 items"
    );
  });

  it("pluralize: the locale's rules choose few and many", () => {
    const spec = {
      type: "pluralize",
      locale: "pl",
      forms: { one: "{count} plik", few: "{count} pliki", many: "{count} plików", other: "{count} pliku" }
    };
    expect([1, 3, 5, 22].map((n) => formatBoundValue(n, spec))).toEqual(["1 plik", "3 pliki", "5 plików", "22 pliki"]);
    // A category without a form falls back to other.
    expect(formatBoundValue(3, { ...spec, forms: { one: "{count} plik", other: "{count} pliku" } })).toBe("3 pliku");
  });

  it("is total: malformed specs and hostile values render plain text", () => {
    for (const spec of [
      { type: "truncate" },
      { type: "truncate", length: 0 },
      { type: "pluralize", forms: { one: "x" } },
      { type: "pluralize" }
    ]) {
      expect(formatBoundValue("value", spec), JSON.stringify(spec)).toBe("value");
    }
    expect(formatBoundValue(Number.NaN, { type: "pluralize", forms: { other: "{count}" } })).toBe("NaN");
  });
});

describe("text format validation", () => {
  const attr = (format: unknown) => validateTemplate({ tag: "span", attrs: { title: { bind: "a", format } } });
  const text = (format: unknown) => validateTemplate({ tag: "span", children: [{ bind: "a", format }] });

  it("accepts the documented specs", () => {
    for (const format of [
      { type: "count" },
      { type: "count", locale: "es-CO" },
      { type: "join" },
      { type: "join", separator: " · ", last: " and ", field: "owner.name" },
      { type: "join", separator: "x".repeat(JOIN_SEPARATOR_MAX) },
      { type: "truncate", length: 1 },
      { type: "truncate", length: TRUNCATE_LENGTH_MAX, ellipsis: ".".repeat(TRUNCATE_ELLIPSIS_MAX) },
      { type: "pluralize", forms: { other: "items" } },
      { type: "pluralize", locale: "pl", forms: Object.fromEntries(PLURAL_CATEGORIES.map((c) => [c, c])) }
    ]) {
      expect(attr(format).ok, JSON.stringify(format)).toBe(true);
      expect(text(format).ok, JSON.stringify(format)).toBe(true);
    }
  });

  it("locates malformed text formats and names the field", () => {
    const cases: [unknown, RegExp][] = [
      [{ type: "truncate", length: 0 }, /format\.length/],
      [{ type: "truncate", length: 12.5 }, /format\.length/],
      [{ type: "truncate", length: TRUNCATE_LENGTH_MAX + 1 }, /format\.length/],
      [{ type: "truncate" }, /format\.length/],
      [{ type: "truncate", length: 5, ellipsis: ".".repeat(TRUNCATE_ELLIPSIS_MAX + 1) }, /format\.ellipsis/],
      [{ type: "join", field: "$root.name" }, /format\.field/],
      [{ type: "join", field: "a..b" }, /format\.field/],
      [{ type: "join", separator: 3 }, /format\.separator/],
      [{ type: "join", last: "x".repeat(JOIN_SEPARATOR_MAX + 1) }, /format\.last/],
      [{ type: "pluralize", forms: { one: "item" } }, /'other'/],
      [{ type: "pluralize", forms: { single: "item", other: "items" } }, /plural categories/],
      [{ type: "pluralize", forms: { other: 3 } }, /format\.forms\.other/],
      [{ type: "pluralize", forms: { other: "x".repeat(PLURAL_FORM_MAX + 1) } }, /format\.forms\.other/],
      [{ type: "pluralize", forms: "items" }, /format\.forms/],
      [{ type: "count", locale: "not a locale" }, /format\.locale/]
    ];
    for (const [format, message] of cases) {
      const result = text(format);
      expect(result.ok, JSON.stringify(format)).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
        expect(result.error.path).toBe("children.0");
        expect(result.error.message).toMatch(message);
      }
    }
  });
});
