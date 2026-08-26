// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDesigner, exportWidgetJson } from "../index.js";
import type { StoredAction } from "widgentic/actions";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const refresh: StoredAction = {
  name: "refresh",
  definition: {
    kind: "http",
    method: "GET",
    url: "https://api.example.com/weather",
    input: { type: "object", properties: { city: { type: "string" } } },
    output: { type: "object" }
  }
};
const other: StoredAction = { ...refresh, name: "other" };

const bound = {
  kind: "weather",
  template: {
    tag: "div",
    children: [{ tag: "button", action: { ref: "refresh", input: { city: "location.city" } }, children: ["Refresh"] }]
  },
  descriptor: {
    description: "weather",
    dataShape: "{ location }",
    dataExample: { location: { city: "Oslo" } },
    dataSchema: { type: "object", properties: { location: { type: "object", properties: { city: { type: "string" } } } } }
  },
  load: { ref: "refresh", input: { city: "location.city" } }
};

describe("widget designer action bindings", () => {
  it("round-trips element bindings and load through the draft, and previews an inert badge", () => {
    const container = host();
    const designer = createDesigner(container, { actions: [refresh, other] });
    expect(designer.loadWidget(bound)).toEqual({ ok: true });
    const draft = designer.getDraft();
    expect((draft.template as { children: { action: unknown }[] }).children[0]?.action).toEqual({ ref: "refresh", input: { city: "location.city" } });
    expect(draft.load).toEqual(bound.load);
    expect(JSON.parse(exportWidgetJson(draft))).toMatchObject({ load: bound.load });
    // The element's binding editor is on screen with the shared mode selected.
    const nodeBinding = container.querySelector(".wgd-node-action .wgd-binding-mode") as HTMLSelectElement;
    expect(nodeBinding.value).toBe("shared");
    const ref = container.querySelector(".wgd-node-action .wgd-binding-ref") as HTMLSelectElement;
    ref.value = "other";
    ref.dispatchEvent(new Event("change"));
    expect((designer.getDraft().template as { children: { action: { ref: string } }[] }).children[0]?.action.ref).toBe("other");
    // Preview: the bound element wears the inert badge and never executes.
    expect(container.querySelector(".wgd-preview .wg-designer-action")).not.toBeNull();
    designer.dispose();
  });

  it("surfaces conflicts and unknown refs in place", () => {
    const container = host();
    const designer = createDesigner(container, { actions: [refresh] });
    let diagnostics: { template?: { code: string }; actionRefs?: string } = {};
    designer.subscribe((_draft, d) => {
      diagnostics = d;
    });
    // loadWidget refuses invalid definitions; the conflict arrives through an edit.
    designer.loadWidget({ ...bound, load: undefined });
    const jsonArea = container.querySelector("textarea.wgd-template-json") as HTMLTextAreaElement;
    jsonArea.value = JSON.stringify({ tag: "a", attrs: { href: "https://x.example" }, action: { ref: "refresh" }, children: ["x"] });
    jsonArea.dispatchEvent(new Event("input"));
    expect(diagnostics.template?.code).toBe("CONFLICTING_ATTRIBUTES");
    expect(container.querySelector(".wgd-tree .wgd-diagnostic")?.textContent).toContain("CONFLICTING_ATTRIBUTES");
    designer.loadWidget({ ...bound, template: { tag: "button", action: { ref: "missing" }, children: ["x"] }, load: undefined });
    expect(diagnostics.actionRefs).toContain("'missing'");
    designer.dispose();
  });

  it("the Load section edits the widget-level binding (http GET only)", () => {
    const container = host();
    const designer = createDesigner(container, { actions: [refresh] });
    const loadSection = [...container.querySelectorAll(".wgd-section")].find((s) => s.querySelector(".wgd-section-title")?.textContent?.startsWith("Load action")) as HTMLElement;
    expect(loadSection).toBeDefined();
    const mode = loadSection.querySelector(".wgd-binding-mode") as HTMLSelectElement;
    expect(mode.value).toBe("none");
    mode.value = "shared";
    mode.dispatchEvent(new Event("change"));
    expect(designer.getDraft().load).toEqual({ ref: "refresh" });
    mode.value = "none";
    mode.dispatchEvent(new Event("change"));
    expect(designer.getDraft().load).toBeUndefined();
    designer.dispose();
  });
});

describe("schema-driven completions and type checks", () => {
  const weatherCurrent: StoredAction = {
    name: "weather-current",
    definition: {
      kind: "http",
      method: "GET",
      url: "https://api.weatherapi.com/v1/current.json",
      input: { type: "object", properties: { q: { type: "string" } } },
      output: { type: "object", properties: { current: { type: "object", properties: { temp_c: { type: "number" }, condition: { type: "object", properties: { text: { type: "string" } } } } } } }
    }
  };
  const personSchema = { name: "person", schema: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } } } };

  it("a shared dataSchemaRef drives the template panel's path dropdowns", () => {
    const container = host();
    const designer = createDesigner(container, { schemas: [personSchema] });
    expect(designer.loadWidget({
      kind: "person-card",
      template: { tag: "div", children: [{ bind: "name" }] },
      descriptor: { description: "p", dataShape: "{ name, role }", dataSchemaRef: "person" }
    })).toEqual({ ok: true });
    const pathSelect = container.querySelector(".wgd-tree select.wgd-path") as HTMLSelectElement;
    expect(pathSelect).not.toBeNull();
    expect([...pathSelect.options].map((o) => o.value)).toEqual(expect.arrayContaining(["name", "role"]));
    designer.dispose();
  });

  it("the output map flags a source/target type mismatch and completes from both schemas", () => {
    const container = host();
    const designer = createDesigner(container, { actions: [weatherCurrent] });
    designer.loadWidget({
      kind: "weather-secure",
      template: {
        tag: "button",
        action: { ref: "weather-current", input: { q: "place" }, output: { mode: "patch", path: "reading", map: { temperature: "current.temp_c" } } },
        children: ["Refresh"]
      },
      descriptor: {
        description: "w",
        dataShape: "{ place, reading }",
        dataSchema: { type: "object", properties: { place: { type: "string" }, reading: { type: "object", properties: { temperature: { type: "string" } } } } }
      }
    });
    const mismatch = container.querySelector(".wgd-node-action .wgd-type-mismatch") as HTMLElement;
    expect(mismatch.hidden).toBe(false);
    expect(mismatch.textContent).toContain("'current.temp_c' is number");
    expect(mismatch.textContent).toContain("'reading.temperature' is string");
    const targets = [...container.querySelectorAll(".wgd-node-action datalist")].find((d) => d.id.endsWith("-targets")) as HTMLElement;
    expect([...targets.querySelectorAll("option")].map((o) => o.value)).toEqual(["temperature"]);
    const sources = [...container.querySelectorAll(".wgd-node-action datalist")].find((d) => d.id.endsWith("-sources")) as HTMLElement;
    expect([...sources.querySelectorAll("option")].map((o) => o.value)).toEqual(expect.arrayContaining([".", "current", "current.temp_c", "current.condition.text"]));
    designer.dispose();
  });
});
