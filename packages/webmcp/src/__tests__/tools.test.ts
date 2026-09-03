// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { designerTools, DEFAULT_PREFIX } from "../index.js";

const none = () => undefined;
const ALL = { widget: none, theme: none, schema: none, action: none };

describe("designerTools", () => {
  it("produces tools only for the supplied designers, plus the reference tools", () => {
    const names = designerTools({ widget: none }).map((t) => t.name);
    expect(names).toEqual([
      "widgentic_widget_draft_get",
      "widgentic_widget_draft_load",
      "widgentic_widget_example_data_set",
      "widgentic_widget_theme_set",
      "widgentic_authoring_guide",
      "widgentic_widget_definition_check",
      "widgentic_theme_token_specs"
    ]);
    expect(designerTools({}).map((t) => t.name)).toEqual([
      "widgentic_authoring_guide",
      "widgentic_widget_definition_check",
      "widgentic_theme_token_specs"
    ]);
    expect(designerTools(ALL)).toHaveLength(14);
  });

  it("names follow the prefix", () => {
    const acme = designerTools(ALL, { prefix: "acme" });
    expect(acme.every((t) => t.name.startsWith("acme_"))).toBe(true);
    expect(acme.map((t) => t.name)).toContain("acme_widget_draft_get");
    expect(DEFAULT_PREFIX).toBe("widgentic");
    expect(designerTools(ALL).map((t) => t.name)).toContain("widgentic_widget_draft_get");
    expect(() => designerTools(ALL, { prefix: "Bad Prefix" })).toThrow(TypeError);
  });

  it("annotates read tools read-only and nothing else", () => {
    for (const t of designerTools(ALL)) {
      const reads = t.name.endsWith("_get") || t.name.endsWith("theme_token_specs") || t.name.endsWith("authoring_guide") || t.name.endsWith("definition_check");
      expect(t.annotations?.readOnlyHint === true, t.name).toBe(reads);
    }
  });

  it("closes every input schema and titles every tool", () => {
    for (const t of designerTools(ALL)) {
      const schema = t.inputSchema as { type: unknown; additionalProperties: unknown; properties: Record<string, unknown>; required?: string[] };
      expect(schema.type, t.name).toBe("object");
      expect(schema.additionalProperties, t.name).toBe(false);
      for (const required of schema.required ?? []) expect(Object.keys(schema.properties), t.name).toContain(required);
      expect(typeof t.title).toBe("string");
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it("ships no persistence tool and tells the agent the person saves", () => {
    const tools = designerTools(ALL);
    for (const t of tools) expect(t.name).not.toMatch(/save|publish|delete/);
    const editing = tools.filter((t) => t.annotations?.readOnlyHint !== true);
    expect(editing.length).toBe(7);
    for (const t of editing) expect(t.description).toMatch(/person reviews|person saves|not a saved theme/);
  });

  it("teaches the authoring contract where the agent reads it", () => {
    const byName = new Map(designerTools(ALL).map((t) => [t.name, t.description]));
    const load = byName.get("widgentic_widget_draft_load") ?? "";
    for (const term of ["map", "prefix", "format", "each", "when", "bind", ".wg-", "var(--wg-", "dataShape", "widgentic_authoring_guide", "widgentic_widget_definition_check"]) {
      expect(load, term).toContain(term);
    }
    expect(byName.get("widgentic_theme_load")).toContain("theme_token_specs");
    expect(byName.get("widgentic_schema_load")).toContain("dataSchemaRef");
    const acme = new Map(designerTools(ALL, { prefix: "acme" }).map((t) => [t.name, t.description]));
    expect(acme.get("acme_widget_draft_load")).toContain("acme_authoring_guide");
  });
});
