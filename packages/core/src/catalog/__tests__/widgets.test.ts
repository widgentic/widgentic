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
    expect(output).toContain(">root</summary>");
    expect(output).toContain(">leaf</span>");
    expect(output.indexOf("root")).toBeLessThan(output.indexOf("leaf"));
    expect(output).toContain('<ul class="wg-tree-children">');
  });

  it("renders a branch as a native disclosure carrying the label", () => {
    const output = html({ kind: "tree", data: nested });
    expect(output).toContain(
      '<li class="wg-tree-node"><details class="wg-tree-branch" open="">' +
        '<summary class="wg-tree-label">root</summary>'
    );
  });

  it("opens every branch by default", () => {
    const output = html({ kind: "tree", data: nested });
    expect(output).toContain('<details class="wg-tree-branch" open="">');
    expect(output).not.toContain('<details class="wg-tree-branch">');
  });

  it("excludes icon and children from the fallback even when they are all there is", () => {
    const output = html({
      kind: "tree",
      data: { icon: "\u{1F4C1}", children: [{ label: "leaf", children: [] }] }
    });
    // The whole-node fallback would print the subtree as the label text.
    expect(output).not.toContain("&quot;children&quot;");
    expect(output).not.toContain("&quot;icon&quot;");
    expect(output).toContain(">leaf</span>");
  });

  it("treats a negative expandDepth as zero, not as unlimited", () => {
    const output = html({ kind: "tree", data: nested, hints: { expandDepth: -1 } });
    expect(output).toContain('<details class="wg-tree-branch">');
    expect(output).not.toContain('open=""');
  });

  it("renders hostile nesting as leaves past the depth bound, without throwing", () => {
    let data: Record<string, unknown> = { label: "bottom", children: [] };
    for (let i = 0; i < 5000; i++) data = { label: `n${i}`, children: [data] };
    const output = html({ kind: "tree", data });
    // Total: the render completes, and depth is bounded by leaf-ing out.
    expect(output).toContain("n4999");
    expect((output.match(/<details/g) ?? []).length).toBeLessThanOrEqual(64);
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
    // root (branch, depth 0) open; season (branch, depth 1) closed;
    // episode is a leaf and renders no disclosure at all.
    const branches = [...output.matchAll(/<details class="wg-tree-branch"( open="")?>/g)]
      .map((m) => m[1] !== undefined);
    expect(branches).toEqual([true, false]);
    // collapsed children remain in the markup (presentational collapse)
    expect(output).toContain(">episode</span>");
  });

  it("gives leaves a plain label and no disclosure", () => {
    const output = html({ kind: "tree", data: nested });
    expect(output).toContain(
      '<li class="wg-tree-node"><span class="wg-tree-label">leaf</span></li>'
    );
    expect((output.match(/<details/g) ?? []).length).toBe(1); // root only
  });

  it("renders meta.title as a title line above the tree", () => {
    const output = html({
      kind: "tree",
      data: nested,
      meta: { title: "Regions" }
    });
    expect(output).toContain(
      '<div class="wg-tree-titled"><div class="wg-tree-title">Regions</div>' +
        '<ul class="wg-tree">'
    );
    expect(html({ kind: "tree", data: nested })).not.toContain("wg-tree-title");
  });

  it("renders a safe image icon through the shared gate", () => {
    const output = html({
      kind: "tree",
      data: { label: "assets", icon: "https://cdn.example/folder.png", children: [] }
    });
    expect(output).toContain(
      '<span class="wg-tree-label">' +
        '<img class="wg-img wg-img-icon" src="https://cdn.example/folder.png" ' +
        'alt="" loading="lazy" decoding="async">assets</span>'
    );
  });

  it("renders a non-image icon string as text before the label", () => {
    const output = html({
      kind: "tree",
      data: { label: "src", icon: "\u{1F4C1}", children: [{ label: "a", children: [] }] }
    });
    expect(output).toContain(
      '<summary class="wg-tree-label">' +
        '<span class="wg-tree-icon">\u{1F4C1}</span>src</summary>'
    );
    expect(output).not.toContain("<img");
  });

  it("never renders an unsafe icon source as an image", () => {
    for (const icon of [
      "javascript:alert(1)",
      "https://cdn.example/extensionless",
      "data:text/html;base64,PHN2Zz4="
    ]) {
      const output = html({ kind: "tree", data: { label: "n", icon, children: [] } });
      expect(output).not.toContain("<img");
      expect(output).toContain('<span class="wg-tree-icon">');
    }
  });

  it("falls back to a JSON label for nodes without one", () => {
    const output = html({
      kind: "tree",
      data: { id: 7, children: [] }
    });
    expect(output).toContain("&quot;id&quot;:7");
  });

  it("excludes icon and children from the JSON fallback label", () => {
    const output = html({
      kind: "tree",
      data: { id: 7, icon: "\u{1F4C1}", children: [{ label: "kid", children: [] }] }
    });
    expect(output).toContain("&quot;id&quot;:7");
    expect(output).not.toContain("&quot;icon&quot;");
    expect(output).not.toContain("&quot;children&quot;");
    // the icon still renders in its own slot
    expect(output).toContain('<span class="wg-tree-icon">\u{1F4C1}</span>');
  });

  it("is total: primitive data renders without throwing", () => {
    expect(html({ kind: "tree", data: "leafless" })).toContain(">leafless</span>");
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
      { kind: "tree", data: { label: "r", icon: "\u{1F4C1}", children: [] } }
    ];
    for (const payload of payloads) {
      const tree = node(payload);
      expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
    }
  });
});
