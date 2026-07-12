import { describe, it, expect } from "vitest";
import { createCatalog, renderToHtml } from "../index.js";
import type { WidgetNode } from "../index.js";

const catalog = createCatalog();

/** Render a payload and serialize it, asserting success. */
function html(payload: Record<string, unknown>): string {
  const result = catalog.render(payload);
  expect(result.ok).toBe(true);
  return result.ok ? renderToHtml(result.node) : "";
}

function node(payload: Record<string, unknown>): WidgetNode {
  const result = catalog.render(payload);
  if (!result.ok) throw new Error(result.error.message);
  return result.node;
}

describe("card renderer", () => {
  it("renders title, subtitle, and fields from card-shaped data", () => {
    const output = html({
      kind: "card",
      data: { title: "T", subtitle: "S", fields: { k: "v" } }
    });
    expect(output).toContain('class="wg-card"');
    expect(output).toContain('class="wg-card-title"');
    expect(output).toContain(">T</");
    expect(output).toContain(">S</");
    expect(output).toContain(">k</");
    expect(output).toContain(">v</");
  });

  it("renders arbitrary objects as fields", () => {
    const output = html({ kind: "card", data: { name: "Ada", role: "eng" } });
    expect(output).toContain(">name</");
    expect(output).toContain(">Ada</");
    expect(output).toContain(">role</");
    expect(output).toContain(">eng</");
  });

  it("uses meta for missing chrome", () => {
    const output = html({ kind: "card", data: { a: 1 }, meta: { title: "T" } });
    expect(output).toContain('class="wg-card-title"');
    expect(output).toContain(">T</");
  });

  it("renders primitive data as a value line", () => {
    const output = html({ kind: "card", data: 42 });
    expect(output).toContain('class="wg-card-value"');
    expect(output).toContain(">42</");
  });

  it("is total: null and array data render without throwing", () => {
    expect(html({ kind: "card", data: null })).toContain(">null</");
    expect(html({ kind: "card", data: [1, 2] })).toContain("[1,2]");
  });
});

describe("table renderer", () => {
  it("detects columns as first-seen key union with empty missing cells", () => {
    const output = html({
      kind: "table",
      data: [
        { a: 1, b: 2 },
        { a: 3, c: 4 }
      ]
    });
    const headers = [...output.matchAll(/wg-table-header">([^<]*)</g)].map(
      (m) => m[1]
    );
    expect(headers).toEqual(["a", "b", "c"]);
    const rows = [...output.matchAll(/<tr class="wg-table-row">.*?<\/tr>/g)];
    expect(rows).toHaveLength(2);
    const secondRowCells = [
      ...rows[1]![0].matchAll(/wg-table-cell">([^<]*)</g)
    ].map((m) => m[1]);
    expect(secondRowCells).toEqual(["3", "", "4"]);
  });

  it("honors hints.columns as selection and order override", () => {
    const output = html({
      kind: "table",
      data: [
        { a: 1, b: 2 },
        { a: 3, c: 4 }
      ],
      hints: { columns: ["c", "a"] }
    });
    const headers = [...output.matchAll(/wg-table-header">([^<]*)</g)].map(
      (m) => m[1]
    );
    expect(headers).toEqual(["c", "a"]);
  });

  it("is total: non-array data renders as a single record", () => {
    const output = html({ kind: "table", data: { a: 1 } });
    expect(output).toContain(">a</");
    expect(output).toContain(">1</");
  });

  it("is total: null data renders without throwing", () => {
    expect(html({ kind: "table", data: null })).toContain('class="wg-table"');
  });
});

describe("tree renderer", () => {
  const nested = { label: "root", children: [{ label: "leaf", children: [] }] };

  it("renders nested nodes recursively", () => {
    const output = html({ kind: "tree", data: nested });
    expect(output).toContain(">root</");
    expect(output).toContain(">leaf</");
    expect(output.indexOf("root")).toBeLessThan(output.indexOf("leaf"));
    expect(output).toContain('class="wg-tree-children"');
  });

  it("marks all nodes expanded by default", () => {
    const output = html({ kind: "tree", data: nested });
    expect(output).not.toContain('data-expanded="false"');
  });

  it("honors hints.expandDepth", () => {
    const output = html({
      kind: "tree",
      data: nested,
      hints: { expandDepth: 1 }
    });
    const flags = [...output.matchAll(/data-expanded="(\w+)"/g)].map(
      (m) => m[1]
    );
    expect(flags).toEqual(["true", "false"]);
  });

  it("falls back to a JSON label for nodes without one", () => {
    const output = html({
      kind: "tree",
      data: { id: 7, children: [] }
    });
    expect(output).toContain("&quot;id&quot;:7");
  });

  it("is total: primitive data renders without throwing", () => {
    expect(html({ kind: "tree", data: "leafless" })).toContain(">leafless</");
  });
});

describe("custom renderer", () => {
  it("renders pretty-printed JSON in a pre block", () => {
    const output = html({ kind: "custom", data: { any: ["shape"] } });
    expect(output).toContain('<pre class="wg-custom">');
    expect(output).toContain("&quot;any&quot;: [");
  });

  it("falls back to String(data) when serialization fails", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const output = html({ kind: "custom", data: circular });
    expect(output).toContain("[object Object]");
  });
});

describe("render trees are pure data", () => {
  it("built-in output is JSON-serializable", () => {
    const payloads = [
      { kind: "card", data: { title: "T", fields: { k: "v" } } },
      { kind: "table", data: [{ a: 1 }, { b: 2 }] },
      { kind: "tree", data: { label: "r", children: [{ label: "l" }] } },
      { kind: "custom", data: [1, "two", null] }
    ];
    for (const payload of payloads) {
      const tree = node(payload);
      expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
    }
  });
});
