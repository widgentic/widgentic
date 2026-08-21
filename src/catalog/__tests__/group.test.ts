import { describe, it, expect } from "vitest";
import { createCatalog, analyzeHints, renderToHtml } from "../index.js";
import { GROUP_MAX_ITEMS } from "../widgets/group.js";
import { BUILTIN_DESCRIPTORS } from "../descriptors.js";

function renderHtml(payload: unknown): string {
  const result = createCatalog().render(payload);
  if (!result.ok) throw new Error(`unexpected error: ${result.error.message}`);
  return renderToHtml(result.node);
}

describe("group composition", () => {
  it("renders mixed kinds inside one container", () => {
    const html = renderHtml({
      kind: "group",
      data: {
        items: [
          { kind: "card", data: { title: "Ada", fields: { role: "eng" } } },
          { kind: "table", data: [{ a: 1 }] }
        ]
      }
    });
    expect(html).toContain('class="wg-group wg-group-stack wg-gap-md"');
    expect(html).toContain("wg-card");
    expect(html).toContain("wg-table");
  });

  it("is registered as a listed built-in with hint docs", () => {
    const catalog = createCatalog();
    expect(catalog.kinds()).toContain("group");
    const descriptor = catalog.describe("group");
    expect(descriptor?.dataShape).toContain("items");
    expect(Object.keys(descriptor?.hints ?? {})).toEqual(
      expect.arrayContaining(["layout", "gap", "columns"])
    );
  });

  it("layout hints select the presets", () => {
    const html = renderHtml({
      kind: "group",
      data: { items: [{ kind: "card", data: { title: "A" } }] },
      hints: { layout: "grid", columns: 3, gap: "lg" }
    });
    expect(html).toContain('class="wg-group wg-group-grid wg-gap-lg wg-cols-3"');
  });

  it("row layout and clamped grid columns", () => {
    const row = renderHtml({
      kind: "group",
      data: { items: [{ kind: "card", data: { title: "A" } }] },
      hints: { layout: "row", gap: "sm" }
    });
    expect(row).toContain("wg-group-row");
    expect(row).toContain("wg-gap-sm");
    const clamped = renderHtml({
      kind: "group",
      data: { items: [{ kind: "card", data: { title: "A" } }] },
      hints: { layout: "grid", columns: 99 }
    });
    expect(clamped).toContain("wg-cols-4");
  });

  it("unknown layout falls back to stack and surfaces a diagnostic", () => {
    const html = renderHtml({
      kind: "group",
      data: { items: [{ kind: "card", data: { title: "A" } }] },
      hints: { layout: "mosaic" }
    });
    expect(html).toContain("wg-group-stack");
    const diagnostics = analyzeHints(
      "group",
      { items: [] },
      { layout: "mosaic" },
      BUILTIN_DESCRIPTORS.group
    );
    expect(diagnostics).toEqual([
      expect.objectContaining({ hint: "layout", code: "INVALID_VALUE" })
    ]);
  });

  it("group hint values are checked against the group vocabularies", () => {
    const diagnostics = analyzeHints(
      "group",
      { items: [] },
      { layout: "grid", gap: "huge", columns: 0 },
      BUILTIN_DESCRIPTORS.group
    );
    expect(diagnostics.map((d) => d.hint).sort()).toEqual(["columns", "gap"]);
    const misplaced = analyzeHints(
      "group",
      { items: [] },
      { columns: 2 },
      BUILTIN_DESCRIPTORS.group
    );
    expect(misplaced).toEqual([
      expect.objectContaining({ hint: "columns", code: "NO_MATCH" })
    ]);
  });

  it("item errors carry indexed paths", () => {
    const catalog = createCatalog();
    const result = catalog.render({
      kind: "group",
      data: {
        items: [
          { kind: "card", data: { title: "ok" } },
          { kind: "card", data: { title: "ok" } },
          { kind: "nope", data: {} }
        ]
      }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNKNOWN_KIND");
    expect(result.error.path).toBe("data.items[2].kind");
  });

  it("item schema violations keep their code under the indexed path", () => {
    const catalog = createCatalog();
    catalog.register("strict", () => "x", {
      description: "schema-gated test kind",
      dataShape: "{ name }",
      dataSchema: { type: "object", required: ["name"], properties: { name: { type: "string" } } }
    });
    const result = catalog.render({
      kind: "group",
      data: { items: [{ kind: "strict", data: {} }] }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
    expect(result.error.path).toBe("data.items[0].data.name");
  });

  it("nested groups are refused", () => {
    const result = createCatalog().render({
      kind: "group",
      data: { items: [{ kind: "group", data: { items: [] } }] }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe("data.items[0].kind");
    expect(result.error.message).toContain("cannot contain");
  });

  it("the item cap is enforced by name", () => {
    const items = Array.from({ length: GROUP_MAX_ITEMS + 1 }, () => ({
      kind: "card",
      data: { title: "x" }
    }));
    const result = createCatalog().render({ kind: "group", data: { items } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.path).toBe("data.items");
    expect(result.error.message).toContain(String(GROUP_MAX_ITEMS));
  });

  it("envelope shape errors are structured", () => {
    const catalog = createCatalog();
    const missing = catalog.render({ kind: "group", data: {} });
    expect(!missing.ok && missing.error.code).toBe("MISSING_FIELD");
    const notArray = catalog.render({ kind: "group", data: { items: "x" } });
    expect(!notArray.ok && notArray.error.path).toBe("data.items");
    const badItem = catalog.render({ kind: "group", data: { items: [7] } });
    expect(!badItem.ok && badItem.error.path).toBe("data.items[0]");
  });

  it("registered custom kinds render inside groups with their hints and meta", () => {
    const catalog = createCatalog();
    catalog.register("echo", (payload) => JSON.stringify([payload.hints, payload.meta]));
    const result = catalog.render({
      kind: "group",
      data: {
        items: [{ kind: "echo", data: null, hints: { a: 1 }, meta: { title: "T" } }]
      }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(renderToHtml(result.node)).toContain("[{&quot;a&quot;:1},{&quot;title&quot;:&quot;T&quot;}]");
  });

  it("a directly resolved group renderer still renders items", () => {
    const catalog = createCatalog();
    const renderer = catalog.resolve("group");
    expect(renderer).toBeDefined();
    const node = renderer!({
      kind: "group",
      data: { items: [{ kind: "card", data: { title: "Ada" } }] }
    });
    expect(renderToHtml(node)).toContain("wg-card");
  });
});
