// @vitest-environment happy-dom
/**
 * The load tools refuse what saving would refuse (designer-webmcp), so an
 * agent learns at the draft what the store would otherwise answer at Save:
 * a reserved or malformed widget kind, a reserved or malformed theme name.
 * A missing dataShape is a warning, and setting preview tokens never
 * claims a named theme.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createThemeRegistry } from "@widgentic/core";
import { createDesigner, createThemeDesigner } from "@widgentic/designer";
import type { DesignerHandle, ThemeDesignerHandle } from "@widgentic/designer";
import { designerTools } from "../index.js";
import { host, run } from "./helpers.js";

let widget: DesignerHandle;
let theme: ThemeDesignerHandle;
let root: HTMLElement;
const tools = designerTools({ widget: () => widget, theme: () => theme });

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

  it("warns, without refusing, when dataShape is missing", async () => {
    const { dataShape: _gone, ...descriptor } = definition("check-card").descriptor;
    const result = await run(tools, "widgentic_widget_definition_check", { definition: { ...definition("check-card"), descriptor } });
    expect(result.ok).toBe(true);
    expect((result.diagnostics as { dataShape?: string }).dataShape).toContain("Data shape is empty");
  });

  it("setting preview tokens never switches the selector to a named theme", async () => {
    const select = root.querySelector(".wgd-theme-select") as HTMLSelectElement;
    expect((await run(tools, "widgentic_widget_theme_set", { tokens: {} })).ok).toBe(true);
    expect(select.value).toBe("");
    expect((await run(tools, "widgentic_widget_theme_set", { tokens: { accent: "#0a84ff" } })).ok).toBe(true);
    expect(select.value).toBe("");
  });
});
