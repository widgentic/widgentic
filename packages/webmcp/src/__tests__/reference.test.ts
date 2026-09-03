// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { invoiceWidget } from "@widgentic-examples/mcp-server/widgets";
import { TOKEN_SPECS, createCatalog } from "@widgentic/core";
import { importWidgetJson } from "@widgentic/designer";
import { designerTools } from "../index.js";
import { run } from "./helpers.js";

const tools = designerTools({});

describe("the authoring guide tool", () => {
  it("carries the contract the designers enforce, derived from the validators", async () => {
    const result = await run(tools, "widgentic_authoring_guide");
    expect(result.ok).toBe(true);
    const guide = result.guide as {
      workflow: { summary: string; boundary: string };
      widget: { reservedKinds: string[]; identifierPattern: string };
      theme: { tokens: { name: string }[] };
      rules: { template: { forms: string[]; safety: { tags: string } }; styles: { selectors: string }; dataSchema: { keywords: string } };
      limits: { maxWidgetsPerUser: number; maxTemplateNodes: number };
    };
    expect(guide.workflow.summary).toContain("widgentic_widget_draft_load");
    expect(guide.workflow.boundary).toMatch(/No tool here saves/);
    expect(guide.widget.reservedKinds).toEqual(createCatalog().kinds());
    expect(guide.theme.tokens.map((t) => t.name).sort()).toEqual(Object.keys(TOKEN_SPECS).sort());
    const forms = guide.rules.template.forms.join("\n");
    for (const term of ["BIND", "EACH", "WHEN", "ELEMENT", "ATTR MAP", "ATTR PREFIX", "FORMAT", "ONE TRANSFORM PER VALUE", "ACTION", "$3,207", "01-09-2026 02:04"]) {
      expect(forms, term).toContain(term);
    }
    expect(guide.rules.template.safety.tags).toContain("script");
    expect(guide.rules.styles.selectors).toContain(".wg-");
    expect(guide.rules.dataSchema.keywords).toContain("pattern");
    expect(guide.limits.maxWidgetsPerUser).toBe(100);
    expect(guide.limits.maxTemplateNodes).toBe(2000);
  });

  it("follows the prefix in its tool names", async () => {
    const result = await run(designerTools({}, { prefix: "acme" }), "acme_authoring_guide");
    expect((result.guide as { workflow: { summary: string } }).workflow.summary).toContain("acme_widget_draft_load");
  });
});

describe("the definition check tool", () => {
  it("accepts a valid definition with the diagnostics the load would produce", async () => {
    const result = await run(tools, "widgentic_widget_definition_check", { definition: invoiceWidget });
    expect(result.ok).toBe(true);
    expect((result.diagnostics as { previewable: boolean }).previewable).toBe(true);
    expect(result.diagnosticsDerived).toBe(true);
  });

  it("refuses with the designer's own errors, and names a bad argument", async () => {
    const bad = { ...invoiceWidget, template: 42 };
    const result = await run(tools, "widgentic_widget_definition_check", { definition: bad });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REJECTED");
    const expected = importWidgetJson(JSON.stringify(bad));
    if (!expected.ok) expect(result.errors).toEqual(expected.errors);
    const invalid = await run(tools, "widgentic_widget_definition_check", { definition: "nope" });
    expect(invalid.code).toBe("INVALID_INPUT");
  });

  it("reports an example that does not match the schema without touching any designer", async () => {
    const definition = {
      kind: "check-card",
      template: { tag: "div", children: [{ bind: "total" }] },
      descriptor: { description: "d", dataSchema: { type: "object", properties: { total: { type: "number" } }, required: ["total"] }, dataExample: { total: "abc" } }
    };
    const result = await run(tools, "widgentic_widget_definition_check", { definition });
    expect(result.ok).toBe(true);
    expect((result.diagnostics as { example?: unknown }).example).toBeDefined();
  });
});
