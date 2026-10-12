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
const tools = designerTools({ widget: () => widget, theme: () => theme });
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
