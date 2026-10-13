import { describe, it, expect } from "vitest";
import { compileTemplate, validateTemplate, MARKDOWN_SOURCE_MAX, MARKDOWN_TAGS } from "../index.js";
import type { WidgetTemplate } from "../index.js";
import { renderToHtml } from "../../catalog/index.js";
import type { WidgetNode } from "../../catalog/index.js";

const NOTES: WidgetTemplate = { bind: "notes", markdown: true };

function tree(notes: unknown, maxNodes?: number): WidgetNode {
  return compileTemplate(NOTES, maxNodes === undefined ? {} : { maxNodes })({ kind: "x", data: { notes } });
}

const html = (notes: unknown): string => renderToHtml(tree(notes));

/** Every tag in a tree, in document order. */
function tags(node: WidgetNode): string[] {
  if (typeof node === "string") return [];
  return [node.tag, ...(node.children ?? []).flatMap(tags)];
}

/** The text a tree reads, `br` as a newline. */
function text(node: WidgetNode): string {
  if (typeof node === "string") return node;
  if (node.tag === "br") return "\n";
  return (node.children ?? []).map(text).join("");
}

describe("Markdown text binds", () => {
  it("renders the subset as elements inside one div.wg-md", () => {
    const out = html(
      "Intro with **bold**, *em* and `code`.\n\n- one\n- two\n\n3. third\n4. fourth\n\nSee [docs](https://example.com/docs)."
    );
    expect(out).toBe(
      '<div class="wg-md">' +
        "<p>Intro with <strong>bold</strong>, <em>em</em> and <code>code</code>.</p>" +
        "<ul><li>one</li><li>two</li></ul>" +
        '<ol start="3"><li>third</li><li>fourth</li></ol>' +
        '<p>See <a href="https://example.com/docs" rel="noopener noreferrer">docs</a>.</p>' +
        "</div>"
    );
  });

  it("breaks lines and keeps identifiers, code and escapes as text", () => {
    expect(html("Line one\nsnake_case_name and `**literal**`\n\\*not em\\*")).toBe(
      '<div class="wg-md"><p>Line one<br>snake_case_name and <code>**literal**</code><br>*not em*</p></div>'
    );
  });

  it("nests emphasis, strong and links, and treats underscores like asterisks", () => {
    expect(html("***both*** __strong__ _em_ [**bold link**](https://a.example)")).toBe(
      '<div class="wg-md"><p><em><strong>both</strong></em> <strong>strong</strong> <em>em</em> ' +
        '<a href="https://a.example" rel="noopener noreferrer"><strong>bold link</strong></a></p></div>'
    );
    expect(html("**a *b* c**")).toBe('<div class="wg-md"><p><strong>a <em>b</em> c</strong></p></div>');
  });

  it("leaves unmatched delimiters, other syntax and raw HTML as literal text", () => {
    const source = "# Heading\n\n> quote\n\n```\nfence\n```\n\n**open *half _x 2 * 3 [no link] ![img](https://a.example/i.png)\n\n<b>hi</b> | a | b |";
    const out = tree(source);
    // Every character of the value survives as text.
    expect(text(out).replace(/\n/g, "")).toContain("# Heading");
    expect(text(out)).toContain("> quote");
    expect(text(out)).toContain("**open *half _x 2 * 3 [no link] !");
    expect(text(out)).toContain("<b>hi</b> | a | b |");
    expect(tags(out).every((tag) => tag === "div" || MARKDOWN_TAGS.some((allowed) => allowed === tag))).toBe(true);
    expect(tags(out)).not.toContain("img");
    expect(tags(out)).not.toContain("b");
  });

  it("keeps images literal, the URL included, whatever the scheme", () => {
    expect(html("![logo](https://example.com/logo.png) and ![x](javascript:alert(1))")).toBe(
      '<div class="wg-md"><p>![logo](https://example.com/logo.png) and ![x](javascript:alert(1))</p></div>'
    );
  });

  it("keeps a code fence literal, line by line, fences and info string included", () => {
    expect(html("Before\n```js\nconst a = 1;\n\n  **b** = 2;\n```\nAfter *em*")).toBe(
      '<div class="wg-md"><p>Before</p><p>```js<br>const a = 1;<br><br>  **b** = 2;<br>```</p><p>After <em>em</em></p></div>'
    );
    // An unclosed fence runs to the end of the value; a shorter closer does not close it.
    expect(html("~~~~\nunclosed `x`\n~~~\nstill inside")).toBe(
      '<div class="wg-md"><p>~~~~<br>unclosed `x`<br>~~~<br>still inside</p></div>'
    );
  });

  it("joins continuation lines into the item and flattens indented items", () => {
    expect(html("- first\n  more of first\n    - indented\n* other marker")).toBe(
      '<div class="wg-md"><ul><li>first<br>more of first</li><li>indented</li><li>other marker</li></ul></div>'
    );
    expect(html("Intro:\n- a\n1) b")).toBe('<div class="wg-md"><p>Intro:</p><ul><li>a</li></ul><ol><li>b</li></ol></div>');
  });

  it("reads non-string values as their plain text", () => {
    expect(html(42)).toBe('<div class="wg-md"><p>42</p></div>');
    expect(html({ a: 1 })).toBe('<div class="wg-md"><p>{&quot;a&quot;:1}</p></div>');
  });

  it("renders nothing for an empty or whitespace-only value", () => {
    for (const value of ["", "   ", "\n\n", undefined, null]) {
      const node = compileTemplate({ tag: "section", children: [NOTES] })({ kind: "x", data: { notes: value } });
      expect(renderToHtml(node), JSON.stringify(value)).toBe(value === null ? '<section><div class="wg-md"><p>null</p></div></section>' : "<section></section>");
    }
  });

  it("renders an oversized source as one plain paragraph, unparsed", () => {
    const source = `**bold** ${"x".repeat(MARKDOWN_SOURCE_MAX)}`;
    const out = tree(source);
    expect(tags(out)).toEqual(["div", "p"]);
    expect(text(out)).toBe(source);
  });

  it("spends the node budget and marks the render truncated", () => {
    const items = Array.from({ length: 4000 }, () => "- x").join("\n");
    expect(items.length).toBeLessThanOrEqual(MARKDOWN_SOURCE_MAX);
    const out = tree(items, 1000);
    expect(typeof out !== "string" && out.attrs?.["data-truncated"]).toBe("true");
    const count = (node: WidgetNode): number =>
      typeof node === "string" ? 1 : 1 + (node.children ?? []).reduce((sum, child) => sum + count(child), 0);
    // The wrapper the interpreter adds for a truncated render is the only node beyond the budget.
    expect(count(out)).toBeLessThanOrEqual(1001);
    // Under budget, the same source is complete and unmarked.
    const full = tree(items);
    expect(typeof full !== "string" && full.attrs?.["data-truncated"]).toBeFalsy();
  });

  it("is deterministic and fast on pathological input", () => {
    const hostile = [
      "*_".repeat(MARKDOWN_SOURCE_MAX / 2),
      "[".repeat(MARKDOWN_SOURCE_MAX),
      "`a``b```c".repeat(Math.floor(MARKDOWN_SOURCE_MAX / 9)),
      "_a *b ".repeat(Math.floor(MARKDOWN_SOURCE_MAX / 6)),
      "[x](".repeat(MARKDOWN_SOURCE_MAX / 4)
    ];
    for (const source of hostile) {
      const started = performance.now();
      const first = html(source);
      expect(performance.now() - started, source.slice(0, 12)).toBeLessThan(1000);
      expect(html(source)).toBe(first);
    }
  });
});

describe("Markdown safety", () => {
  it("cannot smuggle markup or an unguarded URL", () => {
    const out = tree("<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](data:text/html,hi)");
    expect(tags(out)).not.toContain("img");
    expect(tags(out)).not.toContain("a");
    expect(text(out)).toBe("<img src=x onerror=alert(1)> x y");
    expect(renderToHtml(out)).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("guards links like a bound href: http(s), mailto, tel and relative pass", () => {
    const out = html("[a](mailto:a@example.com) [b](tel:+1555) [c](/relative) [d](JaVaScRiPt:alert(1))");
    expect(out).toContain('href="mailto:a@example.com"');
    expect(out).toContain('href="tel:+1555"');
    expect(out).toContain('href="/relative"');
    expect(out).not.toMatch(/javascript/i);
  });
});

describe("Markdown validation", () => {
  const text = (node: unknown) => validateTemplate({ tag: "div", children: [node] });

  it("accepts a boolean markdown on a text bind", () => {
    expect(text({ bind: "notes", markdown: true }).ok).toBe(true);
    expect(text({ bind: "notes", markdown: false }).ok).toBe(true);
    expect(text({ bind: "notes", markdown: false, format: { type: "count" } }).ok).toBe(true);
  });

  it("refuses a misplaced markdown at its path", () => {
    const cases: [unknown, string][] = [
      [{ tag: "div", children: [{ bind: "notes", markdown: true, format: { type: "truncate", length: 80 } }] }, "children.0"],
      [{ tag: "div", children: [{ bind: "notes", markdown: true, map: { a: "b" } }] }, "children.0"],
      [{ tag: "div", children: [{ bind: "notes", markdown: "yes" }] }, "children.0"],
      [{ tag: "div", attrs: { title: { bind: "notes", markdown: true } } }, "attrs.title"]
    ];
    for (const [template, path] of cases) {
      const result = validateTemplate(template);
      expect(result.ok, JSON.stringify(template)).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_TEMPLATE_NODE");
        expect(result.error.path).toBe(path);
      }
    }
  });
});
