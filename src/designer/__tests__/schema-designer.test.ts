// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  createSchemaDesigner,
  defineSchemaDesignerElement
} from "../index.js";
import type { SchemaEntry } from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const person: SchemaEntry = {
  name: "person",
  label: "Person",
  description: "A person record",
  schema: {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string" }, role: { type: "string" } }
  }
};

describe("schema designer", () => {
  it("mounts standalone — no widget or theme panels", () => {
    const container = host();
    const designer = createSchemaDesigner(container);
    expect(container.querySelector(".wgd-schema-designer")).not.toBeNull();
    const titles = [...container.querySelectorAll(".wgd-section-title")].map(
      (t) => t.textContent
    );
    expect(titles).toEqual(["Schema", "Definition"]);
    expect(container.querySelector(".wgd-preview")).toBeNull();
    designer.dispose();
    expect(container.querySelector(".wgd-root")).toBeNull();
  });

  it("edits project between builder and JSON, parse-gated", () => {
    const container = host();
    const designer = createSchemaDesigner(container, { initialSchema: person });
    // Builder edit reaches the entry and the JSON pane.
    const addProp = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "+ property"
    ) as HTMLButtonElement;
    addProp.click();
    expect(Object.keys(designer.getSchema().schema.properties as object)).toContain(
      "field"
    );
    const area = container.querySelector(
      ".wgd-textarea"
    ) as HTMLTextAreaElement;
    expect(area.value).toContain("field");
    // JSON edit reaches the entry.
    area.value = JSON.stringify({ type: "object", properties: { solo: { type: "string" } } });
    area.dispatchEvent(new Event("input", { bubbles: true }));
    expect(Object.keys(designer.getSchema().schema.properties as object)).toEqual([
      "solo"
    ]);
    // Invalid JSON keeps the last valid schema, with the error shown.
    area.value = "{ nope";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    expect(Object.keys(designer.getSchema().schema.properties as object)).toEqual([
      "solo"
    ]);
    expect(container.textContent).toContain("Invalid JSON");
  });

  it("invalid loads never clobber the working entry", () => {
    const container = host();
    const designer = createSchemaDesigner(container, { initialSchema: person });
    for (const bad of [
      { name: "", schema: {} },
      { name: "a/b", schema: {} },
      { name: "ok", schema: 42 },
      null
    ]) {
      const result = designer.loadSchema(bad);
      expect(result.ok).toBe(false);
      expect(designer.getSchema().name).toBe("person");
    }
  });

  it("round-trips the store's entry shape", () => {
    const container = host();
    const designer = createSchemaDesigner(container);
    expect(designer.loadSchema(person)).toEqual({ ok: true });
    expect(designer.getSchema()).toEqual(person);
    // Identity fields refreshed by the load.
    const nameInput = [...container.querySelectorAll("input")].find(
      (i) => i.value === "person"
    );
    expect(nameInput).toBeDefined();
  });

  it("flags an invalid name inline and notifies subscribers", () => {
    const container = host();
    const designer = createSchemaDesigner(container);
    const seen: string[] = [];
    designer.subscribe((entry) => seen.push(entry.name));
    const nameInput = container.querySelector("input") as HTMLInputElement;
    nameInput.value = "bad name!";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(container.textContent).toContain("Name must be non-empty");
    expect(seen.at(-1)).toBe("bad name!");
  });

  it("read-only inerts the editing surfaces both ways", () => {
    const container = host();
    const designer = createSchemaDesigner(container, {
      initialSchema: person,
      readOnly: true
    });
    const root = container.querySelector(".wgd-root") as HTMLElement;
    expect(root.classList.contains("wgd-readonly")).toBe(true);
    const bodies = root.querySelectorAll(".wgd-section-body");
    expect(bodies.length).toBe(2);
    for (const body of bodies) expect(body.hasAttribute("inert")).toBe(true);
    designer.setReadOnly(false);
    expect(root.querySelector(".wgd-section-body[inert]")).toBeNull();
  });

  it("registers its element only on the explicit call", () => {
    expect(customElements.get("widgentic-schema-designer")).toBeUndefined();
    defineSchemaDesignerElement();
    expect(customElements.get("widgentic-schema-designer")).toBeDefined();
    const el = document.createElement("widgentic-schema-designer");
    const events: unknown[] = [];
    el.addEventListener("widgentic-change", (event) =>
      events.push((event as CustomEvent).detail)
    );
    document.body.append(el);
    const nameInput = el.querySelector("input") as HTMLInputElement;
    nameInput.value = "renamed";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      (events.at(-1) as { schema: SchemaEntry } | undefined)?.schema.name
    ).toBe("renamed");
    el.remove();
  });
});
