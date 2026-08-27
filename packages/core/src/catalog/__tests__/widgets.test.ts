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

  it("hints.fieldFormat formats matching field values", () => {
    const output = html({
      kind: "card",
      data: { fields: { price: 9.99, rating: 2.56, stock: 99 } },
      hints: { fieldFormat: { price: "${value}", rating: "{value} / 5" } }
    });
    expect(output).toContain(">$9.99</");
    expect(output).toContain(">2.56 / 5</");
    expect(output).toContain(">99</"); // unmatched key unformatted
  });

  it("fieldFormat without a placeholder prefixes the value", () => {
    const output = html({
      kind: "card",
      data: { fields: { price: 9.99 } },
      hints: { fieldFormat: { price: "$" } }
    });
    expect(output).toContain(">$9.99</");
  });

  it("fieldFormat cannot inject markup", () => {
    const output = html({
      kind: "card",
      data: { fields: { note: "x" } },
      hints: { fieldFormat: { note: "<b>{value}</b>" } }
    });
    expect(output).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(output).not.toContain("<b>");
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

  it("marks all branches expanded by default", () => {
    const output = html({ kind: "tree", data: nested });
    expect(output).not.toContain('data-expanded="false"');
    expect(output).toContain('data-expanded="true"');
  });

  it("honors hints.expandDepth on branches", () => {
    const deep = {
      label: "root",
      children: [
        { label: "season", children: [{ label: "episode", children: [] }] }
      ]
    };
    const output = html({
      kind: "tree",
      data: deep,
      hints: { expandDepth: 1 }
    });
    const flags = [...output.matchAll(/data-expanded="(\w+)"/g)].map(
      (m) => m[1]
    );
    // root (branch, depth 0) expanded; season (branch, depth 1) collapsed;
    // episode is a leaf and carries no attribute at all.
    expect(flags).toEqual(["true", "false"]);
    // collapsed children remain in the markup (presentational collapse)
    expect(output).toContain(">episode</");
  });

  it("leaves carry no expansion attribute", () => {
    const output = html({
      kind: "tree",
      data: { label: "root", children: [{ label: "leaf", children: [] }] }
    });
    const attributeCount = (output.match(/data-expanded/g) ?? []).length;
    expect(attributeCount).toBe(1); // root only — leaf has none
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

describe("image rendering", () => {
  const PNG = "https://cdn.example/a/ada.png";
  const DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

  it("auto-detects an avatar URL in a table cell", () => {
    const output = html({
      kind: "table",
      data: [{ user: "Ada", avatar: PNG }]
    });
    expect(output).toContain(
      `<img class="wg-img wg-img-avatar" src="${PNG}" alt="avatar" loading="lazy" decoding="async">`
    );
    expect(output).toContain("Ada");
  });

  it("renders a thumbnail by default in a card field", () => {
    const output = html({
      kind: "card",
      data: { fields: { photo: "https://cdn.example/p.jpg" } }
    });
    expect(output).toContain('class="wg-img wg-img-thumb"');
    expect(output).toContain('alt="photo"');
  });

  it("hint forces a shape for an extensionless URL", () => {
    const output = html({
      kind: "card",
      data: { fields: { cover: "https://images.example/id/12345" } },
      hints: { images: { cover: "hero" } }
    });
    expect(output).toContain('class="wg-img wg-img-hero"');
    expect(output).toContain('src="https://images.example/id/12345"');
  });

  it("hint false suppresses detection", () => {
    const output = html({
      kind: "table",
      data: [{ screenshot: PNG }],
      hints: { images: { screenshot: false } }
    });
    expect(output).not.toContain("<img");
    expect(output).toContain("cdn.example/a/ada.png");
  });

  it("never renders an unsafe source as an image, even hinted", () => {
    const output = html({
      kind: "card",
      data: { fields: { x: "javascript:alert(1)" } },
      hints: { images: { x: "avatar" } }
    });
    expect(output).not.toContain("<img");
    expect(output).toContain("javascript:alert(1)"); // escaped text
  });

  it("renders data-image URIs", () => {
    const output = html({
      kind: "card",
      data: { fields: { pic: DATA_URI } }
    });
    expect(output).toContain(`src="${DATA_URI}"`);
  });

  it("image treatment wins over fieldFormat for the same key", () => {
    const output = html({
      kind: "card",
      data: { fields: { avatar: PNG } },
      hints: { fieldFormat: { avatar: "IMG: {value}" } }
    });
    expect(output).toContain('class="wg-img wg-img-thumb"');
    expect(output).not.toContain("IMG:");
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
