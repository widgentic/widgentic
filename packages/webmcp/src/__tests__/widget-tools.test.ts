// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoiceWidget } from "@widgentic-examples/mcp-server/widgets";
import { createDesigner, importWidgetJson } from "@widgentic/designer";
import type { DesignerHandle } from "@widgentic/designer";
import { designerTools } from "../index.js";
import { host, run } from "./helpers.js";

let designer: DesignerHandle;
const tools = designerTools({ widget: () => designer });

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  designer = createDesigner(host());
});

describe("widget designer tools", () => {
  it("reads what the person sees, with the designer's diagnostics", async () => {
    designer.loadWidget(invoiceWidget);
    const result = await run(tools, "widgentic_widget_draft_get");
    expect(result.ok).toBe(true);
    const definition = result.definition as { kind: string; template: unknown; descriptor: { description: string } };
    expect(definition.kind).toBe("invoice");
    expect(definition.template).toEqual(invoiceWidget.template);
    expect(definition.descriptor.description).toBe(invoiceWidget.descriptor.description);
    const diagnostics = result.diagnostics as { previewable: boolean };
    expect(diagnostics.previewable).toBe(true);
    // No change has gone through the tools yet: the diagnostics are derived and say so.
    expect(result.diagnosticsDerived).toBe(true);
  });

  it("lands a drafted definition in the designer and notifies its subscribers", async () => {
    const listener = vi.fn();
    designer.subscribe(listener);
    const result = await run(tools, "widgentic_widget_draft_load", { definition: invoiceWidget });
    expect(result.ok).toBe(true);
    expect(result.diagnosticsDerived).toBe(false);
    expect((result.diagnostics as { previewable: boolean }).previewable).toBe(true);
    expect(designer.getDraft().kind).toBe("invoice");
    expect(listener).toHaveBeenCalled();
    // The designer's DOM followed: the kind field shows the loaded kind.
    const kindInput = [...document.querySelectorAll("input")].find((input) => input.value === "invoice");
    expect(kindInput).toBeDefined();
  });

  it("refuses a bad definition with the designer's own words and leaves the draft alone", async () => {
    const bad = { ...invoiceWidget, template: 42 };
    const result = await run(tools, "widgentic_widget_draft_load", { definition: bad });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REJECTED");
    const expected = importWidgetJson(JSON.stringify(bad));
    expect(expected.ok).toBe(false);
    if (!expected.ok) expect(result.errors).toEqual(expected.errors);
    expect(designer.getDraft().kind).toBe("my-widget");
  });

  it("replaces the example data and reports the schema verdict", async () => {
    const good = await run(tools, "widgentic_widget_example_data_set", { data: { title: "Hi", message: "there" } });
    expect(good.ok).toBe(true);
    expect(designer.getDraft().descriptor.dataExample).toEqual({ title: "Hi", message: "there" });
    expect((good.diagnostics as { example?: unknown }).example).toBeUndefined();

    const bad = await run(tools, "widgentic_widget_example_data_set", { data: { title: "no message" } });
    expect(bad.ok).toBe(true);
    const diagnostics = bad.diagnostics as { example?: { message: string } };
    expect(diagnostics.example).toBeDefined();
    expect(diagnostics.example?.message).toMatch(/message/);
    expect(designer.getDraft().descriptor.dataExample).toEqual({ title: "no message" });
  });

  it("validates preview theme tokens", async () => {
    const ok = await run(tools, "widgentic_widget_theme_set", { tokens: { accent: "#0a84ff" } });
    expect(ok.ok).toBe(true);
    expect(designer.getDraft().theme?.accent).toBe("#0a84ff");
    expect((ok.theme as Record<string, string>).accent).toBe("#0a84ff");

    const bad = await run(tools, "widgentic_widget_theme_set", { tokens: { bogus: "red" } });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe("REJECTED");
    expect((bad.errors as string[]).join(" ")).toMatch(/bogus/);
    expect(designer.getDraft().theme).toEqual({ accent: "#0a84ff" });
  });
});
