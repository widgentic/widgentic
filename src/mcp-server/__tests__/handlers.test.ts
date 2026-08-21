import { describe, it, expect } from "vitest";
import {
  handleListWidgets,
  handleRenderWidget,
  handleListThemeTokens,
  handleListThemes,
  GET_AUTHORING_GUIDE_TOOL,
  LIST_SCHEMAS_TOOL,
  LIST_THEMES_TOOL,
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  LIST_THEME_TOKENS_TOOL
} from "../index.js";
import {
  THEME_TOKENS,
  createThemeRegistry,
  darkTheme,
  validateTheme
} from "../../theming/index.js";
import { createCatalog, renderToHtml } from "../../catalog/index.js";
import type { WidgetCatalog, WidgetNode } from "../../catalog/index.js";
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

describe("handleListThemeTokens", () => {
  it("lists every token with its default, presets, and rules", () => {
    const result = handleListThemeTokens();
    expect(result.isError).toBeUndefined();
    const listing = JSON.parse(textOf(result)) as {
      tokens: { name: string; default: string }[];
      presets: { dark: Record<string, string> };
      rules: string;
    };
    expect(listing.tokens.map((t) => t.name).sort()).toEqual(
      [...THEME_TOKENS].sort()
    );
    for (const token of listing.tokens) {
      expect(token.default.length).toBeGreaterThan(0);
    }
    expect(validateTheme(listing.presets.dark)).toMatchObject({ ok: true });
    expect(listing.rules).toContain("strings");
  });
});

describe("tool definitions", () => {
  it("are serializable data with the documented names", () => {
    for (const tool of [LIST_WIDGETS_TOOL, RENDER_WIDGET_TOOL, LIST_THEME_TOKENS_TOOL, LIST_THEMES_TOOL, LIST_SCHEMAS_TOOL, GET_AUTHORING_GUIDE_TOOL]) {
      expect(JSON.parse(JSON.stringify(tool))).toEqual(tool);
      expect(tool.description.length).toBeGreaterThan(0);
    }
    expect(LIST_WIDGETS_TOOL.name).toBe("list_widgets");
    expect(RENDER_WIDGET_TOOL.name).toBe("render_widget");
    expect(RENDER_WIDGET_TOOL.inputSchema.required).toEqual(["widget", "data"]);
  });

  it("theme input steers agents to names for saved themes", () => {
    const theme = (
      RENDER_WIDGET_TOOL.inputSchema.properties as Record<
        string,
        { type?: unknown; description?: string }
      >
    ).theme;
    // Both forms stay legal; when the USER names a theme, the name wins —
    // saved themes are server-side truth, reconstructions drift.
    expect(theme?.type).toEqual(["object", "string"]);
    expect(theme?.description).toContain("pass the NAME");
    expect(theme?.description).toContain("do NOT reconstruct");
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
    expect(error.message).toContain("card, custom, group, table, tree");
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

  it("format selects output blocks; page is a styled document", () => {
    const input = { widget: "card", data: { title: "T" } };

    const htmlOnly = handleRenderWidget(catalog, { ...input, format: "html" });
    expect(htmlOnly.content).toHaveLength(1);
    expect(htmlOnly.content[0]?.type).toBe("text");

    const widgetOnly = handleRenderWidget(catalog, {
      ...input,
      format: "widget"
    });
    expect(widgetOnly.content).toHaveLength(1);
    expect(widgetOnly.content[0]?.type).toBe("resource");
    expect(extractWidgetPayload(widgetOnly)).toMatchObject({
      found: true,
      ok: true
    });

    const page = handleRenderWidget(catalog, { ...input, format: "page" });
    const doc = textOf(page);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain(".wg-card {");
    expect(doc).toContain('class="wg-card"');
    // the body is themed from tokens so dark themes recolor the whole page
    expect(doc).toContain("body {");
    expect(doc).toContain("background: var(--wg-bg,");
    expect(doc).toContain("color: var(--wg-fg,");
    expect(extractWidgetPayload(page)).toMatchObject({ found: true, ok: true });

    const badFormat = handleRenderWidget(catalog, { ...input, format: "pdf" });
    expect(badFormat.isError).toBe(true);
    expect(JSON.parse(textOf(badFormat)).path).toBe("format");
  });

  it("app format composes fallback text, ui:// html resource, and payload", () => {
    const styled = createCatalog();
    styled.register(
      "badge",
      () => ({ tag: "span", attrs: { class: "wg-badge" }, children: ["hi"] }),
      {
        description: "badge",
        dataShape: "any",
        styles: { ".wg-badge": { color: "var(--wg-accent, #2563eb)" } }
      }
    );
    const result = handleRenderWidget(styled, {
      widget: "badge",
      data: 1,
      format: "app",
      theme: { bg: "#0f131c" }
    });
    expect(result.isError).toBeUndefined();
    expect(result.content.map((b) => b.type)).toEqual([
      "text",
      "resource",
      "resource"
    ]);

    // fallback line names the widget
    expect(result.content[0]?.text).toContain("badge");

    // the ui:// html resource is the themed, styled page
    const ui = result.content[1] as {
      resource: { uri: string; mimeType: string; text: string };
    };
    expect(ui.resource.uri).toBe("ui://widgentic/page/badge");
    expect(ui.resource.mimeType).toBe("text/html;profile=mcp-app");
    expect(ui.resource.text.startsWith("<!doctype html>")).toBe(true);
    expect(ui.resource.text).toContain("--wg-bg: #0f131c;");
    expect(ui.resource.text).toContain(".wg-badge {");

    // sandbox-safe: no scripts, no network, no url()
    expect(ui.resource.text).not.toContain("<script");
    expect(ui.resource.text).not.toMatch(/https?:\/\//);
    expect(ui.resource.text).not.toMatch(/url\s*\(/i);

    // the widgentic payload block still extracts (html resource is skipped)
    const extraction = extractWidgetPayload(result);
    expect(extraction).toMatchObject({ found: true, ok: true });
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.theme).toEqual({ bg: "#0f131c" });
    }

    // deterministic URI across renders
    const again = handleRenderWidget(styled, {
      widget: "badge",
      data: 2,
      format: "app"
    });
    const againUi = again.content[1] as { resource: { uri: string } };
    expect(againUi.resource.uri).toBe("ui://widgentic/page/badge");
  });

  it("app page may reference validated image sources and nothing else external", () => {
    const logo = "https://cdn.example/logo.png";
    const result = handleRenderWidget(catalog, {
      widget: "card",
      data: { title: "Co", fields: { logo } },
      format: "app"
    });
    expect(result.isError).toBeUndefined();
    const ui = result.content[1] as { resource: { text: string } };
    expect(ui.resource.text).toContain(`src="${logo}"`);
    expect(ui.resource.text).toContain('class="wg-img wg-img-thumb"');

    // Still script-free, and the img sources are the only external refs:
    expect(ui.resource.text).not.toContain("<script");
    expect(ui.resource.text).not.toContain("<link");
    expect(ui.resource.text).not.toMatch(/@import/i);
    const withoutImgs = ui.resource.text.replace(/<img\b[^>]*>/g, "");
    expect(withoutImgs).not.toMatch(/https?:\/\//);
    expect(withoutImgs).not.toMatch(/url\s*\(/i);
  });

  it("structuredContent.tree and html are projections of the same render", () => {
    for (const args of [
      { widget: "card", data: { title: "T", fields: { price: 9.99 } } },
      { widget: "table", data: [{ a: 1, avatar: "https://cdn.example/a.png" }] },
      { widget: "tree", data: { label: "r", children: [{ label: "l" }] } },
      { widget: "custom", data: [1, "two"] }
    ]) {
      const result = handleRenderWidget(catalog, args);
      const tree = result.structuredContent?.tree as WidgetNode;
      expect(tree).toBeDefined();
      expect(renderToHtml(tree)).toBe(result.structuredContent?.html);
      // Pure data: survives JSON round-tripping (what transports do to it).
      expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
    }
  });

  it("slim mode replaces the default HTML block with a confirmation line", () => {
    const args = { widget: "card", data: { a: 1 } };
    const full = handleRenderWidget(catalog, args);
    const slim = handleRenderWidget(catalog, args, { slim: true });

    expect(slim.content).toHaveLength(2);
    const line = slim.content[0];
    expect(line?.type).toBe("text");
    expect(line?.text).toContain("'card'");
    expect(line?.text).toContain("do not restate this data as text");
    expect(line?.text).not.toContain("<div");
    expect(slim.content[1]?.type).toBe("resource");

    // structuredContent is byte-identical between modes.
    expect(slim.structuredContent).toEqual(full.structuredContent);
  });

  it("explicit formats are never slimmed", () => {
    for (const format of ["html", "widget", "page", "app"]) {
      const explicit = handleRenderWidget(
        catalog,
        { widget: "card", data: { a: 1 }, format },
        { slim: true }
      );
      const reference = handleRenderWidget(catalog, {
        widget: "card",
        data: { a: 1 },
        format
      });
      expect(explicit).toEqual(reference);
    }
  });

  it("page-format text stays free of Hint notes while diagnostics still report", () => {
    const result = handleRenderWidget(catalog, {
      widget: "table",
      data: [{ a: 1 }],
      hints: { colums: ["a"] }, // deliberate typo
      format: "page"
    });
    expect(result.isError).toBeFalsy();
    const doc = result.content.find((b) => b.type === "text")?.text ?? "";
    // The page is a standalone document; agent-facing notes do not belong in it.
    expect(doc).not.toContain("Hint notes:");
    const sc = result.structuredContent as { diagnostics?: unknown[] };
    expect(sc.diagnostics?.length).toBeGreaterThan(0);
  });

  it("misaimed hints produce Hint notes and diagnostics without failing", () => {
    const result = handleRenderWidget(catalog, {
      widget: "table",
      data: [{ a: 1 }],
      hints: { colums: ["a"] }
    });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain("Hint notes:");
    expect(textOf(result)).toContain("did you mean 'columns'");
    const diagnostics = result.structuredContent?.diagnostics as Array<{
      code: string;
      hint: string;
    }>;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "UNKNOWN_HINT", hint: "colums" });
    // Markup unchanged by diagnostics.
    expect(textOf(result)).toContain('<table class="wg-table">');
  });

  it("hint notes reach the slim line too", () => {
    const result = handleRenderWidget(
      catalog,
      { widget: "table", data: [{ a: 1 }], hints: { colums: ["a"] } },
      { slim: true }
    );
    expect(result.content[0]?.text).toContain("Hint notes:");
  });

  it("coherent hints leave output untouched", () => {
    const result = handleRenderWidget(catalog, {
      widget: "table",
      data: [{ a: 1 }],
      hints: { columns: ["a"] }
    });
    expect(textOf(result)).not.toContain("Hint notes:");
    expect(result.structuredContent).not.toHaveProperty("diagnostics");
  });

  it("every successful result carries structuredContent for app templates", () => {
    const styled = createCatalog();
    styled.register(
      "badge",
      () => ({ tag: "span", attrs: { class: "wg-badge" }, children: ["hi"] }),
      {
        description: "badge",
        dataShape: "any",
        styles: { ".wg-badge": { color: "var(--wg-accent, #2563eb)" } }
      }
    );
    // default format
    const plain = handleRenderWidget(styled, {
      widget: "badge",
      data: 1,
      theme: { bg: "#0f131c" }
    });
    const sc = plain.structuredContent as {
      html: string;
      css: string;
      payload: { kind: string; theme?: unknown };
    };
    expect(sc.html).toContain('class="wg-badge"');
    expect(sc.css).toContain(".wg-badge {");
    expect(sc.css).toContain("--wg-bg: #0f131c;");
    // The theme block's selector matches the app template's dark-override
    // specificity, so an explicit theme wins on dark hosts too.
    expect(sc.css).toContain(':root, :root[data-theme="dark"] {');
    expect(sc.payload.kind).toBe("badge");

    // single-block formats carry it too
    for (const format of ["html", "widget", "page", "app"]) {
      const result = handleRenderWidget(styled, {
        widget: "badge",
        data: 1,
        format
      });
      expect(result.structuredContent).toBeDefined();
    }

    // errors carry none
    const failed = handleRenderWidget(styled, { widget: "nope", data: 1 });
    expect(failed.structuredContent).toBeUndefined();
  });

  it("theme applies to page output and fails structurally when unsafe", () => {
    const input = { widget: "card", data: { title: "T" } };

    const themed = handleRenderWidget(catalog, {
      ...input,
      format: "page",
      theme: { bg: "#0f131c", accent: "#7aa2f7" }
    });
    const doc = textOf(themed);
    expect(doc).toContain("--wg-bg: #0f131c;");
    expect(doc).toContain("--wg-accent: #7aa2f7;");

    const unsafe = handleRenderWidget(catalog, {
      ...input,
      format: "page",
      theme: { bg: "url(https://evil.example)" }
    });
    expect(unsafe.isError).toBe(true);
    expect(JSON.parse(textOf(unsafe)).path).toBe("theme.bg");

    // valid theme without page format: not in the fragment, but embedded in
    // the payload so natively mounting hosts can honor it
    const offPage = handleRenderWidget(catalog, {
      ...input,
      theme: { bg: "#111" }
    });
    expect(offPage.isError).toBeUndefined();
    expect(textOf(offPage)).not.toContain("--wg-bg");
    const extraction = extractWidgetPayload(offPage);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.theme).toEqual({ bg: "#111" });
    } else {
      expect.fail("expected a successful extraction");
    }
  });

  it("page output includes the rendered kind's registered styles", () => {
    const styled = createCatalog();
    styled.register("badge", () => ({ tag: "span", attrs: { class: "wg-badge" } }), {
      description: "badge",
      dataShape: "any",
      styles: {
        ".wg-badge": { color: "var(--wg-accent, #2563eb)" },
        body: { display: "none" } // unsafe: must be dropped
      }
    });
    const page = handleRenderWidget(styled, {
      widget: "badge",
      data: 1,
      format: "page"
    });
    const doc = textOf(page);
    expect(doc).toContain(".wg-badge {");
    expect(doc).toContain("color: var(--wg-accent, #2563eb);");
    // the unsafe body rule was dropped: the only body rule is the themed one
    expect(doc.match(/body \{/g)).toHaveLength(1);
    expect(doc).not.toContain("body {\n  display: none");

    // other formats carry no styles (fragment only)
    const fragment = handleRenderWidget(styled, { widget: "badge", data: 1 });
    expect(textOf(fragment)).not.toContain(".wg-badge {");
  });

  it("enforces dataSchema with dotted paths and skips coercion for string schemas", () => {
    const strict = createCatalog();
    registerTemplate(
      strict,
      "invoice",
      {
        tag: "div",
        children: [{ each: "lines", template: { tag: "li", children: [{ bind: "item" }] } }]
      },
      {
        description: "Invoice",
        dataShape: "{ customer, lines }",
        dataSchema: {
          type: "object",
          required: ["customer", "lines"],
          properties: { lines: { type: "array" } }
        }
      }
    );
    const missing = handleRenderWidget(strict, {
      widget: "invoice",
      data: { customer: "Ada" }
    });
    expect(missing.isError).toBe(true);
    expect(JSON.parse(textOf(missing))).toMatchObject({
      code: "MISSING_FIELD",
      path: "data.lines"
    });

    strict.register("verbatim", (payload) => String(payload.data), {
      description: "string kind",
      dataShape: "string",
      dataSchema: { type: "string" }
    });
    const literal = '[{"a":1}]';
    const result = handleRenderWidget(strict, {
      widget: "verbatim",
      data: literal
    });
    const extraction = extractWidgetPayload(result);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.data).toBe(literal);
    } else {
      expect.fail("expected a successful extraction");
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

describe("named themes over the wire", () => {
  const catalog = createCatalog();
  const themes = createThemeRegistry();
  themes.register({ name: "brand", label: "Brand", tokens: { accent: "#ff5a1f" } });

  it("resolves a registered name to its tokens", () => {
    const result = handleRenderWidget(
      catalog,
      { widget: "card", data: { a: 1 }, format: "page", theme: "dark" },
      { themes }
    );
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain(`--wg-bg: ${darkTheme.bg}`);
    // The payload carries the RESOLVED map, not the name.
    const extraction = extractWidgetPayload(result);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.theme).toEqual(darkTheme);
    } else {
      throw new Error("payload missing");
    }
  });

  it("unknown names are self-sufficient errors", () => {
    const result = handleRenderWidget(
      catalog,
      { widget: "card", data: { a: 1 }, theme: "midnight" },
      { themes }
    );
    expect(result.isError).toBe(true);
    const error = JSON.parse(textOf(result)) as Record<string, string>;
    expect(error.code).toBe("UNKNOWN_THEME");
    expect(error.path).toBe("theme");
    expect(error.message).toContain("brand");
    expect(error.message).toContain("dark");
  });

  it("inline token maps still work unchanged", () => {
    const result = handleRenderWidget(catalog, {
      widget: "card",
      data: { a: 1 },
      format: "page",
      theme: { bg: "#0f131c" }
    });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain("--wg-bg: #0f131c");
  });

  it("a name with no registry supplied reports no available themes", () => {
    const result = handleRenderWidget(catalog, {
      widget: "card",
      data: { a: 1 },
      theme: "dark"
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("UNKNOWN_THEME");
  });
});

describe("handleListThemes", () => {
  it("lists every registered theme with its tokens", () => {
    const themes = createThemeRegistry();
    themes.register({ name: "brand", tokens: { accent: "#ff5a1f" } });
    const listing = JSON.parse(textOf(handleListThemes(themes))) as {
      themes: { name: string; tokens: Record<string, string> }[];
    };
    const names = listing.themes.map((t) => t.name);
    expect(names).toEqual(["light", "dark", "brand"]);
    expect(listing.themes[2]?.tokens.accent).toBe("#ff5a1f");
  });

  it("is a declared tool", () => {
    expect(LIST_THEMES_TOOL.name).toBe("list_themes");
    expect(LIST_THEMES_TOOL.inputSchema).toMatchObject({ type: "object" });
  });
});

describe("list_theme_tokens documents custom variables", () => {
  it("states the x-* rule", () => {
    const listing = JSON.parse(textOf(handleListThemeTokens())) as {
      rules: string;
    };
    expect(listing.rules).toContain("x-");
    expect(listing.rules).toContain("custom variables");
  });

  it("both theme tools point agents at the importable entry shape", () => {
    // A theme worth building is usually worth KEEPING: the rules text must
    // steer agents to deliver the { name, ..., tokens } entry for designer
    // import, not just the one-render inline map.
    const tokens = JSON.parse(textOf(handleListThemeTokens())) as { rules: string };
    expect(tokens.rules).toContain("{ name, label?, description?, tokens }");
    expect(tokens.rules).toContain("widgentic.dev");
    expect(tokens.rules).toContain("get_authoring_guide");
    const themes = JSON.parse(textOf(handleListThemes(createThemeRegistry()))) as {
      rules: string;
    };
    expect(themes.rules).toContain("{ name, label?, description?, tokens }");
    expect(themes.rules).toContain("get_authoring_guide");
  });
});


describe("group renders through render_widget", () => {
  /** Two template kinds with registered styles — the stored-custom shape. */
  function catalogWithStyledKinds(): WidgetCatalog {
    const catalog = createCatalog();
    registerTemplate(
      catalog,
      "person-card",
      { tag: "div", attrs: { class: "wg-person" }, children: [{ bind: "name" }] },
      {
        description: "Person",
        dataShape: "{ name }",
        styles: { ".wg-person": { color: "var(--wg-accent, #2563eb)" } }
      }
    );
    registerTemplate(
      catalog,
      "badge",
      { tag: "span", attrs: { class: "wg-badge" }, children: [{ bind: "label" }] },
      {
        description: "Badge",
        dataShape: "{ label }",
        styles: { ".wg-badge": { "font-weight": "700" } }
      }
    );
    return catalog;
  }

  it("mixed built-in and custom kinds render in one result", () => {
    const result = handleRenderWidget(catalogWithStyledKinds(), {
      widget: "group",
      data: {
        items: [
          { kind: "card", data: { title: "Ada" } },
          { kind: "person-card", data: { name: "Lin" } }
        ]
      }
    });
    expect(result.isError).toBeUndefined();
    const html = String(result.structuredContent?.html);
    expect(html).toContain("wg-group");
    expect(html).toContain("wg-card");
    expect(html).toContain("wg-person");
    const extracted = extractWidgetPayload(result);
    expect(extracted.found && extracted.ok && extracted.payload.kind).toBe("group");
  });

  it("css unions each item kind's styles exactly once", () => {
    const result = handleRenderWidget(catalogWithStyledKinds(), {
      widget: "group",
      data: {
        items: [
          { kind: "person-card", data: { name: "A" } },
          { kind: "badge", data: { label: "ok" } },
          { kind: "person-card", data: { name: "B" } }
        ]
      }
    });
    const css = String(result.structuredContent?.css);
    expect(css.split(".wg-person {").length - 1).toBe(1);
    expect(css.split(".wg-badge {").length - 1).toBe(1);
    // page format carries the same union
    const page = handleRenderWidget(catalogWithStyledKinds(), {
      widget: "group",
      format: "page",
      data: {
        items: [
          { kind: "person-card", data: { name: "A" } },
          { kind: "badge", data: { label: "ok" } }
        ]
      }
    });
    const doc = textOf(page);
    expect(doc).toContain(".wg-person {");
    expect(doc).toContain(".wg-badge {");
  });

  it("item hint diagnostics are re-pathed under their item", () => {
    const result = handleRenderWidget(createCatalog(), {
      widget: "group",
      data: {
        items: [
          { kind: "card", data: { title: "A" } },
          { kind: "table", data: [{ a: 1 }], hints: { colums: ["a"] } }
        ]
      },
      hints: { layout: "mosaic" }
    });
    expect(result.isError).toBeUndefined();
    const diagnostics = result.structuredContent?.diagnostics as {
      hint: string;
    }[];
    const hints = diagnostics.map((d) => d.hint);
    expect(hints).toContain("layout");
    expect(hints).toContain("data.items[1].hints.colums");
    expect(textOf(result)).toContain("Hint notes:");
  });

  it("item errors surface with their indexed path", () => {
    const result = handleRenderWidget(createCatalog(), {
      widget: "group",
      data: { items: [{ kind: "card", data: {} }, { kind: "ghost", data: {} }] }
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("data.items[1].kind");
  });

  it("the tool description steers toward one group render", () => {
    expect(RENDER_WIDGET_TOOL.description).toContain("'group'");
    expect(RENDER_WIDGET_TOOL.description).toContain("instead of calling repeatedly");
  });
});

describe("table fieldFormat preserves typed payload values", () => {
  it("the render shows the formatted cell while the payload keeps the number", () => {
    const result = handleRenderWidget(createCatalog(), {
      widget: "table",
      data: [{ total: 11471334.78 }],
      hints: { fieldFormat: { total: "${value}" } },
      meta: { title: "Holdings" }
    });
    expect(result.isError).toBeUndefined();
    expect(String(result.structuredContent?.html)).toContain("$11471334.78");
    expect(String(result.structuredContent?.html)).toContain("Holdings");
    const extracted = extractWidgetPayload(result);
    expect(extracted.found && extracted.ok).toBe(true);
    if (!(extracted.found && extracted.ok)) return;
    expect((extracted.payload.data as { total: number }[])[0]?.total).toBe(11471334.78);
  });
});
