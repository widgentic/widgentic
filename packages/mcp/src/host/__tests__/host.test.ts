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
import { composeCatalogEntries, composeResourceDomains, composeThemeEntries, composeThemes } from "../../store/compose.js";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createWidgenticServer } from "../../server/server.js";
import { createMemoryStore } from "../../store/memory.js";

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
    // The annotations ride along, so an embedding host restates none.
    for (const definition of definitions) expect(definition).toHaveProperty("annotations.readOnlyHint", true);
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

describe("createWidgenticHost settings", () => {
  const styled = { name: "brand", tokens: { accent: "#ff5a1f" }, styles: { ".wg-btn": { "font-weight": "600" } } };
  const night = { name: "night", tokens: { bg: "#101010", fg: "#f0f0f0", accent: "#8ab4f8" } };
  const themed = { widgets: [invoiceWidget], themes: [styled, night] };

  /** The Node path for a principal whose stored settings are `settings`. */
  async function nodeRegistry(settings: Record<string, unknown>) {
    const store = createMemoryStore([
      { principal: { id: "p", scopes: ["read"] }, themes: themed.themes, settings }
    ]);
    return (await composeThemes(store, "p")).value;
  }

  it("chooses the default themes as a principal's stored settings do", async () => {
    for (const defaultThemes of [{ light: "brand" }, { dark: "night" }, { light: "brand", dark: "night" }, { light: "brand", dark: "brand" }]) {
      const host = createWidgenticHost(JSON.stringify({ ...themed, settings: { defaultThemes } }));
      expect(host.problems()).toBe("[]");
      const registry = await nodeRegistry({ defaultThemes });
      const { catalog } = composeCatalogEntries({ widgets: themed.widgets }, { httpDisabled: "unresolved" });
      for (const args of [
        { widget: "invoice", data: invoiceWidget.descriptor.dataExample },
        { widget: "invoice", data: invoiceWidget.descriptor.dataExample, format: "page" }
      ]) {
        expect(host.call("render_widget", JSON.stringify(args), true)).toBe(
          JSON.stringify(handleRenderWidget(catalog, args, { slim: true, themes: registry }))
        );
      }
      const preview = { widget: "invoice", data: { customer: "Ada" } };
      expect(host.call("preview_widget", JSON.stringify(preview), false)).toBe(
        JSON.stringify(handlePreviewWidget(catalog, preview, { themes: registry }))
      );
      expect(host.call("list_themes", "{}", false)).toBe(JSON.stringify(handleListThemes(registry)));
    }
    const lightOnly = createWidgenticHost(JSON.stringify({ ...themed, settings: { defaultThemes: { light: "brand" } } }));
    const listing = JSON.parse(call(lightOnly, "list_themes", {}).content[0]?.text ?? "{}") as { defaults: unknown };
    expect(listing.defaults).toEqual({ light: "brand", dark: "dark" });
    // Pages take the light default: its shared classes reach the preview page.
    expect(lightOnly.widgetPage("invoice")).toContain(".wg-btn");
    expect(createWidgenticHost(JSON.stringify(themed)).widgetPage("invoice")).not.toContain(".wg-btn");
  });

  it("reports a default naming no served theme and keeps that mode's built-in", () => {
    const configured = { ...themed, themes: [...themed.themes, { name: "dark", tokens: { accent: "#000000" } }] };
    for (const name of ["ghost", "light", "dark"]) {
      const host = createWidgenticHost(JSON.stringify({ ...configured, settings: { defaultThemes: { light: "brand", dark: name } } }));
      const problems = JSON.parse(host.problems()) as { section: string; index: number; name: string; code: string }[];
      expect(problems.filter((problem) => problem.section === "settings")).toEqual([
        expect.objectContaining({ section: "settings", index: -1, name: "defaultThemes.dark", code: "UNKNOWN_THEME" })
      ]);
      const listing = JSON.parse(call(host, "list_themes", {}).content[0]?.text ?? "{}") as { defaults: unknown };
      expect(listing.defaults).toEqual({ light: "brand", dark: "dark" });
    }
  });

  it("reports malformed settings instead of throwing, keeping the built-in defaults", () => {
    for (const settings of ["brand", [], { fonts: {} }, { defaultThemes: "brand" }, { defaultThemes: { dusk: "brand" } }, { defaultThemes: { light: 1 } }]) {
      const host = createWidgenticHost(JSON.stringify({ ...themed, settings }));
      const problems = JSON.parse(host.problems()) as { section: string; code: string }[];
      expect(problems).toEqual([expect.objectContaining({ section: "settings", code: "INVALID_SHAPE" })]);
      const listing = JSON.parse(call(host, "list_themes", {}).content[0]?.text ?? "{}") as { defaults: unknown };
      expect(listing.defaults).toEqual({ light: "light", dark: "dark" });
    }
  });

  it("leaves every output unchanged without settings, or with null settings", () => {
    const without = createWidgenticHost(JSON.stringify(themed));
    const withNull = createWidgenticHost(JSON.stringify({ ...themed, settings: null }));
    const withEmpty = createWidgenticHost(JSON.stringify({ ...themed, settings: {} }));
    const args = JSON.stringify({ widget: "invoice", data: invoiceWidget.descriptor.dataExample });
    for (const host of [withNull, withEmpty]) {
      expect(host.problems()).toBe("[]");
      expect(host.call("render_widget", args, false)).toBe(without.call("render_widget", args, false));
      expect(host.call("list_themes", "{}", false)).toBe(without.call("list_themes", "{}", false));
      expect(host.widgetPage("invoice")).toBe(without.widgetPage("invoice"));
    }
  });
});

describe("createWidgenticHost resource domains", () => {
  type Resources = { appTemplate: { resourceDomains?: string[] } };
  const declared = (host: ReturnType<typeof createWidgenticHost>) =>
    (JSON.parse(host.resources()) as Resources).appTemplate.resourceDomains;

  /** What the Node assembly declares for a principal storing `settings`, behind the operator's `operator`. */
  async function nodeDeclaration(operator: string[], settings: Record<string, unknown>): Promise<unknown> {
    const store = createMemoryStore([{ principal: { id: "p", scopes: ["read"] }, settings }]);
    const principal = (await composeResourceDomains(store, "p")).value;
    const server = createWidgenticServer({ resourceDomains: [...operator, ...principal] });
    const client = new Client({ name: "t", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const app = (await client.listResources()).resources.find((r) => r.uri === "ui://widgentic/app.html");
    await client.close();
    return (app?._meta?.ui as { csp?: { resourceDomains?: unknown } } | undefined)?.csp?.resourceDomains;
  }

  it("reports declared domains canonical, operator first, deduplicated", async () => {
    const operator = ["assets.example.org"];
    const settings = { resourceDomains: ["CDN.example.com", "https://*.example.net/", "https://assets.example.org"] };
    const host = createWidgenticHost(JSON.stringify({ resourceDomains: operator, settings }));
    expect(host.problems()).toBe("[]");
    expect(declared(host)).toEqual(["https://assets.example.org", "https://cdn.example.com", "https://*.example.net"]);
    expect(declared(host)).toEqual(await nodeDeclaration(operator, settings));
  });

  it("gives no key, and the constants unchanged, when nothing is declared", () => {
    const none = createWidgenticHost("{}");
    expect(declared(none)).toBeUndefined();
    for (const config of [{ resourceDomains: [] }, { settings: { resourceDomains: [] } }, { settings: null }]) {
      expect(createWidgenticHost(JSON.stringify(config)).resources()).toBe(none.resources());
    }
  });

  it("reports refused domains under their section and declares only the rest", () => {
    const host = createWidgenticHost(
      JSON.stringify({ resourceDomains: ["http://old.example.com"], settings: { resourceDomains: ["cdn.example.com", "localhost"] } })
    );
    expect(JSON.parse(host.problems())).toEqual([
      expect.objectContaining({ section: "resourceDomains", index: 0, name: "http://old.example.com", code: "INVALID_DOMAIN" }),
      expect.objectContaining({ section: "settings", index: -1, name: "resourceDomains.localhost", code: "INVALID_DOMAIN" })
    ]);
    expect(declared(host)).toEqual(["https://cdn.example.com"]);
  });

  it("delivers the settings' covered stylesheets and reports the rest", () => {
    const icons = { type: "stylesheet", href: "https://fonts.googleapis.com/icon?family=Material+Icons" };
    const uncovered = { type: "stylesheet", href: "https://cdn.example.org/a.css" };
    const script = { type: "script", href: "https://fonts.googleapis.com/x.js" };
    const host = createWidgenticHost(
      JSON.stringify({ resourceDomains: ["fonts.googleapis.com"], settings: { resources: [icons, uncovered, script] } })
    );
    expect(JSON.parse(host.problems())).toEqual([
      expect.objectContaining({ section: "settings", index: -1, name: `resources.${script.href}`, code: "INVALID_RESOURCE" }),
      expect.objectContaining({ section: "settings", index: -1, name: `resources.${uncovered.href}`, code: "UNDECLARED_DOMAIN" })
    ]);
    const render = JSON.parse(host.call("render_widget", JSON.stringify({ widget: "card", data: { title: "A" } }), false));
    expect(render.structuredContent.resources).toEqual([icons]);
    const preview = JSON.parse(host.call("preview_widget", JSON.stringify({ widget: "card", data: { title: "A" } }), false));
    expect(preview.structuredContent.resources).toEqual([icons]);
    expect(JSON.parse(JSON.parse(host.call("list_themes", "{}", false)).content[0].text).resources).toEqual([icons]);
    expect(host.widgetPage("card")).toContain(`<link rel="stylesheet" href="${icons.href}">`);
    const none = JSON.parse(createWidgenticHost("{}").call("render_widget", JSON.stringify({ widget: "card", data: { title: "A" } }), false));
    expect(none.structuredContent).not.toHaveProperty("resources");
  });

  it("reports a malformed operator list or settings section as shape", () => {
    const listless = createWidgenticHost(JSON.stringify({ resourceDomains: "cdn.example.com" }));
    expect(JSON.parse(listless.problems())).toEqual([expect.objectContaining({ section: "resourceDomains", code: "INVALID_SHAPE" })]);
    const tooMany = Array.from({ length: 21 }, (_v, n) => `cdn${n}.example.com`);
    for (const resourceDomains of ["cdn.example.com", [42], tooMany]) {
      const host = createWidgenticHost(JSON.stringify({ settings: { resourceDomains } }));
      expect(JSON.parse(host.problems())).toEqual([expect.objectContaining({ section: "settings", code: "INVALID_SHAPE" })]);
      expect(declared(host)).toBeUndefined();
    }
  });
});

