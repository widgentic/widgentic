// @vitest-environment happy-dom
/**
 * The load tools refuse what saving would refuse (designer-webmcp), so an
 * agent learns at the draft what the store would otherwise answer at Save:
 * a reserved or malformed widget kind, a reserved or malformed theme name.
 * What the store accepts but an author likely did not mean — a missing
 * dataShape, a schema keyword the validator would ignore — is a warning.
 * Preview tokens layer over the person's chosen theme, never replace it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createThemeRegistry } from "@widgentic/core";
import { createDesigner, createSchemaDesigner, createThemeDesigner } from "@widgentic/designer";
import type { DesignerHandle, SchemaDesignerHandle, ThemeDesignerHandle } from "@widgentic/designer";
import { designerTools } from "../index.js";
import { host, run } from "./helpers.js";

let widget: DesignerHandle;
let theme: ThemeDesignerHandle;
let schema: SchemaDesignerHandle;
let root: HTMLElement;
const tools = designerTools({ widget: () => widget, widgetIfMounted: () => widget, theme: () => theme });
const schemaTools = designerTools({ schema: () => schema });

const definition = (kind: string) => ({
  kind,
  template: { tag: "div", children: [{ bind: "title" }] },
  descriptor: { description: "d", dataShape: "{ title }", dataExample: { title: "T" } }
});

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  root = host();
  widget = createDesigner(root, { themes: createThemeRegistry().list() });
  theme = createThemeDesigner(host());
  schema = createSchemaDesigner(host());
});

describe("load tools refuse what saving would refuse", () => {
  it.each([
    ["a built-in kind", "table", "RESERVED_KIND"],
    ["a kind with a space", "my widget", "INVALID_IDENTIFIER"]
  ])("draft_load and definition_check refuse %s", async (_label, kind, code) => {
    const before = widget.getDraft().kind;
    for (const tool of ["widgentic_widget_draft_load", "widgentic_widget_definition_check"]) {
      const result = await run(tools, tool, { definition: definition(kind) });
      expect(result.ok, tool).toBe(false);
      expect(result.code, tool).toBe("REJECTED");
      expect(JSON.stringify(result.errors), tool).toContain(code);
    }
    expect(widget.getDraft().kind).toBe(before);
  });

  it.each([
    ["a built-in name", "light", "RESERVED_THEME"],
    ["a name with a space", "my theme", "INVALID_IDENTIFIER"]
  ])("theme_load refuses %s", async (_label, name, code) => {
    const result = await run(tools, "widgentic_theme_load", { entry: { name, tokens: {} } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REJECTED");
    expect(JSON.stringify(result.errors)).toContain(code);
    expect(theme.getTheme().name).not.toBe(name);
  });

  it("tools that reload the draft are not refused for a kind or name the person typed", async () => {
    root = host();
    widget = createDesigner(root, { initialWidget: definition("my widget") });
    expect(widget.getDraft().kind).toBe("my widget");
    const data = await run(tools, "widgentic_widget_example_data_set", { data: { title: "Now" } });
    expect(data.ok).toBe(true);
    expect((data.diagnostics as { kind?: string }).kind).toContain("INVALID_IDENTIFIER");
    expect(widget.getDraft().descriptor.dataExample).toEqual({ title: "Now" });
    // Changing to a kind Save would refuse is still refused.
    expect((await run(tools, "widgentic_widget_draft_load", { definition: definition("table") })).code).toBe("REJECTED");

    theme = createThemeDesigner(host(), { initialTheme: { name: "dark", tokens: {} } });
    const tokens = await run(tools, "widgentic_theme_tokens_set", { tokens: { accent: "#0a84ff" } });
    expect(tokens.ok).toBe(true);
    expect(theme.getTheme()).toMatchObject({ name: "dark", tokens: { accent: "#0a84ff" } });
    expect((await run(tools, "widgentic_theme_load", { entry: { name: "light", tokens: {} } })).code).toBe("REJECTED");
  });

  it("resolves a shared schema reference against the host's saved schemas", async () => {
    const inbox = { name: "email-inbox", schema: { type: "object", properties: { unreadCount: { type: "number" } }, required: ["unreadCount"] } };
    const referencing = (example: unknown) => ({
      kind: "inbox-card",
      template: { tag: "div", children: [{ bind: "unreadCount" }] },
      descriptor: { description: "d", dataShape: "{ unreadCount }", dataSchemaRef: "email-inbox", dataExample: example }
    });
    // Opened the way the apps open a stored widget: mounted with it, no tool call yet.
    root = host();
    widget = createDesigner(root, { schemas: [inbox], initialWidget: referencing({ unreadCount: 3 }) });
    const got = await run(tools, "widgentic_widget_draft_get");
    expect((got.diagnostics as { schemaRef?: string }).schemaRef).toBeUndefined();
    const good = await run(tools, "widgentic_widget_definition_check", { definition: referencing({ unreadCount: 3 }) });
    expect((good.diagnostics as { schemaRef?: string }).schemaRef).toBeUndefined();
    // The example is checked against the resolved schema.
    const bad = await run(tools, "widgentic_widget_definition_check", { definition: referencing({ unreadCount: "three" }) });
    expect((bad.diagnostics as { example?: { code: string } }).example?.code).toBe("INVALID_TYPE");
    // A reference that names no saved schema is still reported.
    const typo = await run(tools, "widgentic_widget_definition_check", { definition: { ...referencing({ unreadCount: 3 }), descriptor: { ...referencing({}).descriptor, dataSchemaRef: "email-inbx" } } });
    expect((typo.diagnostics as { schemaRef?: string }).schemaRef).toContain("'email-inbx'");
    // Carrying both is refused, as Save refuses it.
    const both = await run(tools, "widgentic_widget_definition_check", { definition: { ...referencing({ unreadCount: 3 }), descriptor: { ...referencing({ unreadCount: 3 }).descriptor, dataSchema: { type: "object" } } } });
    expect(both.code).toBe("REJECTED");
  });

  it("checks through the mounted designer without showing or remounting anything", async () => {
    const inbox = { name: "email-inbox", schema: { type: "object" } };
    root = host();
    widget = createDesigner(root, { schemas: [inbox] });
    let shown = 0;
    const sourced = designerTools({ widget: () => { shown++; return widget; }, widgetIfMounted: () => widget });
    const result = await run(sourced, "widgentic_widget_definition_check", {
      definition: { ...definition("inbox-card"), descriptor: { ...definition("inbox-card").descriptor, dataSchemaRef: "email-inbox" } }
    });
    expect(result.ok).toBe(true);
    expect((result.diagnostics as { schemaRef?: string }).schemaRef).toBeUndefined();
    expect(result).not.toHaveProperty("diagnosticsDerived");
    expect(shown).toBe(0);
  });

  it.each([
    ["a numeric reference", { dataSchemaRef: 5 }],
    ["a reference with a space", { dataSchemaRef: "a b" }],
    ["an empty reference", { dataSchemaRef: "" }],
    ["a null schema", { dataSchema: null }]
  ])("refuses %s at the draft, and the tools keep working", async (_label, extra) => {
    const bad = { ...definition("bad-card"), descriptor: { ...definition("bad-card").descriptor, ...extra } };
    for (const tool of ["widgentic_widget_draft_load", "widgentic_widget_definition_check"]) {
      const result = await run(tools, tool, { definition: bad });
      expect(result.code, tool).toBe("REJECTED");
    }
    expect((await run(tools, "widgentic_widget_draft_get")).ok).toBe(true);
  });

  it("leaves references unverified, never unknown, with no designer mounted", async () => {
    const definitionOnly = designerTools({});
    const result = await run(definitionOnly, "widgentic_widget_definition_check", {
      definition: { ...definition("inbox-card"), descriptor: { ...definition("inbox-card").descriptor, dataSchemaRef: "email-inbox" } }
    });
    expect(result.ok).toBe(true);
    expect(result.diagnosticsDerived).toBe(true);
    expect((result.diagnostics as { schemaRef?: string }).schemaRef).toBeUndefined();
  });

  it("theme tools report the style entries the renderer would drop, naming the part at fault", async () => {
    const loaded = await run(tools, "widgentic_theme_load", {
      entry: {
        name: "ocean",
        tokens: {},
        styles: { div: { color: "red" }, ".wg-a": { color: "red /*" }, ".wg-b": { "9x": "1px" }, ".wg-ok": { padding: "4px" } }
      }
    });
    expect(loaded.ok).toBe(true);
    const issues = (loaded.diagnostics as { styles: { selector: string; message: string }[] }).styles;
    expect(issues.map((issue) => [issue.selector, issue.message.split(".")[0]])).toEqual([
      ["div", "Selector would be skipped"],
      [".wg-a", "Value would be skipped"],
      [".wg-b", "Property would be skipped"]
    ]);
    // A value problem does not quote the property-name rule.
    expect(issues[1]?.message).not.toContain("Property names must match");
    const merged = await run(tools, "widgentic_theme_tokens_set", { tokens: { accent: "#0a84ff" } });
    expect((merged.diagnostics as { styles: unknown[] }).styles).toHaveLength(3);
    const clean = await run(tools, "widgentic_theme_load", { entry: { name: "ocean", tokens: {}, styles: { ".wg-ok": { padding: "4px" } } } });
    expect((clean.diagnostics as { styles: unknown[] }).styles).toEqual([]);
    expect((await run(tools, "widgentic_theme_get")).diagnostics).toEqual({ styles: [] });
  });

  it("schema_load and definition_check warn about what the validator would ignore", async () => {
    const loaded = await run(schemaTools, "widgentic_schema_load", {
      entry: { name: "fruit", schema: { type: "object", properties: { kind: { type: "banana" } } } }
    });
    expect(loaded.ok).toBe(true);
    expect(loaded.warnings).toEqual([expect.stringContaining("schema.properties.kind.type: 'banana'")]);
    const clean = await run(schemaTools, "widgentic_schema_load", { entry: { name: "fruit", schema: { type: "object" } } });
    expect(clean).not.toHaveProperty("warnings");
    const inline = { ...definition("fruit-card"), descriptor: { ...definition("fruit-card").descriptor, dataSchema: { type: "banana" } } };
    const checked = await run(tools, "widgentic_widget_definition_check", { definition: inline });
    expect(checked.ok).toBe(true);
    expect((checked.diagnostics as { dataSchema?: string[] }).dataSchema).toEqual([expect.stringContaining("'banana'")]);
  });

  it("warns, without refusing, when dataShape is missing", async () => {
    const { dataShape: _gone, ...descriptor } = definition("check-card").descriptor;
    const result = await run(tools, "widgentic_widget_definition_check", { definition: { ...definition("check-card"), descriptor } });
    expect(result.ok).toBe(true);
    expect((result.diagnostics as { dataShape?: string }).dataShape).toContain("Data shape is empty");
  });

  it("preview tokens layer over the person's chosen theme, and {} returns to it", async () => {
    const google = { name: "google-light", label: "Google-inspired light", tokens: { accent: "#1a73e8", bg: "#ffffff" } };
    root = host();
    widget = createDesigner(root, { themes: [...createThemeRegistry().list(), google], previewTheme: "google-light" });
    const select = root.querySelector(".wgd-theme-select") as HTMLSelectElement;
    const layered = await run(tools, "widgentic_widget_theme_set", { tokens: { accent: "#d93025" } });
    expect(layered).toMatchObject({ ok: true, previewTheme: "google-light", theme: { accent: "#d93025", bg: "#ffffff" } });
    expect(select.value).toBe("google-light");
    const cleared = await run(tools, "widgentic_widget_theme_set", { tokens: {} });
    expect(cleared).toMatchObject({ ok: true, previewTheme: "google-light" });
    expect(cleared.theme).toEqual(google.tokens);
    expect(select.value).toBe("google-light");
  });

  it("setting preview tokens never switches the selector to a named theme", async () => {
    const select = root.querySelector(".wgd-theme-select") as HTMLSelectElement;
    expect((await run(tools, "widgentic_widget_theme_set", { tokens: {} })).ok).toBe(true);
    expect(select.value).toBe("");
    expect((await run(tools, "widgentic_widget_theme_set", { tokens: { accent: "#0a84ff" } })).ok).toBe(true);
    expect(select.value).toBe("");
  });
});
