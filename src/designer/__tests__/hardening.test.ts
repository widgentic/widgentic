// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { ActionBinding, ActionDefinition, HttpActionDefinition } from "widgentic/actions";
import { createBindingEditor, createDefinitionEditor, starterHttpDefinition } from "../action-editor.js";
import { createActionDesigner, createDesigner } from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function change(el: Element | null, value: string): void {
  if (el === null) throw new Error("control not found");
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function click(el: Element | undefined): void {
  if (el === undefined) throw new Error("button not found");
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}
const withInput = (properties: Record<string, unknown>): HttpActionDefinition => ({
  ...starterHttpDefinition(),
  input: { type: "object", properties }
});

describe("hardening: action editors read live state", () => {
  it("URL then method: the second commit keeps the first", () => {
    const editor = createDefinitionEditor(starterHttpDefinition(), {}, () => undefined);
    document.body.append(editor.element);
    change(editor.element.querySelector(".wgd-action-url"), "https://api.example.com/v2");
    const method = editor.element.querySelectorAll(".wgd-action-head select")[1] as HTMLSelectElement;
    method.value = "POST";
    method.dispatchEvent(new Event("change", { bubbles: true }));
    const value = editor.getValue() as HttpActionDefinition;
    expect(value.url).toBe("https://api.example.com/v2");
    expect(value.method).toBe("POST");
  });

  it("input mapping a then b keeps both; the placeholder option clears a field", () => {
    let latest: ActionBinding | undefined;
    const editor = createBindingEditor({ definition: withInput({ a: { type: "string" }, b: { type: "string" } }) }, { scopePaths: ["x", "y"] }, (b) => { latest = b; });
    document.body.append(editor.element);
    const selects = editor.element.querySelectorAll(".wgd-binding-input select.wgd-path");
    expect(selects.length).toBe(2);
    change(selects[0] ?? null, "x");
    change(selects[1] ?? null, "y");
    expect(latest?.input).toEqual({ a: "x", b: "y" });
    change(selects[0] ?? null, "");
    expect(latest?.input).toEqual({ b: "y" });
  });

  it("header rows are editor-local until named, and a duplicate name is flagged, not applied", () => {
    const seen: ActionDefinition[] = [];
    const editor = createDefinitionEditor({ ...starterHttpDefinition(), headers: { Accept: "application/json" } }, {}, (d) => seen.push(d));
    document.body.append(editor.element);
    const headers = editor.element.querySelector(".wgd-headers") as HTMLElement;
    click([...headers.querySelectorAll("button")].find((b) => b.textContent === "+ header"));
    expect(seen.length).toBe(0);
    expect(headers.querySelector(".wgd-rec-pending")).not.toBeNull();
    change(headers.querySelector(".wgd-rec-pending .wgd-rec-key"), "Accept");
    expect(seen.length).toBe(0);
    expect((headers.querySelector(".wgd-diagnostic") as HTMLElement).hidden).toBe(false);
    change(headers.querySelector(".wgd-rec-pending .wgd-rec-key"), "X-Trace");
    expect((seen.at(-1) as HttpActionDefinition).headers).toEqual({ Accept: "application/json", "X-Trace": "" });
    expect(headers.querySelector(".wgd-rec-pending")).toBeNull();
  });

  it("helper completions are complete paths", () => {
    const editor = createBindingEditor(
      { definition: withInput({ a: { type: "string" } }) },
      { getDataSchema: () => ({ type: "object", properties: { city: { type: "string" } } }) },
      () => undefined
    );
    document.body.append(editor.element);
    const options = [...editor.element.querySelectorAll(".wgd-binding-input select.wgd-path option")].map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("$root.city");
    expect(options).toContain("$index");
    expect(options.filter((o) => o.endsWith("."))).toEqual([]);
  });
});

describe("hardening: template panel and action designer", () => {
  it("builds a binding editor only for bound elements and flags unknown refs at the node", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container, { actions: [] });
    expect(designer.loadWidget({
      kind: "w",
      template: { tag: "div", children: [{ tag: "button", action: { ref: "ghost" }, children: ["Go"] }, { tag: "p", children: ["x"] }] },
      descriptor: { description: "w", dataShape: "{}" }
    })).toEqual({ ok: true });
    // One editor for the bound button plus the Load section's — none for div or p.
    expect(container.querySelectorAll(".wgd-binding").length).toBe(2);
    expect(container.querySelector(".wgd-node-action .wgd-diagnostic")?.textContent).toContain("ghost");
  });

  it("drops empty label/description, refuses non-string ones, and resets test arguments with the input schema", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createActionDesigner(container, { testCall: async () => ({ ok: true }) });
    const http = (properties: Record<string, unknown>) => ({ kind: "http", method: "GET", url: "https://a.example", input: { type: "object", properties }, output: { type: "object" } });
    expect(designer.loadAction({ name: "a", description: 5, definition: http({}) }).ok).toBe(false);
    expect(designer.loadAction({ name: "a", label: "", definition: http({ city: { type: "string" } }) })).toEqual({ ok: true });
    expect(designer.getAction()).not.toHaveProperty("label");
    const argInput = container.querySelector(".wgd-action-test input") as HTMLInputElement;
    argInput.value = "Oslo";
    argInput.dispatchEvent(new Event("input", { bubbles: true }));
    argInput.dispatchEvent(new Event("change", { bubbles: true }));
    designer.loadAction({ name: "a", definition: http({ city: { type: "string" }, zip: { type: "string" } }) });
    expect((container.querySelector(".wgd-action-test input") as HTMLInputElement).value).toBe("");
  });
});
