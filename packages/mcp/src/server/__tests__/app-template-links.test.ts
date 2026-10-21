// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalog, renderToHtml } from "@widgentic/core";
import { bootTemplate, settle, toolInputPartial } from "./template-harness.js";

const catalog = createCatalog();

/** The href at each position, or null where the position is text. */
function realHrefs(payload: Record<string, unknown>, cells: string): (string | null)[] {
  const rendered = catalog.render(payload);
  if (!rendered.ok) throw new Error("fixture failed to render");
  const real = document.createElement("div");
  real.innerHTML = renderToHtml(rendered.node);
  return [...real.querySelectorAll(cells)].map((cell) => cell.querySelector("a")?.getAttribute("href") ?? null);
}
function previewHrefs(root: HTMLElement, cells: string): (string | null)[] {
  return [...root.querySelectorAll(cells)].map((cell) => cell.querySelector("a")?.getAttribute("href") ?? null);
}

// Every case of the URL-value rule: a query prefix, a path prefix, bare
// mail and phone schemes, a bare web scheme with its own escapes, a
// scheme-less prefix that must not assemble one, non-ASCII, an astral
// character, a lone surrogate, and an empty value.
const values = {
  query: "Ada & Lin?x=1#y",
  path: "a/b%c",
  mail: "ada@example.org?subject=hi#x",
  phone: "+1 555-0100",
  dial: "100%[x]",
  rest: "//cdn.example.com/a b.png?q=a%20b&h=2",
  sneak: "script:alert(1)",
  accent: "José",
  emoji: "\u{1F600}",
  broken: "a\ud800b",
  empty: ""
};
const hints = {
  links: {
    query: "https://api.dicebear.com/9.x/initials/svg?seed=",
    path: "https://cdn.example.com/u/",
    mail: "mailto:",
    phone: "tel:",
    dial: "tel:",
    rest: "https:",
    sneak: "java",
    accent: "https://example.com/u?n=",
    emoji: "https://example.com/?q=",
    broken: "https://example.com/?q=",
    empty: "mailto:"
  }
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("previews compose links as the result does", () => {
  it("card fields link exactly the hrefs the renderer builds", async () => {
    const payload = { kind: "card", data: { title: "T", fields: values }, hints };
    const expected = realHrefs(payload, "dd.wg-card-field-value");
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "card", data: payload.data, hints }));
    await settle();
    expect(previewHrefs(t.root(), "dd.wg-card-field-value")).toEqual(expected);
    expect(expected.filter((href) => href !== null)).toHaveLength(9);
  });

  it("table cells link exactly the hrefs the renderer builds", async () => {
    const payload = { kind: "table", data: [values], hints };
    const expected = realHrefs(payload, "td.wg-table-cell");
    const t = bootTemplate();
    t.dispatch(toolInputPartial({ widget: "table", data: payload.data, hints }));
    await settle();
    expect(previewHrefs(t.root(), "td.wg-table-cell")).toEqual(expected);
    expect(expected).toContain("tel:100%25%5Bx%5D");
    expect(expected).toContain("https://cdn.example.com/a%20b.png?q=a%20b&h=2");
  });

  it("a streamed table links the encoded href", async () => {
    const t = bootTemplate();
    // Hints stream before the data: a trailing URL-shaped value is held back as still growing.
    t.dispatch(toolInputPartial({
      widget: "table",
      hints: { links: { q: "https://search.example.com/?q=" } },
      data: [{ q: "a&b c" }]
    }));
    await settle();
    const link = t.root().querySelector("td.wg-table-cell a");
    expect(link?.getAttribute("href")).toBe("https://search.example.com/?q=a%26b%20c");
    expect(link?.textContent).toBe("a&b c");
    const payload = { kind: "table", data: [{ q: "a&b c" }], hints: { links: { q: "https://search.example.com/?q=" } } };
    expect(realHrefs(payload, "td.wg-table-cell")).toEqual(["https://search.example.com/?q=a%26b%20c"]);
  });
});
