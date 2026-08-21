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
    expect(titles).toEqual(["Schema", "Definition", "Import", "Export"]);
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
    // Editing sections go inert; the view-only Export does not.
    const bodies = [...root.querySelectorAll(".wgd-section-body")].filter(
      (body) => !body.parentElement?.classList.contains("wgd-view-only")
    );
    expect(bodies.length).toBe(3);
    for (const body of bodies) expect(body.hasAttribute("inert")).toBe(true);
    expect(
      root.querySelector(".wgd-view-only > .wgd-section-body")?.hasAttribute("inert")
    ).toBe(false);
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

describe("schema designer io — the agent hand-off", () => {
  /** The verbatim entry a live agent drafted from the guide (2026-08-21). */
  const agentDrafted = {
    name: "person",
    label: "Person",
    description:
      "A single individual — contact or address book entry. Name and email are the only required fields; everything else is optional so partial records still validate.",
    schema: {
      type: "object",
      required: ["name", "email"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
        phone: { type: "string" },
        jobTitle: { type: "string" },
        company: { type: "string" },
        avatarUrl: { type: "string" },
        status: {
          type: "string",
          enum: ["active", "inactive", "prospect", "archived"]
        },
        tags: { type: "array", items: { type: "string" } },
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            region: { type: "string" },
            postalCode: { type: "string" },
            country: { type: "string" }
          }
        },
        lastContacted: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        notes: { type: ["string", "null"] }
      }
    }
  };

  function importInto(container: HTMLElement, text: string): void {
    const area = container.querySelector(".wgd-schema-import") as HTMLTextAreaElement;
    area.value = text;
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Import"
    ) as HTMLButtonElement;
    button.click();
  }

  it("imports the agent-drafted entry verbatim, ready to save", () => {
    const container = host();
    const designer = createSchemaDesigner(container);
    importInto(container, JSON.stringify(agentDrafted, null, 2));
    expect(designer.getSchema()).toEqual(agentDrafted);
    // The identity fields reflect the load.
    expect(
      [...container.querySelectorAll("input")].some((i) => i.value === "person")
    ).toBe(true);
  });

  it("invalid imports show errors and leave the working entry untouched", () => {
    const container = host();
    const designer = createSchemaDesigner(container, { initialSchema: person });
    importInto(container, "{ not json");
    expect(container.textContent).toContain("Invalid JSON");
    expect(designer.getSchema().name).toBe("person");
    importInto(container, JSON.stringify({ name: "a/b", schema: {} }));
    expect(container.textContent).toContain("not a valid schema name");
    expect(designer.getSchema().name).toBe("person");
  });

  it("renders Import before Export; Export stays operable read-only", () => {
    const container = host();
    createSchemaDesigner(container, { initialSchema: person, readOnly: true });
    const titles = [...container.querySelectorAll(".wgd-section-title")].map(
      (t) => t.textContent
    );
    expect(titles.indexOf("Import")).toBeGreaterThan(-1);
    expect(titles.indexOf("Import")).toBeLessThan(titles.indexOf("Export"));
    const exportButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Export schema entry"
    ) as HTMLButtonElement;
    expect(exportButton.closest("[inert]")).toBeNull();
    exportButton.click();
    const output = container.querySelector(
      ".wgd-view-only textarea"
    ) as HTMLTextAreaElement;
    expect(JSON.parse(output.value)).toEqual(person);
  });
});
