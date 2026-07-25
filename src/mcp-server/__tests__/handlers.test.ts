import { describe, it, expect } from "vitest";
import {
  handleListWidgets,
  handleRenderWidget,
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL
} from "../index.js";
import { createCatalog } from "../../catalog/index.js";
import type { WidgetCatalog } from "../../catalog/index.js";
import { registerTemplate } from "../../templates/index.js";
import { extractWidgetPayload } from "../../mcp/index.js";
import type { McpToolResult } from "../../mcp/index.js";

function textOf(result: McpToolResult): string {
  const block = result.content.find((b) => b.type === "text");
  return typeof block?.text === "string" ? block.text : "";
}

function catalogWithInvoice(): WidgetCatalog {
  const catalog = createCatalog();
  registerTemplate(
    catalog,
    "invoice",
    {
      tag: "div",
      children: [{ each: "lines", template: { tag: "li", children: [{ bind: "item" }] } }]
    },
    { description: "Invoice", dataShape: "{ lines: { item }[] }" }
  );
  return catalog;
}

describe("tool definitions", () => {
  it("are serializable data with the documented names", () => {
    for (const tool of [LIST_WIDGETS_TOOL, RENDER_WIDGET_TOOL]) {
      expect(JSON.parse(JSON.stringify(tool))).toEqual(tool);
      expect(tool.description.length).toBeGreaterThan(0);
    }
    expect(LIST_WIDGETS_TOOL.name).toBe("list_widgets");
    expect(RENDER_WIDGET_TOOL.name).toBe("render_widget");
    expect(RENDER_WIDGET_TOOL.inputSchema.required).toEqual(["widget", "data"]);
  });

  it("data is explicitly typed to steer client marshalling", () => {
    const properties = RENDER_WIDGET_TOOL.inputSchema.properties as Record<
      string,
      { type?: unknown }
    >;
    expect(properties.data?.type).toEqual([
      "array",
      "object",
      "string",
      "number",
      "boolean",
      "null"
    ]);
  });
});

describe("handleListWidgets", () => {
  it("reflects the catalog including registered template kinds", () => {
    const result = handleListWidgets(catalogWithInvoice());
    expect(result.isError).toBeUndefined();
    const descriptors = JSON.parse(textOf(result)) as { kind: string }[];
    const kinds = descriptors.map((d) => d.kind);
    for (const kind of ["card", "table", "tree", "custom", "invoice"]) {
      expect(kinds).toContain(kind);
    }
  });

  it("carries agent-usable metadata", () => {
    const result = handleListWidgets(createCatalog());
    const descriptors = JSON.parse(textOf(result)) as Record<string, unknown>[];
    const table = descriptors.find((d) => d.kind === "table");
    expect(table?.description).toBeTruthy();
    expect(table?.dataShape).toBeTruthy();
    expect(table?.dataExample).toBeDefined();
  });
});

describe("handleRenderWidget", () => {
  const catalog = createCatalog();

  it("renders dual-format on success", () => {
    const result = handleRenderWidget(catalog, {
      widget: "table",
      data: [{ a: 1 }]
    });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('class="wg-table"');
    const extraction = extractWidgetPayload(result);
    expect(extraction).toMatchObject({ found: true, ok: true });
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.kind).toBe("table");
    }
  });

  it("passes hints and meta through", () => {
    const result = handleRenderWidget(catalog, {
      widget: "table",
      data: [{ a: 1, b: 2 }],
      hints: { columns: ["b"] },
      meta: { title: "T" }
    });
    const html = textOf(result);
    expect(html).toContain(">b</");
    expect(html).not.toContain(">a</");
    const extraction = extractWidgetPayload(result);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.hints).toEqual({ columns: ["b"] });
      expect(extraction.payload.meta).toEqual({ title: "T" });
    } else {
      expect.fail("expected a successful extraction");
    }
  });

  it("renders registered template kinds", () => {
    const result = handleRenderWidget(catalogWithInvoice(), {
      widget: "invoice",
      data: { lines: [{ item: "widgets" }] }
    });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain("<li>widgets</li>");
  });

  it("returns UNKNOWN_KIND in tool vocabulary with the available kinds", () => {
    const result = handleRenderWidget(catalog, { widget: "nope", data: 1 });
    expect(result.isError).toBe(true);
    const error = JSON.parse(textOf(result));
    expect(error.code).toBe("UNKNOWN_KIND");
    expect(error.path).toBe("widget");
    expect(error.message).toContain("card, custom, table, tree");
  });

  it("returns MISSING_FIELD with paths for missing inputs", () => {
    const noData = handleRenderWidget(catalog, { widget: "card" });
    expect(JSON.parse(textOf(noData))).toMatchObject({
      code: "MISSING_FIELD",
      path: "data"
    });

    const noWidget = handleRenderWidget(catalog, { data: 1 });
    expect(JSON.parse(textOf(noWidget))).toMatchObject({
      code: "MISSING_FIELD",
      path: "widget"
    });
  });

  it("is total over garbage input", () => {
    for (const input of [null, 42, "str", [], undefined]) {
      const result = handleRenderWidget(catalog, input);
      expect(result.isError).toBe(true);
      expect(() => JSON.parse(textOf(result))).not.toThrow();
    }
  });

  it("parses string-encoded arrays identically to real arrays (marshalling regression)", () => {
    const rows = [
      { title: "A", points: 1 },
      { title: "B", points: 2 }
    ];
    const fromArray = handleRenderWidget(catalog, {
      widget: "table",
      data: rows
    });
    const fromString = handleRenderWidget(catalog, {
      widget: "table",
      data: JSON.stringify(rows)
    });
    expect(fromString.isError).toBeUndefined();
    expect(textOf(fromString)).toBe(textOf(fromArray));
    expect((textOf(fromString).match(/wg-table-row/g) ?? [])).toHaveLength(2);

    const extraction = extractWidgetPayload(fromString);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.data).toEqual(rows);
    } else {
      expect.fail("expected a successful extraction");
    }
  });

  it("parses string-encoded objects and keeps literal strings literal", () => {
    const objectResult = handleRenderWidget(catalog, {
      widget: "card",
      data: '{"name":"Ada"}'
    });
    expect(textOf(objectResult)).toContain(">Ada</");

    for (const literal of ["hello", "[not json", "42"]) {
      const result = handleRenderWidget(catalog, {
        widget: "card",
        data: literal
      });
      const extraction = extractWidgetPayload(result);
      if (extraction.found && extraction.ok) {
        expect(extraction.payload.data).toBe(literal);
      } else {
        expect.fail("expected a successful extraction");
      }
    }
  });

  it("unwraps double-encoded arrays (variant C regression)", () => {
    const rows = [
      { title: "A", points: 1 },
      { title: "B", points: 2 }
    ];
    const doubleEncoded = JSON.stringify(JSON.stringify(rows));
    expect(doubleEncoded.startsWith('"')).toBe(true);

    const fromDouble = handleRenderWidget(catalog, {
      widget: "table",
      data: doubleEncoded
    });
    const fromArray = handleRenderWidget(catalog, { widget: "table", data: rows });
    expect(textOf(fromDouble)).toBe(textOf(fromArray));

    const extraction = extractWidgetPayload(fromDouble);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.data).toEqual(rows);
    } else {
      expect.fail("expected a successful extraction");
    }
  });

  it("never half-unwraps: quoted text and stringified primitives stay verbatim", () => {
    for (const literal of ['"hello"', '"null"', '"42"', "null", "true"]) {
      const result = handleRenderWidget(catalog, {
        widget: "card",
        data: literal
      });
      const extraction = extractWidgetPayload(result);
      if (extraction.found && extraction.ok) {
        expect(extraction.payload.data).toBe(literal);
      } else {
        expect.fail(`expected a successful extraction for ${literal}`);
      }
    }
  });

  it("rejects non-serializable data as a structured error", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = handleRenderWidget(catalog, {
      widget: "custom",
      data: circular
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result))).toMatchObject({
      code: "INVALID_TYPE",
      path: "data"
    });
  });
});
