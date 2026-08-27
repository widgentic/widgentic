import { describe, it, expect } from "vitest";
// Resolved through the package `exports` map (self-reference), confirming
// the `./catalog` entry works for consumers.
import { createCatalog, renderToHtml } from "../index.js";
import { mapToWidget } from "../../mapper/index.js";

describe("mapper → catalog integration", () => {
  const catalog = createCatalog();

  it("mapped records render as a table", () => {
    const payload = mapToWidget({
      data: [
        { id: 1, name: "Ada" },
        { id: 2, name: "Lin" }
      ]
    });
    const result = catalog.render(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = renderToHtml(result.node);
    expect(output).toContain('class="wg-table"');
    expect(output).toContain(">Ada</");
  });

  it("mapped plain object renders as a card", () => {
    const payload = mapToWidget({
      data: { name: "Ada" },
      meta: { title: "Person" }
    });
    const result = catalog.render(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = renderToHtml(result.node);
    expect(output).toContain('class="wg-card"');
    expect(output).toContain(">Person</");
  });

  it("mapped nested nodes render as a tree", () => {
    const payload = mapToWidget({
      data: { label: "root", children: [{ label: "leaf", children: [] }] }
    });
    const result = catalog.render(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(renderToHtml(result.node)).toContain('class="wg-tree"');
  });

  it("every mapper fallback has a catalog renderer", () => {
    const catalogKinds = new Set(createCatalog().kinds());
    for (const data of [null, "x", 42, [], [1, 2], { a: 1 }]) {
      const payload = mapToWidget({ data });
      expect(catalogKinds.has(payload.kind)).toBe(true);
      expect(catalog.render(payload).ok).toBe(true);
    }
  });
});
