// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDesigner, exportWidgetJson } from "../index.js";
import type { StoredAction } from "@widgentic/core";

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

  it("a root-array widget offers NO item property to root-level input mappings or the load", () => {
    // The element sits at the template ROOT and the load resolves against
    // payload.data — both are the ARRAY, where only an index resolves. The
    // item's properties belong to a binding INSIDE each ".", never here.
    const lookup: StoredAction = {
      name: "lookup",
      definition: {
        kind: "http",
        method: "GET",
        url: "https://api.example.com/lookup",
        input: { type: "object", properties: { book: { type: "string" } } },
        output: { type: "array", items: { type: "object", properties: { ask: { type: "string" } } } }
      }
    };
    const container = host();
    const designer = createDesigner(container, { actions: [lookup] });
    designer.loadWidget({
      kind: "rates",
      template: {
        tag: "button",
        action: { ref: "lookup", input: { book: "$index" } },
        children: ["Look up"]
      },
      descriptor: {
        description: "r",
        dataShape: "[{ ask, book }]",
        dataSchema: {
          type: "array",
          items: {
            type: "object",
            properties: { ask: { type: "string" }, book: { type: "string" } }
          }
        }
      },
      load: { ref: "lookup", input: { book: "$index" } }
    });
    const optionsOf = (root: Element) => {
      const select = root.querySelector(".wgd-rec-row .wgd-path") as HTMLSelectElement | null;
      return select === null ? [] : [...select.options].map((o) => o.value);
    };
    const nodeOptions = optionsOf(container.querySelector(".wgd-node-action") as HTMLElement);
    expect(nodeOptions).not.toContain("ask");
    expect(nodeOptions).not.toContain("book");
    expect(nodeOptions).not.toContain("$root.ask");
    const loadSection = [...container.querySelectorAll(".wgd-section")].find((sec) =>
      sec.querySelector(".wgd-section-title")?.textContent?.startsWith("Load action")
    ) as HTMLElement;
    expect(optionsOf(loadSection)).not.toContain("book");
    designer.dispose();
  });

  it("an enveloped list: the \".\" row selects, and the other rows complete from the selection's items", () => {
    const envelope: StoredAction = {
      name: "envelope",
      definition: {
        kind: "http",
        method: "GET",
        url: "https://api.example.com/rates",
        input: { type: "object", properties: {} },
        output: {
          type: "object",
          properties: {
            data: { type: "array", items: { type: "object", properties: { ask: { type: "string" }, bid: { type: "string" } } } },
            next: { type: "string" }
          }
        }
      }
    };
    const container = host();
    const designer = createDesigner(container, { actions: [envelope] });
    designer.loadWidget({
      kind: "rates",
      template: { tag: "button", action: { ref: "envelope", output: { mode: "replace", map: { ".": "data", price: "ask" } } }, children: ["Go"] },
      descriptor: {
        description: "r",
        dataShape: "[{ price }]",
        dataSchema: { type: "array", items: { type: "object", properties: { price: { type: "string" } } } }
      }
    });
    const targets = [...container.querySelectorAll(".wgd-node-action .wgd-map-target select")] as HTMLSelectElement[];
    // the "." selection row is an on-schema target, whatever the widget's shape
    expect([...(targets[0]?.options ?? [])].map((o) => o.value)).toContain(".");
    expect([...(targets[0]?.options ?? [])].find((o) => o.value === ".")?.textContent).not.toContain("off-schema");
    const sources = [...container.querySelectorAll(".wgd-node-action .wgd-map-source select")] as HTMLSelectElement[];
    // row 0 is the "." selection: it completes from the response ROOT
    expect([...(sources[0]?.options ?? [])].map((o) => o.value)).toEqual(expect.arrayContaining([".", "data", "next"]));
    // row 1 maps the selected list's ITEMS
    expect([...(sources[1]?.options ?? [])].map((o) => o.value)).toEqual(expect.arrayContaining(["ask", "bid"]));
    expect([...(sources[1]?.options ?? [])].map((o) => o.value)).not.toContain("next");
    const mismatch = container.querySelector(".wgd-node-action .wgd-type-mismatch") as HTMLElement;
    expect(mismatch.hidden).toBe(true);
    designer.dispose();
  });

  it("a per-item projection under the default merge mode is flagged before execution", () => {
    const ticker: StoredAction = {
      name: "ticker",
      definition: {
        kind: "http",
        method: "GET",
        url: "https://api.example.com/ticker",
        input: { type: "object", properties: {} },
        output: { type: "array", items: { type: "object", properties: { ask: { type: "string" } } } }
      }
    };
    const container = host();
    const designer = createDesigner(container, { actions: [ticker] });
    designer.loadWidget({
      kind: "rates",
      template: { tag: "button", action: { ref: "ticker", output: { map: { price: "ask" } } }, children: ["Go"] },
      descriptor: {
        description: "r",
        dataShape: "[{ price }]",
        dataSchema: { type: "array", items: { type: "object", properties: { price: { type: "string" } } } }
      }
    });
    const mismatch = container.querySelector(".wgd-node-action .wgd-type-mismatch") as HTMLElement;
    expect(mismatch.hidden).toBe(false);
    expect(mismatch.textContent).toContain("replace or patch");
    designer.dispose();
  });

  it("array schemas complete on both sides of the projection, by ITEM properties", () => {
    // A list-shaped response folded into a list-shaped widget: the map is
    // per item, so both columns offer the item's properties.
    const ticker: StoredAction = {
      name: "ticker",
      definition: {
        kind: "http",
        method: "GET",
        url: "https://api.example.com/ticker",
        input: { type: "object", properties: {} },
        output: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ask: { type: "string" },
              bid: { type: "string" },
              book: { type: "string" },
              date: { type: "string" }
            }
          }
        }
      }
    };
    const container = host();
    const designer = createDesigner(container, { actions: [ticker] });
    designer.loadWidget({
      kind: "rates",
      template: {
        tag: "button",
        action: { ref: "ticker", output: { mode: "replace", map: { price: "ask" } } },
        children: ["Refresh"]
      },
      descriptor: {
        description: "r",
        dataShape: "[{ price, when }]",
        dataSchema: {
          type: "array",
          items: {
            type: "object",
            properties: { price: { type: "string" }, when: { type: "string" } }
          }
        }
      }
    });
    const targetSelect = container.querySelector(".wgd-node-action .wgd-map-target select") as HTMLSelectElement;
    expect([...targetSelect.options].map((o) => o.value)).toEqual(["", ".", "price", "when", "__custom__"]);
    const sourceSelect = container.querySelector(".wgd-node-action .wgd-map-source select") as HTMLSelectElement;
    expect([...sourceSelect.options].map((o) => o.value)).toEqual(
      expect.arrayContaining([".", "ask", "bid", "book", "date", "__custom__"])
    );
    // matching item types agree, so nothing is flagged
    const mismatch = container.querySelector(".wgd-node-action .wgd-type-mismatch") as HTMLElement;
    expect(mismatch.hidden).toBe(true);
    designer.dispose();
  });

  it("two array sides are compared by their item types, not by 'array' vs 'array'", () => {
    const rows: StoredAction = {
      name: "rows",
      definition: {
        kind: "http",
        method: "GET",
        url: "https://api.example.com/rows",
        input: { type: "object", properties: {} },
        output: {
          type: "object",
          properties: { values: { type: "array", items: { type: "string" } } }
        }
      }
    };
    const container = host();
    const designer = createDesigner(container, { actions: [rows] });
    designer.loadWidget({
      kind: "counts",
      template: {
        tag: "button",
        action: { ref: "rows", output: { mode: "merge", map: { counts: "values" } } },
        children: ["Refresh"]
      },
      descriptor: {
        description: "c",
        dataShape: "{ counts }",
        dataSchema: {
          type: "object",
          properties: { counts: { type: "array", items: { type: "number" } } }
        }
      }
    });
    const mismatch = container.querySelector(".wgd-node-action .wgd-type-mismatch") as HTMLElement;
    expect(mismatch.hidden).toBe(false);
    expect(mismatch.textContent).toContain("'values' is string");
    expect(mismatch.textContent).toContain("'counts' is number");
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
    // Real dropdowns (not datalists): known paths plus the custom escape.
    const targetSelect = container.querySelector(".wgd-node-action .wgd-map-target select") as HTMLSelectElement;
    expect([...targetSelect.options].map((o) => o.value)).toEqual(["", ".", "temperature", "__custom__"]);
    const sourceSelect = container.querySelector(".wgd-node-action .wgd-map-source select") as HTMLSelectElement;
    expect([...sourceSelect.options].map((o) => o.value)).toEqual(expect.arrayContaining([".", "current", "current.temp_c", "current.condition.text", "__custom__"]));
    expect(sourceSelect.value).toBe("current.temp_c");
    // Picking a known source commits it; "custom…" reveals free text.
    sourceSelect.value = "current.condition.text";
    sourceSelect.dispatchEvent(new Event("change"));
    const draft = designer.getDraft();
    const binding = (draft.template as { action: { output: { map: Record<string, string> } } }).action;
    expect(binding.output.map).toEqual({ temperature: "current.condition.text" });
    designer.dispose();
  });
});

describe("attribute binds", () => {
  it("bound attribute values use the path dropdown, literals stay free text", () => {
    const container = host();
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "avatar",
      template: { tag: "img", attrs: { class: "wg-avatar", src: { bind: "avatarUrl" }, alt: { bind: "displayName" } } },
      descriptor: {
        description: "a",
        dataShape: "{ avatarUrl, displayName }",
        dataSchema: { type: "object", properties: { avatarUrl: { type: "string" }, displayName: { type: "string" } } }
      }
    });
    const rows = [...container.querySelectorAll(".wgd-attr-row")];
    expect(rows).toHaveLength(3);
    const srcSelect = rows[1]?.querySelector("select.wgd-path") as HTMLSelectElement;
    expect(srcSelect).not.toBeNull();
    expect([...srcSelect.options].map((o) => o.value)).toEqual(expect.arrayContaining(["avatarUrl", "displayName", "__custom__"]));
    expect(srcSelect.value).toBe("avatarUrl");
    expect(rows[0]?.querySelector("select.wgd-path")).toBeNull(); // the literal class attr
    srcSelect.value = "displayName";
    srcSelect.dispatchEvent(new Event("change"));
    expect((designer.getDraft().template as unknown as { attrs: { src: unknown } }).attrs.src).toEqual({ bind: "displayName" });
    designer.dispose();
  });
});
