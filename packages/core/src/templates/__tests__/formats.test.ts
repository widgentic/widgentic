import { describe, it, expect } from "vitest";
import { compileTemplate, validateTemplate } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import type { CurrencyDisplay } from "../../catalog/index.js";
import { compileFormat, formatBoundValue, renderToHtml } from "../../catalog/index.js";

function render(template: WidgetTemplate, data: unknown): string {
  return renderToHtml(compileTemplate(template)({ kind: "x", data }));
}

/** The ticker response that motivated the transform. */
const TICKER = {
  ask: "3206.9905920000",
  bid: "3179.4300000000",
  book: "usdc_cop",
  date: "2026-09-01T02:04:47.257871358"
};

describe("bind formats", () => {
  it("currency: a numeric string renders as money and the payload keeps its value", () => {
    const payload = { kind: "x", data: TICKER };
    const node = compileTemplate({
      tag: "span",
      children: [{ bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } }]
    })(payload);
    expect(renderToHtml(node)).toBe("<span>$3,207</span>");
    // the transform is presentation only — data is untouched
    expect(payload.data.ask).toBe("3206.9905920000");
  });

  it("currency: currencyDisplay picks the disambiguated form", () => {
    const template = (currencyDisplay: CurrencyDisplay): WidgetTemplate => ({
      tag: "span",
      children: [
        { bind: "ask", format: { type: "currency", currency: "COP", decimals: 0, currencyDisplay } }
      ]
    });
    // Intl separates a currency CODE from the number with a NO-BREAK
    // SPACE, which the engine normalizes to an ordinary space so every
    // ICU build agrees; the narrow symbol is prefixed with no space at all.
    expect(render(template("symbol"), TICKER)).toBe("<span>COP 3,207</span>");
    expect(render(template("code"), TICKER)).toBe("<span>COP 3,207</span>");
    expect(render(template("narrowSymbol"), TICKER)).toBe("<span>$3,207</span>");
  });

  it("date: an ISO timestamp renders through the token pattern", () => {
    expect(
      render(
        { tag: "span", children: [{ bind: "date", format: { type: "date", pattern: "dd-MM-yyyy HH:mm" } }] },
        TICKER
      )
    ).toBe("<span>01-09-2026 02:04</span>");
  });

  it("date: an offset is resolved to UTC, and a date-only value starts at midnight", () => {
    const template: WidgetTemplate = {
      tag: "span",
      children: [{ bind: "t", format: { type: "date", pattern: "yyyy-MM-dd HH:mm:ss" } }]
    };
    expect(render(template, { t: "2026-09-01T02:04:47+05:00" })).toBe(
      "<span>2026-08-31 21:04:47</span>"
    );
    expect(render(template, { t: "2026-09-01" })).toBe("<span>2026-09-01 00:00:00</span>");
    expect(render(template, { t: 1756692287000 })).toBe("<span>2025-09-01 02:04:47</span>");
  });

  it("number: bounded decimals and grouping", () => {
    expect(
      render({ tag: "span", children: [{ bind: "ask", format: { type: "number", decimals: 2 } }] }, TICKER)
    ).toBe("<span>3,206.99</span>");
  });

  it("unparseable values render raw — a format never hides data", () => {
    expect(
      render(
        { tag: "span", children: [{ bind: "v", format: { type: "currency", currency: "COP" } }] },
        { v: "n/a" }
      )
    ).toBe("<span>n/a</span>");
    expect(
      render(
        { tag: "span", children: [{ bind: "v", format: { type: "date", pattern: "dd-MM-yyyy" } }] },
        { v: "soon" }
      )
    ).toBe("<span>soon</span>");
    // a missing path stays empty rather than becoming a formatted zero
    expect(
      render(
        { tag: "span", children: [{ bind: "nope", format: { type: "number", decimals: 2 } }] },
        {}
      )
    ).toBe("<span></span>");
  });

  it("formats attr values, and the URL guard still runs after", () => {
    const node = compileTemplate({
      tag: "span",
      attrs: { title: { bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } } }
    })({ kind: "x", data: TICKER });
    expect((node as { attrs?: { title?: string } }).attrs?.title).toBe("$3,207");

    // A format emits TEXT and can never introduce a scheme, so on a URL
    // attribute its output is at worst a relative reference — which the
    // guard accepts, exactly as it does an author's literal. Scheme
    // building stays `prefix`, and the two are mutually exclusive.
    const anchor = compileTemplate({
      tag: "a",
      attrs: { href: { bind: "ask", format: { type: "number", decimals: 0 } } }
    })({ kind: "x", data: TICKER });
    expect((anchor as { attrs?: { href?: string } }).attrs?.href).toBe("3,207");

    // a hostile value cannot survive a format as a scheme
    const hostile = compileTemplate({
      tag: "a",
      attrs: { href: { bind: "v", format: { type: "number", decimals: 0 } } }
    })({ kind: "x", data: { v: "javascript:alert(1)" } });
    expect((hostile as { attrs?: { href?: string } }).attrs?.href).toBeUndefined();
  });

  it("is deterministic: two renders of the same data are byte-equal", () => {
    const template: WidgetTemplate = {
      tag: "div",
      children: [
        { bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } },
        { bind: "date", format: { type: "date", pattern: "dd-MM-yyyy HH:mm" } }
      ]
    };
    expect(render(template, TICKER)).toBe(render(template, TICKER));
  });

  it("formats inside an each scope", () => {
    expect(
      render(
        {
          tag: "ul",
          children: [
            {
              each: ".",
              template: {
                tag: "li",
                children: [{ bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } }]
              }
            }
          ]
        },
        [TICKER, { ask: "1000" }]
      )
    ).toBe("<ul><li>$3,207</li><li>$1,000</li></ul>");
  });
});

describe("format validation", () => {
  const attr = (value: unknown) => validateTemplate({ tag: "span", attrs: { class: value } });
  const text = (node: unknown) => validateTemplate({ tag: "span", children: [node] });

  it("accepts the documented specs", () => {
    expect(attr({ bind: "a", format: { type: "number" } }).ok).toBe(true);
    expect(attr({ bind: "a", format: { type: "number", decimals: 8, locale: "es-CO" } }).ok).toBe(true);
    expect(
      attr({ bind: "a", format: { type: "currency", currency: "COP", decimals: 0, currencyDisplay: "code" } }).ok
    ).toBe(true);
    expect(attr({ bind: "a", format: { type: "date", pattern: "dd-MM-yyyy HH:mm:ss" } }).ok).toBe(true);
    expect(text({ bind: "a", format: { type: "currency", currency: "USD" } }).ok).toBe(true);
  });

  it("locates malformed formats with dotted paths", () => {
    for (const bad of [
      { bind: "a", format: { type: "money" } },
      { bind: "a", format: { type: "currency", currency: "cop" } },
      { bind: "a", format: { type: "currency" } },
      { bind: "a", format: { type: "currency", currency: "COP", currencyDisplay: "emoji" } },
      { bind: "a", format: { type: "date", pattern: "<script>" } },
      { bind: "a", format: { type: "date", pattern: "" } },
      { bind: "a", format: { type: "date" } },
      { bind: "a", format: { type: "number", decimals: 9 } },
      { bind: "a", format: { type: "number", decimals: -1 } },
      { bind: "a", format: { type: "number", decimals: 1.5 } },
      { bind: "a", format: { type: "number", locale: "not a locale" } },
      { bind: "a", format: "currency" },
      { bind: "a", format: { type: "number" }, prefix: "x" },
      { bind: "a", format: { type: "number" }, map: { a: "b" } }
    ]) {
      const result = attr(bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
        expect(result.error.path).toBe("attrs.class");
      }
    }
  });

  it("rejects a date pattern longer than the bound", () => {
    const result = attr({ bind: "a", format: { type: "date", pattern: "yyyy-MM-dd ".repeat(6) } });
    expect(result.ok).toBe(false);
  });

  it("locates a malformed format on a text bind", () => {
    const result = text({ bind: "a", format: { type: "date", pattern: "week yyyy" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.path).toBe("children.0");
  });

  it("a text bind's map selects an authored label; prefix stays inert", () => {
    const labelled = { tag: "span", children: [{ bind: "s", map: { active: "Active", "do-not-contact": "Do not contact" }, default: "Unknown" }] } as WidgetTemplate;
    expect(render(labelled, { s: "do-not-contact" })).toBe("<span>Do not contact</span>");
    expect(render(labelled, { s: "paused" })).toBe("<span>Unknown</span>");
    const noDefault = { tag: "span", children: [{ bind: "s", map: { a: "A" } }] } as WidgetTemplate;
    expect(render(noDefault, { s: "zzz" })).toBe("<span></span>");
    // `prefix` is attribute-only: accepted (nothing stored is refused) and ignored here.
    const prefixed = { bind: "s", prefix: "mailto:" };
    expect(text(prefixed).ok).toBe(true);
    expect(render({ tag: "span", children: [prefixed] } as unknown as WidgetTemplate, { s: "a" })).toBe("<span>a</span>");
    // both stay meaningful on an ATTR value
    expect(attr({ bind: "s", map: { a: "X" } }).ok).toBe(true);
    expect(attr({ bind: "s", prefix: "mailto:" }).ok).toBe(true);
  });

  it("a text bind carries map OR format, and a malformed map is located", () => {
    for (const bad of [
      { bind: "s", map: { a: "A" }, format: { type: "number" } },
      { bind: "s", map: { a: 1 } },
      { bind: "s", map: { a: "A" }, default: 3 },
      { bind: "s", default: "d" }
    ]) {
      const result = text(bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
      if (!result.ok) expect(result.error.path).toBe("children.0");
    }
  });

  it("refuses a date pattern that would render a constant", () => {
    for (const pattern of ["d/M/yy", "--", "MMM", "yyyy-MM-dd Z"]) {
      const result = text({ bind: "a", format: { type: "date", pattern } });
      expect(result.ok, pattern).toBe(false);
      if (!result.ok) expect(result.error.path).toBe("children.0");
    }
  });

  it("refuses a locale the runtime does not know", () => {
    expect(text({ bind: "a", format: { type: "number", locale: "abcd" } }).ok).toBe(false);
    expect(text({ bind: "a", format: { type: "number", locale: "fr-FR" } }).ok).toBe(true);
  });

  it("rejects format without bind", () => {
    const result = text({ format: { type: "number" } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
      expect(result.error.path).toBe("children.0");
    }
    expect(attr({ format: { type: "number" } }).ok).toBe(false);
  });
});

describe("format engine rules", () => {
  it("reads epoch numbers by magnitude: seconds below 1e11, milliseconds above", () => {
    const spec = { type: "date", pattern: "yyyy-MM-dd" };
    const seconds = Date.UTC(2026, 8, 1, 2, 4, 47) / 1000;
    expect(formatBoundValue(seconds, spec)).toBe("2026-09-01");
    expect(formatBoundValue(seconds * 1000, spec)).toBe("2026-09-01");
  });

  it("emits ordinary spaces where a locale would use no-break variants", () => {
    const out = formatBoundValue(3206.99, { type: "currency", currency: "EUR", locale: "fr-FR", decimals: 2 });
    expect(out).not.toMatch(/[\u00A0\u202F\u2009]/);
    expect(out).toContain("€");
  });

  it("builds one formatter per spec object", () => {
    const spec = { type: "currency", currency: "COP", decimals: 0 };
    expect(compileFormat(spec)).toBe(compileFormat(spec));
  });
});

describe("formatBoundValue is total", () => {
  it("returns plain text for every malformed spec", () => {
    for (const spec of [undefined, null, "currency", 42, {}, { type: "nope" }, []]) {
      expect(formatBoundValue("3206.99", spec)).toBe("3206.99");
    }
  });

  it("never throws on hostile values", () => {
    for (const value of [Number.NaN, Infinity, -0, {}, [], true, null, undefined, 10n]) {
      expect(() =>
        formatBoundValue(value, { type: "currency", currency: "COP", decimals: 2 })
      ).not.toThrow();
    }
  });
});
