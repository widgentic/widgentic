import { describe, expect, it } from "vitest";
import { weatherWidget, invoiceWidget } from "@widgentic-examples/mcp-server/widgets";
import { createWidgenticHost } from "../index.js";
import {
  EXECUTE_ACTION_TOOL,
  GET_AUTHORING_GUIDE_TOOL,
  LIST_ACTIONS_TOOL,
  LIST_SCHEMAS_TOOL,
  LIST_THEME_TOKENS_TOOL,
  LIST_THEMES_TOOL,
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  PREVIEW_WIDGET_TOOL,
  APP_ONLY_VISIBILITY,
  APP_TEMPLATE_RESOURCE,
  WIDGET_PAGE_RESOURCE
} from "../../server/definitions.js";
import { handleListWidgets, handleListThemes, handlePreviewWidget, handleRenderWidget } from "../../server/handlers.js";
import { composeCatalogEntries, composeThemeEntries } from "../../store/compose.js";

interface ToolResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

const brand = { name: "brand", tokens: { accent: "#0b6e4f" } };
const config = { widgets: [invoiceWidget, weatherWidget], themes: [brand] };

function call(host: ReturnType<typeof createWidgenticHost>, tool: string, args: unknown, slim = false): ToolResult {
  return JSON.parse(host.call(tool, JSON.stringify(args), slim)) as ToolResult;
}

/** Every action descriptor the render tree carries, parsed. */
function descriptors(node: unknown, into: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (typeof node !== "object" || node === null) return into;
  const element = node as { attrs?: Record<string, string>; children?: unknown[] };
  const raw = element.attrs?.["data-wg-action"];
  if (typeof raw === "string") into.push(JSON.parse(raw) as Record<string, unknown>);
  for (const child of element.children ?? []) descriptors(child, into);
  return into;
}

describe("createWidgenticHost", () => {
  it("serves exactly what the Node path serves for the same configuration", () => {
    const host = createWidgenticHost(JSON.stringify(config));
    const { catalog } = composeCatalogEntries({ widgets: config.widgets }, { httpDisabled: "unresolved" });
    const { registry } = composeThemeEntries(config.themes);
    expect(host.call("list_widgets", "{}", false)).toBe(JSON.stringify(handleListWidgets(catalog)));
    expect(host.call("list_themes", "{}", false)).toBe(JSON.stringify(handleListThemes(registry)));
    const partial = { widget: "invoice", data: { customer: "Ada" }, theme: "brand" };
    expect(host.call("preview_widget", JSON.stringify(partial), false)).toBe(
      JSON.stringify(handlePreviewWidget(catalog, partial, { themes: registry }))
    );
    for (const slim of [false, true]) {
      for (const args of [
        { widget: "invoice", data: invoiceWidget.descriptor.dataExample },
        { widget: "weather", data: weatherWidget.descriptor.dataExample, theme: "brand" },
        { widget: "table", data: [{ a: 1 }], format: "page" },
        { widget: "nope", data: {} }
      ]) {
        expect(host.call("render_widget", JSON.stringify(args), slim)).toBe(
          JSON.stringify(handleRenderWidget(catalog, args, { slim, themes: registry }))
        );
      }
    }
  });

  it("composes a clean configuration without problems", () => {
    expect(createWidgenticHost(JSON.stringify(config)).problems()).toBe("[]");
    expect(createWidgenticHost("{}").problems()).toBe("[]");
  });

  it("refuses invalid entries at the door and serves none of them", () => {
    const host = createWidgenticHost(
      JSON.stringify({
        widgets: [
          { kind: "evil", template: { tag: "script", children: ["x"] }, descriptor: { description: "x" } },
          { kind: "card", template: { tag: "p" }, descriptor: { description: "shadow" } },
          invoiceWidget
        ],
        themes: [{ name: "dark", tokens: { accent: "#000000" } }],
        schemas: [{ name: "bad name!", schema: {} }]
      })
    );
    const problems = JSON.parse(host.problems()) as { section: string; index: number; code: string }[];
    expect(problems.map(({ section, index, code }) => ({ section, index, code }))).toEqual([
      { section: "schemas", index: 0, code: "INVALID_IDENTIFIER" },
      { section: "widgets", index: 0, code: "INVALID_TEMPLATE" },
      { section: "widgets", index: 1, code: "RESERVED_KIND" },
      { section: "themes", index: 0, code: "RESERVED_THEME" }
    ]);
    const kinds = (JSON.parse(call(host, "list_widgets", {}).content[0]?.text ?? "[]") as { kind: string }[]).map(
      (entry) => entry.kind
    );
    expect(kinds).toContain("invoice");
    expect(kinds).not.toContain("evil");
    const card = call(host, "render_widget", { widget: "card", data: { title: "T" } });
    expect(String(card.structuredContent?.html)).toContain('class="wg-card"');
  });

  it("reports a malformed configuration instead of throwing", () => {
    for (const text of ["not json", "[]", JSON.stringify({ widgets: {} })]) {
      const problems = JSON.parse(createWidgenticHost(text).problems()) as { index: number; code: string }[];
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({ index: -1, code: "INVALID_SHAPE" });
    }
  });

  it("serves the exported definitions of the render-side tools, the preview marked app-only", () => {
    const definitions = JSON.parse(createWidgenticHost("{}").definitions()) as unknown[];
    expect(definitions).toEqual([
      LIST_WIDGETS_TOOL,
      LIST_THEME_TOKENS_TOOL,
      LIST_THEMES_TOOL,
      LIST_SCHEMAS_TOOL,
      GET_AUTHORING_GUIDE_TOOL,
      RENDER_WIDGET_TOOL,
      { ...PREVIEW_WIDGET_TOOL, visibility: [...APP_ONLY_VISIBILITY] }
    ]);
    const names = definitions.map((definition) => (definition as { name: string }).name);
    expect(names).not.toContain(EXECUTE_ACTION_TOOL.name);
    expect(names).not.toContain(LIST_ACTIONS_TOOL.name);
  });

  it("answers unknown tools as results, prototype names included", () => {
    const host = createWidgenticHost("{}");
    for (const name of ["execute_action", "list_actions", "constructor", "__proto__", ""]) {
      const result = call(host, name, {});
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({ code: "UNKNOWN_TOOL", path: "name" });
    }
  });

  it("is render-only: http actions disabled, prompt actions live, no load", () => {
    const host = createWidgenticHost(JSON.stringify(config));
    const result = call(host, "render_widget", { widget: "weather", data: weatherWidget.descriptor.dataExample });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).not.toHaveProperty("load");
    expect(result.structuredContent).not.toHaveProperty("loads");
    const found = descriptors(result.structuredContent?.tree);
    const http = found.filter((descriptor) => descriptor.kind === "http");
    const prompt = found.filter((descriptor) => descriptor.kind === "prompt");
    expect(http.length).toBeGreaterThan(0);
    expect(prompt.length).toBeGreaterThan(0);
    for (const descriptor of http) expect(descriptor.disabled).toBe("unresolved");
    for (const descriptor of prompt) expect(descriptor).not.toHaveProperty("disabled");
  });

  it("serves configured schemas and resolves widget references to them", () => {
    const person = { name: "person", schema: { type: "object", properties: { name: { type: "string" } } } };
    const widget = {
      kind: "person-card",
      template: { tag: "p", children: [{ bind: "name" }] },
      descriptor: { description: "A person.", dataSchemaRef: "person" }
    };
    const host = createWidgenticHost(JSON.stringify({ widgets: [widget], schemas: [person, person] }));
    expect(JSON.parse(host.problems())).toEqual([
      expect.objectContaining({ section: "schemas", index: 1, code: "DUPLICATE_NAME" })
    ]);
    const listing = JSON.parse(call(host, "list_schemas", {}).content[0]?.text ?? "{}") as { schemas: unknown[] };
    expect(listing.schemas).toEqual([person]);
    const kinds = JSON.parse(call(host, "list_widgets", {}).content[0]?.text ?? "[]") as { kind: string; dataSchema?: unknown }[];
    expect(kinds.find((entry) => entry.kind === "person-card")?.dataSchema).toEqual(person.schema);
    const missing = createWidgenticHost(JSON.stringify({ widgets: [widget] }));
    expect(JSON.parse(missing.problems())).toEqual([expect.objectContaining({ code: "UNKNOWN_SCHEMA" })]);
  });

  it("rejects unparseable arguments in the handler's own vocabulary", () => {
    const result = JSON.parse(createWidgenticHost("{}").call("render_widget", "{", false)) as ToolResult;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({ code: "INVALID_TYPE" });
  });

  it("serves the app template and the preview pages", () => {
    const host = createWidgenticHost(JSON.stringify(config));
    expect(host.appTemplate()).toContain('<div id="wg-root"></div>');
    expect(host.widgetPage("invoice")).toContain("wg-invoice");
    expect(host.widgetPage("nope")).toBe("<!doctype html><body>Unknown widget kind 'nope'.</body>");
  });

  it("names its resources from the assembly's constants", () => {
    expect(JSON.parse(createWidgenticHost("{}").resources())).toEqual({
      appTemplate: APP_TEMPLATE_RESOURCE,
      widgetPage: WIDGET_PAGE_RESOURCE
    });
  });

  it("reports its version as 'source' when run unbundled", () => {
    expect(createWidgenticHost("{}").version()).toBe("source");
  });
});
