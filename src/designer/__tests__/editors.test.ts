// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDesigner } from "../index.js";
import { createJsonTreeEditor } from "../json-tree-editor.js";
import { createSchemaBuilder } from "../schema-builder.js";
import { createSchemaForm } from "../schema-form.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function change(el: Element, value: string): void {
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("json tree editor", () => {
  it("edits values in place and reports changes", () => {
    const changes: unknown[] = [];
    const editor = createJsonTreeEditor({ message: "hi" }, (v) => changes.push(v));
    document.body.append(editor.element);
    const valueInput = editor.element.querySelectorAll("input.wgd-input")[1];
    change(valueInput as Element, "hello");
    expect(editor.getValue()).toEqual({ message: "hello" });
    expect(changes.at(-1)).toEqual({ message: "hello" });
  });

  it("adds/removes properties and switches types", () => {
    const editor = createJsonTreeEditor({ a: 1 }, () => undefined);
    document.body.append(editor.element);
    // add property
    const addButton = [...editor.element.querySelectorAll("button")].find(
      (b) => b.textContent === "+ property"
    ) as HTMLButtonElement;
    addButton.click();
    expect(Object.keys(editor.getValue() as object)).toContain("key");
    // switch root to array
    const rootType = editor.element.querySelector(".wgd-jt-type") as HTMLSelectElement;
    rootType.value = "array";
    rootType.dispatchEvent(new Event("change", { bubbles: true }));
    expect(editor.getValue()).toEqual([]);
  });

  it("renames keys preserving values", () => {
    const editor = createJsonTreeEditor({ old: 42 }, () => undefined);
    document.body.append(editor.element);
    const keyInput = editor.element.querySelector(".wgd-jt-keyinput") as HTMLInputElement;
    change(keyInput, "renamed");
    expect(editor.getValue()).toEqual({ renamed: 42 });
  });
});

describe("schema form", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", pattern: "^[A-Z]" },
      count: { type: "number" },
      level: { enum: ["low", "high"] },
      active: { type: "boolean" }
    }
  };

  it("generates controls per schema and assembles the value", () => {
    const changes: unknown[] = [];
    const form = createSchemaForm(schema, { name: "Ada" }, (v) => changes.push(v));
    document.body.append(form.element);
    const labels = [...form.element.querySelectorAll(".wgd-field-label")].map(
      (l) => l.textContent
    );
    expect(labels).toContain("name *");
    expect(labels).toContain("count");
    // enum renders a select
    const select = form.element.querySelector("select") as HTMLSelectElement;
    select.value = JSON.stringify("high");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    // number input
    const number = form.element.querySelector('input[type="number"]') as HTMLInputElement;
    number.value = "3";
    number.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)).toMatchObject({ name: "Ada", level: "high", count: 3 });
  });

  it("array items add and remove through the items schema", () => {
    const arraySchema = { type: "array", items: { type: "string" } };
    const form = createSchemaForm(arraySchema, ["a"], () => undefined);
    document.body.append(form.element);
    const add = [...form.element.querySelectorAll("button")].find(
      (b) => b.textContent === "+ item"
    ) as HTMLButtonElement;
    add.click();
    expect(form.getValue()).toEqual(["a", ""]);
  });
});

describe("schema builder", () => {
  it("builds an object schema with required and pattern", () => {
    const changes: unknown[] = [];
    const builder = createSchemaBuilder({ type: "object" }, (s) => changes.push(s));
    document.body.append(builder.element);
    const addProp = [...builder.element.querySelectorAll("button")].find(
      (b) => b.textContent === "+ property"
    ) as HTMLButtonElement;
    addProp.click();
    expect(changes.at(-1)).toMatchObject({
      type: "object",
      properties: { field: { type: "string" } }
    });
    // mark required
    const requiredBox = builder.element.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    requiredBox.checked = true;
    requiredBox.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)).toMatchObject({ required: ["field"] });
  });

  it("puts property name, type and required on one row", () => {
    const builder = createSchemaBuilder(
      { type: "object", required: ["customer"], properties: { customer: { type: "string" } } },
      () => undefined
    );
    document.body.append(builder.element);
    const rows = [...builder.element.querySelectorAll(".wgd-sb-row")];
    const propRow = rows.find((r) => r.querySelector(".wgd-sb-prop"));
    expect(propRow).toBeDefined();
    expect((propRow?.querySelector(".wgd-sb-prop") as HTMLInputElement).value).toBe("customer");
    expect(propRow?.querySelector(".wgd-sb-type")).not.toBeNull();
    expect(propRow?.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it("offers enum only where it is useful, and pattern only for strings", () => {
    /** Constraints belonging to the ROOT node only (not nested items). */
    function constraintPlaceholders(schema: Record<string, unknown>): string[] {
      document.body.innerHTML = "";
      const builder = createSchemaBuilder(schema, () => undefined);
      document.body.append(builder.element);
      const root = builder.element.querySelector(".wgd-sb-root") as HTMLElement;
      return [
        ...root.querySelectorAll(":scope > .wgd-sb-constraints > .wgd-sb-constraint")
      ].map((input) => (input as HTMLInputElement).placeholder);
    }
    const stringConstraints = constraintPlaceholders({ type: "string" });
    expect(stringConstraints.some((p) => p.startsWith("pattern"))).toBe(true);
    expect(stringConstraints.some((p) => p.startsWith("enum"))).toBe(true);

    const numberConstraints = constraintPlaceholders({ type: "number" });
    expect(numberConstraints.some((p) => p.startsWith("pattern"))).toBe(false);
    expect(numberConstraints.some((p) => p.startsWith("enum"))).toBe(true);

    // Objects and arrays: no constraint row at all (JSON tab covers exotica).
    expect(constraintPlaceholders({ type: "object" })).toEqual([]);
    expect(constraintPlaceholders({ type: "array" })).toEqual([]);
    expect(constraintPlaceholders({ type: "boolean" })).toEqual([]);
  });

  it("drops enum when switching to a type that does not offer it", () => {
    const changes: unknown[] = [];
    const builder = createSchemaBuilder({ type: "string", enum: ["a"] }, (s) => changes.push(s));
    document.body.append(builder.element);
    const typeSelect = builder.element.querySelector(".wgd-sb-type") as HTMLSelectElement;
    typeSelect.value = "object";
    typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)).toEqual({ type: "object" });
  });

  it("starts empty and can add/remove the schema", () => {
    const changes: unknown[] = [];
    const builder = createSchemaBuilder(undefined, (s) => changes.push(s));
    document.body.append(builder.element);
    const start = [...builder.element.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("add a data schema")
    ) as HTMLButtonElement;
    start.click();
    expect(changes.at(-1)).toEqual({ type: "object" });
  });
});

describe("template tree usability", () => {
  function designerWith(template: unknown): {
    container: HTMLElement;
    getTemplate(): unknown;
  } {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "probe",
      template,
      descriptor: { description: "d", dataShape: "s" }
    });
    return { container, getTemplate: () => designer.getDraft().template };
  }

  it("adds children with one click from the toolbar (no select-then-confirm)", () => {
    const { container, getTemplate } = designerWith({ tag: "div", children: [] });
    const toolbar = container.querySelector(".wgd-add-child") as HTMLElement;
    const labels = [...toolbar.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["+ text", "+ bind", "+ element", "+ each", "+ when"]);
    (toolbar.querySelectorAll("button")[1] as HTMLButtonElement).click(); // + bind
    expect(getTemplate()).toEqual({ tag: "div", children: [{ bind: "." }] });
  });

  it("labels element nodes with the tag select alone (no redundant badge)", () => {
    const { container } = designerWith({ tag: "div", children: [] });
    const elementRow = container.querySelector(".wgd-node-row") as HTMLElement;
    expect(elementRow.querySelector(".wgd-tag")).not.toBeNull();
    expect(elementRow.querySelector(".wgd-node-badge")).toBeNull();
  });

  it("edits element tags through a select of known tags", () => {
    const { container, getTemplate } = designerWith({ tag: "div", children: [] });
    const tagSelect = container.querySelector(".wgd-tag") as HTMLSelectElement;
    expect([...tagSelect.options].map((o) => o.value)).toContain("section");
    tagSelect.value = "section";
    tagSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(getTemplate()).toMatchObject({ tag: "section" });
  });

  it("offers a custom-tag escape hatch and keeps unknown tags selectable", () => {
    const { container, getTemplate } = designerWith({ tag: "marquee", children: [] });
    const tagSelect = container.querySelector(".wgd-tag") as HTMLSelectElement;
    expect(tagSelect.value).toBe("marquee"); // unknown tag preserved as an option
    tagSelect.value = "__custom__";
    tagSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const custom = container.querySelector(".wgd-tag-custom") as HTMLInputElement;
    expect(custom.hidden).toBe(false);
    change(custom, "aside");
    expect(getTemplate()).toMatchObject({ tag: "aside" });
  });

  it("keeps attribute name, mode and value on a single row", () => {
    const { container } = designerWith({
      tag: "div",
      attrs: { class: "wg-x", src: { bind: "url" } },
      children: []
    });
    const rows = container.querySelectorAll(".wgd-attr-row");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.querySelector(".wgd-attr-name")).not.toBeNull();
      expect(row.querySelector(".wgd-attr-mode")).not.toBeNull();
      expect(row.querySelector(".wgd-attr-value")).not.toBeNull();
    }
  });

  it("puts text and bind values inline with the node badge", () => {
    const { container } = designerWith({
      tag: "p",
      children: ["Customer:", { bind: "customer" }]
    });
    const rows = [...container.querySelectorAll(".wgd-node-row")];
    const textRow = rows.find((r) => r.querySelector(".wgd-node-badge")?.textContent === "text");
    const bindRow = rows.find((r) => r.querySelector(".wgd-node-badge")?.textContent === "bind");
    // Badge and the value control live in the same row element.
    expect((textRow?.querySelector("input") as HTMLInputElement).value).toBe("Customer:");
    expect((bindRow?.querySelector("input") as HTMLInputElement).value).toBe("customer");
  });
});

describe("schema-driven path pickers", () => {
  const invoiceSchema = {
    type: "object",
    required: ["customer", "lines"],
    properties: {
      title: { type: "string" },
      customer: { type: "string" },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            qty: { type: "number" }
          }
        }
      }
    }
  };

  function designerWithSchema(template: unknown): HTMLElement {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "probe",
      template,
      descriptor: { description: "d", dataShape: "s", dataSchema: invoiceSchema }
    });
    return container;
  }

  function optionsOf(container: Element, index = 0): string[] {
    const select = container.querySelectorAll(".wgd-path")[index] as HTMLSelectElement;
    return [...select.options].map((o) => o.value);
  }

  it("offers scalar schema paths for bind", () => {
    const container = designerWithSchema({ bind: "customer" });
    const options = optionsOf(container);
    expect(options).toContain("customer");
    expect(options).toContain("title");
    expect(options).not.toContain("lines"); // arrays are not bindable text
    expect(options).toContain("__custom__");
  });

  it("offers only array paths for each", () => {
    const container = designerWithSchema({ each: "lines", template: "x" });
    const options = optionsOf(container);
    expect(options).toContain("lines");
    expect(options).not.toContain("customer");
  });

  it("scopes paths inside an each to the item schema", () => {
    const container = designerWithSchema({
      each: "lines",
      template: { bind: "item" }
    });
    // [0] is the each path, [1] is the bind inside the item scope.
    const inner = optionsOf(container, 1);
    expect(inner).toContain("item");
    expect(inner).toContain("qty");
    expect(inner).not.toContain("customer"); // outer scope is not in scope
  });

  it("keeps an off-schema path selectable and marked", () => {
    const container = designerWithSchema({ bind: "$meta.title" });
    const select = container.querySelector(".wgd-path") as HTMLSelectElement;
    expect(select.value).toBe("$meta.title");
    const marked = [...select.options].find((o) => o.value === "$meta.title");
    expect(marked?.textContent).toContain("off-schema");
  });

  it("falls back to free text when the draft has no schema", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "probe",
      template: { bind: "anything" },
      descriptor: { description: "d", dataShape: "s" }
    });
    expect(container.querySelector(".wgd-path")).toBeNull();
    const bindRow = [...container.querySelectorAll(".wgd-node-row")].find(
      (r) => r.querySelector(".wgd-node-badge")?.textContent === "bind"
    );
    expect((bindRow?.querySelector("input") as HTMLInputElement).value).toBe("anything");
  });
});

describe("theme panel colors and presets", () => {
  function designer(): HTMLElement {
    const container = document.createElement("div");
    document.body.append(container);
    createDesigner(container);
    return container;
  }

  function tokenRow(container: Element, token: string): HTMLElement {
    const label = [...container.querySelectorAll(".wgd-field-label")].find(
      (l) => l.textContent === token
    );
    return label?.parentElement?.querySelector(".wgd-token-row") as HTMLElement;
  }

  it("shows a color picker/swatch for color tokens only", () => {
    const container = designer();
    // Colors get a swatch…
    for (const token of ["--wg-bg", "--wg-surface", "--wg-accent", "--wg-border"]) {
      expect(tokenRow(container, token).querySelector(".wgd-swatch"), token).not.toBeNull();
    }
    // …non-colors (sizes, fonts, shadow) do not.
    for (const token of ["--wg-radius", "--wg-font-family", "--wg-shadow"]) {
      expect(tokenRow(container, token).querySelector(".wgd-swatch"), token).toBeNull();
    }
  });

  it("swatch shows the effective color and writes through to the token", () => {
    const container = designer();
    const row = tokenRow(container, "--wg-accent");
    const swatch = row.querySelector(".wgd-swatch") as HTMLInputElement;
    // Unset token → swatch shows the registry default, never blank.
    expect(swatch.value).toBe("#2563eb");
    swatch.value = "#ff0000";
    swatch.dispatchEvent(new Event("input", { bubbles: true }));
    const text = row.querySelector(".wgd-input") as HTMLInputElement;
    expect(text.value).toBe("#ff0000");
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--wg-accent")).toBe("#ff0000");
  });

  it("preview establishes the widget theme context, not the chrome's", () => {
    // Regression: custom kinds (e.g. .wg-invoice) are not colored by the
    // base stylesheet, so without this the preview inherited the designer
    // chrome's text color — invisible light-on-white under a dark chrome.
    designer();
    const chrome = document.head.querySelector(
      "style[data-widgentic-designer]"
    ) as HTMLStyleElement;
    expect(chrome.textContent).toMatch(
      /\.wgd-preview\s*\{[^}]*background:\s*var\(--wg-bg,/
    );
    expect(chrome.textContent).toMatch(/\.wgd-preview\s*\{[^}]*color:\s*var\(--wg-fg,/);
  });

  it("loads the dark preset and returns to light", () => {
    const container = designer();
    const buttons = [...container.querySelectorAll("button")];
    const dark = buttons.find((b) => b.textContent === "Dark") as HTMLButtonElement;
    const light = buttons.find((b) => b.textContent === "Light") as HTMLButtonElement;
    dark.click();
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--wg-bg")).toBe("#0f131c");
    expect(preview.style.getPropertyValue("--wg-surface")).toBe("#161b26");
    const bgText = tokenRow(container, "--wg-bg").querySelector(
      ".wgd-input"
    ) as HTMLInputElement;
    expect(bgText.value).toBe("#0f131c"); // fields reflect the preset
    light.click();
    expect(preview.style.getPropertyValue("--wg-bg")).toBe("");
  });
});

describe("panel integration", () => {
  it("data editors switch from tree to schema-driven form when a schema appears", () => {
    const container = document.createElement("div");
    document.body.append(container);
    createDesigner(container);
    // Starter draft has no schema → tree editor present in Sample data.
    expect(container.querySelector(".wgd-jsontree")).not.toBeNull();
    // Add a schema via the builder.
    const start = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("add a data schema")
    ) as HTMLButtonElement;
    start.click();
    expect(container.querySelector(".wgd-schemaform")).not.toBeNull();
  });
});
