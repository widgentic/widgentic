import { describe, it, expect } from "vitest";
import { analyzeHints, createCatalog, renderToHtml } from "../index.js";
import { BUILTIN_DESCRIPTORS } from "../descriptors.js";

function html(payload: unknown): string {
  const result = createCatalog().render(payload);
  if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
  return renderToHtml(result.node);
}

describe("meta chrome on table and tree", () => {
  it("table meta renders as a caption with title and subtitle", () => {
    const out = html({
      kind: "table",
      data: [{ a: 1 }],
      meta: { title: "Holdings", subtitle: "as of Q3" }
    });
    expect(out).toContain('<caption class="wg-table-caption">');
    expect(out).toContain('<span class="wg-table-title">Holdings</span>');
    expect(out).toContain('<span class="wg-table-subtitle">as of Q3</span>');
    // caption is the table's first child per the HTML content model
    expect(out.indexOf("<caption")).toBeLessThan(out.indexOf("<thead"));
  });

  it("no meta means no caption", () => {
    expect(html({ kind: "table", data: [{ a: 1 }] })).not.toContain("<caption");
  });

  it("tree meta.title renders a title line above the roots", () => {
    const out = html({
      kind: "tree",
      data: { label: "root", children: [] },
      meta: { title: "Regions" }
    });
    expect(out).toContain('<div class="wg-tree-title">Regions</div>');
    expect(out.indexOf("wg-tree-title")).toBeLessThan(out.indexOf('<ul class="wg-tree"'));
  });

  it("no tree meta means the bare list", () => {
    const out = html({ kind: "tree", data: { label: "root", children: [] } });
    expect(out).not.toContain("wg-tree-title");
    expect(out.startsWith("<ul")).toBe(true);
  });
});

describe("table fieldFormat", () => {
  it("formats cells by column with card semantics", () => {
    const out = html({
      kind: "table",
      data: [{ total: 11471334.78, note: "x" }],
      hints: { fieldFormat: { total: "${value}", note: "n: {value}!" } }
    });
    expect(out).toContain("$11471334.78");
    expect(out).toContain("n: x!");
  });

  it("patterns cannot inject markup", () => {
    const out = html({
      kind: "table",
      data: [{ a: "v" }],
      hints: { fieldFormat: { a: "<b>{value}</b>" } }
    });
    expect(out).toContain("&lt;b&gt;v&lt;/b&gt;");
    expect(out).not.toContain("<b>v</b>");
  });
});

describe("opt-in links on card and table", () => {
  it("renders anchors for all four allowed schemes", () => {
    const out = html({
      kind: "table",
      data: [{
        site: "https://example.com/x",
        plain: "http://example.com",
        mail: "mailto:a@b.c",
        dial: "tel:+15551234"
      }],
      hints: { links: { site: true, plain: true, mail: true, dial: true } }
    });
    for (const href of [
      "https://example.com/x",
      "http://example.com",
      "mailto:a@b.c",
      "tel:+15551234"
    ]) {
      expect(out).toContain(`<a class="wg-link" href="${href}" rel="noopener noreferrer">`);
    }
  });

  it("card fields link the same way", () => {
    const out = html({
      kind: "card",
      data: { fields: { site: "https://example.com" } },
      hints: { links: { site: true } }
    });
    expect(out).toContain('href="https://example.com"');
  });

  it("unsafe schemes, relative refs, and non-strings stay plain text", () => {
    const out = html({
      kind: "table",
      data: [{ evil: "javascript:alert(1)", rel: "/local/path", num: 42 }],
      hints: { links: { evil: true, rel: true, num: true } }
    });
    expect(out).not.toContain("<a ");
    expect(out).toContain("javascript:alert(1)"); // as escaped text content
    expect(out).toContain("/local/path");
  });

  it("nothing links without the hint", () => {
    const out = html({ kind: "table", data: [{ site: "https://example.com" }] });
    expect(out).not.toContain("<a ");
  });

  it("image treatment wins over a link hint for the same key", () => {
    const out = html({
      kind: "table",
      data: [{ pic: "https://cdn.example/a.png" }],
      hints: { links: { pic: true }, images: { pic: "avatar" } }
    });
    expect(out).toContain("<img");
    expect(out).not.toContain("<a ");
  });

  it("a link wraps the formatted text while href keeps the raw value", () => {
    const out = html({
      kind: "table",
      data: [{ site: "https://example.com" }],
      hints: { links: { site: true }, fieldFormat: { site: "visit {value}" } }
    });
    expect(out).toContain(
      '<a class="wg-link" href="https://example.com" rel="noopener noreferrer">visit https://example.com</a>'
    );
  });

  it("hrefs are attribute-escaped on serialization", () => {
    const out = html({
      kind: "table",
      data: [{ site: 'https://example.com/?q="a"&b=1' }],
      hints: { links: { site: true } }
    });
    expect(out).toContain("href=\"https://example.com/?q=&quot;a&quot;&amp;b=1\"");
  });
});

describe("hint analysis for the new surfaces", () => {
  it("table fieldFormat validates against columns", () => {
    const miss = analyzeHints(
      "table",
      [{ total: 1 }],
      { fieldFormat: { totl: "${value}" } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(miss).toEqual([
      expect.objectContaining({ hint: "fieldFormat.totl", code: "NO_MATCH" })
    ]);
    const hit = analyzeHints(
      "table",
      [{ total: 1 }],
      { fieldFormat: { total: "${value}" } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(hit).toEqual([]);
  });

  it("links three-way: invalid value, no match, unsafe target", () => {
    const diagnostics = analyzeHints(
      "table",
      [{ site: "yes-col", bad: "javascript:alert(1)" }],
      { links: { site: 7, missing: true, bad: true } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({ hint: "links.site", code: "INVALID_VALUE" }),
      expect.objectContaining({ hint: "links.missing", code: "NO_MATCH" }),
      expect.objectContaining({ hint: "links.bad", code: "UNSAFE_LINK_TARGET" })
    ]);
  });

  it("a false link hint is silent even on an unlinkable target", () => {
    const diagnostics = analyzeHints(
      "table",
      [{ note: "hello" }],
      { links: { note: false } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(diagnostics).toEqual([]);
  });

  it("card links validate against card fields", () => {
    const diagnostics = analyzeHints(
      "card",
      { fields: { site: "https://example.com" } },
      { links: { site: true } },
      BUILTIN_DESCRIPTORS.card
    );
    expect(diagnostics).toEqual([]);
  });
});

describe("prefix links: clean display, composed href", () => {
  it("composes mailto/tel hrefs while the display stays the raw value", () => {
    const out = html({
      kind: "table",
      data: [{ email: "a@b.c", phone: "+15551234" }],
      hints: { links: { email: "mailto:", phone: "tel:" } }
    });
    expect(out).toContain(
      '<a class="wg-link" href="mailto:a@b.c" rel="noopener noreferrer">a@b.c</a>'
    );
    expect(out).toContain(
      '<a class="wg-link" href="tel:+15551234" rel="noopener noreferrer">+15551234</a>'
    );
  });

  it("card fields compose the same way and fieldFormat still shapes the text", () => {
    const out = html({
      kind: "card",
      data: { fields: { phone: "5551234" } },
      hints: { links: { phone: "tel:" }, fieldFormat: { phone: "call {value}" } }
    });
    expect(out).toContain('href="tel:5551234"');
    expect(out).toContain(">call 5551234</a>");
  });

  it("empty values, non-strings, and hostile compositions never link", () => {
    const out = html({
      kind: "table",
      data: [{ email: "", num: 42, sneak: "javascript:alert(1)" }],
      hints: { links: { email: "mailto:", num: "tel:", sneak: "" } }
    });
    expect(out).not.toContain("<a ");
  });

  it("a prefix that does not form an allowed scheme stays text", () => {
    const out = html({
      kind: "table",
      data: [{ id: "12345" }],
      hints: { links: { id: "x-thing:" } }
    });
    expect(out).not.toContain("<a ");
    expect(out).toContain("12345");
  });

  it("analyzer: valid prefix silent, bad composition flagged, non-string value invalid", () => {
    const good = analyzeHints(
      "table",
      [{ email: "a@b.c" }],
      { links: { email: "mailto:" } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(good).toEqual([]);
    const bad = analyzeHints(
      "table",
      [{ note: "hello" }],
      { links: { note: "x-" } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(bad).toEqual([
      expect.objectContaining({ hint: "links.note", code: "UNSAFE_LINK_TARGET" })
    ]);
    const invalid = analyzeHints(
      "table",
      [{ a: 1 }],
      { links: { a: 7 } },
      BUILTIN_DESCRIPTORS.table
    );
    expect(invalid).toEqual([
      expect.objectContaining({ hint: "links.a", code: "INVALID_VALUE" })
    ]);
  });
});
