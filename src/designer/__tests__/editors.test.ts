// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDesigner } from "../index.js";
import { createJsonTreeEditor } from "../json-tree-editor.js";
import { createSchemaBuilder } from "../schema-builder.js";
import { createSchemaForm } from "../schema-form.js";
import { createStylesEditor } from "../styles-editor.js";

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

describe("schema builder flat treatment", () => {
  it("hides removal controls until the row is hovered and fits type selects", () => {
    const container = document.createElement("div");
    document.body.append(container);
    createDesigner(container); // starter draft ships a dataSchema
    const builder = container.querySelector(".wgd-schemabuilder") as HTMLElement;
    const removeIcon = [...builder.querySelectorAll(".wgd-sb-row > .wgd-icon")][0] as HTMLElement;
    expect(removeIcon).toBeDefined();
    // At rest the row chrome is hidden — the flat look the tree set.
    expect(getComputedStyle(removeIcon).visibility).toBe("hidden");
    const typeSelect = builder.querySelector(".wgd-sb-type") as HTMLSelectElement;
    expect(typeSelect.style.width).toBe("calc(6ch + 1.2em + 18px)"); // 'object'
  });
});

describe("styles tree editor", () => {
  it("renders selectors with declaration rows and edits in place", () => {
    const changes: unknown[] = [];
    const editor = createStylesEditor(
      { ".wg-card": { padding: "8px" } },
      (v) => changes.push(v)
    );
    document.body.append(editor.element);
    const selector = editor.element.querySelector(".wgd-st-selector") as HTMLInputElement;
    expect(selector.value).toBe(".wg-card");
    const value = editor.element.querySelector(".wgd-st-value") as HTMLInputElement;
    change(value, "12px");
    expect(changes.at(-1)).toEqual({ ".wg-card": { padding: "12px" } });
  });

  it("adds selectors and declarations, removes both", () => {
    const editor = createStylesEditor(undefined, () => undefined);
    document.body.append(editor.element);
    const addSelector = editor.element.querySelector(".wgd-st-add") as HTMLButtonElement;
    addSelector.click();
    expect(editor.getValue()).toEqual({ ".wg-": {} });
    const addDecl = [...editor.element.querySelectorAll(".wgd-icon")].find(
      (b) => b.getAttribute("title") === "Add declaration"
    ) as HTMLButtonElement;
    addDecl.click();
    expect(editor.getValue()).toEqual({ ".wg-": { "": "" } });
    const removeDecl = [...editor.element.querySelectorAll(".wgd-icon")].find(
      (b) => b.getAttribute("title") === "Remove declaration"
    ) as HTMLButtonElement;
    removeDecl.click();
    expect(editor.getValue()).toEqual({ ".wg-": {} });
    const removeSelector = [...editor.element.querySelectorAll(".wgd-icon")].find(
      (b) => b.getAttribute("title") === "Remove selector"
    ) as HTMLButtonElement;
    removeSelector.click();
    // Emptied record means "no styles" — the key drops from the descriptor.
    expect(editor.getValue()).toBeUndefined();
  });

  it("renames a selector preserving its declarations", () => {
    const editor = createStylesEditor(
      { ".wg-a": { color: "var(--wg-fg)" } },
      () => undefined
    );
    document.body.append(editor.element);
    change(
      editor.element.querySelector(".wgd-st-selector") as HTMLInputElement,
      ".wg-b"
    );
    expect(editor.getValue()).toEqual({ ".wg-b": { color: "var(--wg-fg)" } });
  });

  it("projects into the draft next to the parse-gated JSON tab", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    // The styles section carries the same Tree/JSON pair as the template.
    const stylesSection = [...container.querySelectorAll(".wgd-section")].find(
      (s) => s.querySelector(".wgd-section-title")?.textContent?.startsWith("Styles")
    ) as HTMLElement;
    const tabLabels = [...stylesSection.querySelectorAll(".wgd-tab")].map(
      (b) => b.textContent
    );
    expect(tabLabels).toEqual(["Tree", "JSON"]);
    const addSelector = stylesSection.querySelector(".wgd-st-add") as HTMLButtonElement;
    addSelector.click();
    change(
      stylesSection.querySelector(".wgd-st-selector") as HTMLInputElement,
      ".wg-hero"
    );
    expect(designer.getDraft().descriptor.styles).toEqual({ ".wg-hero": {} });
  });

  it("shows only the selected view — hidden must beat the tree's display", () => {
    // .wgd-styles sets display:flex, which would defeat the tab's hidden
    // attribute without the scoped [hidden] guard (seen live: both views
    // rendered under the JSON tab).
    const container = document.createElement("div");
    document.body.append(container);
    createDesigner(container);
    const stylesSection = [...container.querySelectorAll(".wgd-section")].find(
      (s) => s.querySelector(".wgd-section-title")?.textContent?.startsWith("Styles")
    ) as HTMLElement;
    const tree = stylesSection.querySelector(".wgd-styles") as HTMLElement;
    const jsonTab = [...stylesSection.querySelectorAll(".wgd-tab")].find(
      (b) => b.textContent === "JSON"
    ) as HTMLButtonElement;
    jsonTab.click();
    expect(tree.hidden).toBe(true);
    expect(getComputedStyle(tree).display).toBe("none");
    // And no legend row in the JSON pane — the section title names it.
    expect(stylesSection.querySelector(".wgd-field-label")).toBeNull();
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

  it("adds attributes and children through one compact menu (no button rows)", () => {
    const { container, getTemplate } = designerWith({ tag: "div", children: [] });
    // The old per-form toolbars are gone — the tree carries no standing rows.
    expect(container.querySelector(".wgd-add-child")).toBeNull();
    const toggle = container.querySelector(".wgd-menu-toggle") as HTMLButtonElement;
    toggle.click();
    const menu = container.querySelector(".wgd-menu") as HTMLElement;
    expect(menu.hidden).toBe(false);
    const labels = [...menu.querySelectorAll(".wgd-menu-item")].map((b) => b.textContent);
    expect(labels).toEqual(["attribute", "text", "bind", "element", "each", "when"]);
    (menu.querySelectorAll(".wgd-menu-item")[2] as HTMLButtonElement).click(); // bind
    expect(getTemplate()).toEqual({ tag: "div", children: [{ bind: "." }] });
  });

  it("closes the add menu on outside click and Escape without inserting", () => {
    const { container, getTemplate } = designerWith({ tag: "div", children: [] });
    const toggle = container.querySelector(".wgd-menu-toggle") as HTMLButtonElement;
    const menu = container.querySelector(".wgd-menu") as HTMLElement;
    toggle.click();
    expect(menu.hidden).toBe(false);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.hidden).toBe(true);
    toggle.click();
    expect(menu.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu.hidden).toBe(true);
    // The hidden attribute must actually hide it — a display rule on
    // .wgd-menu would silently defeat [hidden] (caught live once).
    expect(getComputedStyle(menu).display).toBe("none");
    expect(getTemplate()).toEqual({ tag: "div", children: [] });
  });

  it("sets unset slots through the same menu control", () => {
    const { container, getTemplate } = designerWith({
      each: "lines",
      template: "line"
    });
    // 'empty' is unset: exactly one slot menu labeled for it, listing forms.
    const slotToggle = [...container.querySelectorAll(".wgd-menu-toggle")].find(
      (b) => b.textContent === "+ empty"
    ) as HTMLButtonElement;
    slotToggle.click();
    const menu = slotToggle.parentElement?.querySelector(".wgd-menu") as HTMLElement;
    const items = [...menu.querySelectorAll(".wgd-menu-item")];
    expect(items.map((b) => b.textContent)).toEqual([
      "text", "bind", "element", "each", "when"
    ]);
    (items[2] as HTMLButtonElement).click(); // element
    expect(getTemplate()).toEqual({
      each: "lines",
      template: "line",
      empty: { tag: "div", children: [] }
    });
  });

  it("collapses structural nodes and keeps them collapsed across edits", () => {
    const { container } = designerWith({
      tag: "div",
      children: ["hello", { tag: "p", attrs: { class: "wg-x" }, children: ["x"] }]
    });
    const inner = (): HTMLElement =>
      container.querySelector('[data-path="children.1"]') as HTMLElement;
    expect(inner().querySelector(".wgd-children")).not.toBeNull();
    // Chevrons are buttons only on collapsible nodes: root, then the <p>.
    const chevrons = container.querySelectorAll("button.wgd-chevron");
    (chevrons[1] as HTMLButtonElement).click();
    expect(inner().querySelector(".wgd-children")).toBeNull();
    expect(inner().querySelector(".wgd-node-summary")?.textContent).toBe(
      "1 attr · 1 child"
    );
    // Edit elsewhere — the re-render must not lose the fold.
    const hello = [...container.querySelectorAll("input")].find(
      (i) => i.value === "hello"
    ) as HTMLInputElement;
    change(hello, "hi");
    expect(inner().querySelector(".wgd-children")).toBeNull();
    expect(inner().querySelector(".wgd-node-summary")).not.toBeNull();
  });

  it("dropdowns hug their selected value and re-fit on change", () => {
    const { container } = designerWith({ tag: "div", children: [] });
    const tag = (): HTMLSelectElement =>
      container.querySelector(".wgd-tag") as HTMLSelectElement;
    expect(tag().style.width).toBe("calc(3ch + 1.2em + 18px)"); // 'div'
    tag().value = "section";
    tag().dispatchEvent(new Event("change", { bubbles: true }));
    // The commit re-renders the tree; the fresh select fits the new label.
    expect(tag().style.width).toBe("calc(7ch + 1.2em + 18px)"); // 'section'
    // Attr mode select is fitted too.
    const withAttr = designerWith({ tag: "div", attrs: { class: "wg-a" }, children: [] });
    const mode = withAttr.container.querySelector(".wgd-attr-mode") as HTMLSelectElement;
    expect(mode.style.width).toBe("calc(7ch + 1.2em + 18px)"); // 'literal'
  });

  it("path selects fit their selected path instead of stretching", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "probe",
      template: { tag: "div", children: [{ bind: "title" }] },
      descriptor: {
        description: "d",
        dataShape: "s",
        dataSchema: {
          type: "object",
          properties: { title: { type: "string" } }
        }
      }
    });
    const path = container.querySelector(".wgd-path") as HTMLSelectElement;
    expect(path).not.toBeNull();
    expect(path.style.width).toBe("calc(5ch + 1.2em + 18px)"); // 'title'
  });

  it("groups attributes under chrome distinct from the children rail", () => {
    const { container } = designerWith({
      tag: "div",
      attrs: { class: "wg-a" },
      children: ["x"]
    });
    const attrs = container.querySelector(".wgd-attrs") as HTMLElement;
    const children = container.querySelector(".wgd-children") as HTMLElement;
    expect(attrs).not.toBeNull();
    expect(children).not.toBeNull();
    expect(attrs.querySelector(".wgd-attr-row")).not.toBeNull();
    expect(attrs.querySelector(".wgd-node")).toBeNull(); // no nodes among attrs
    expect(children.querySelector(".wgd-attr-row")).toBeNull();
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

describe("panel integration", () => {
  it("data editors switch from tree to schema-driven form when a schema appears", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    // A schema-less widget → tree editor present in Sample data. (The
    // starter draft now ships WITH a schema, so load one without.)
    designer.loadWidget({
      kind: "schemaless",
      template: { tag: "div", children: [{ bind: "message" }] },
      descriptor: { description: "d", dataShape: "{ message }" }
    });
    expect(container.querySelector(".wgd-jsontree")).not.toBeNull();
    // Add a schema via the builder.
    const start = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("add a data schema")
    ) as HTMLButtonElement;
    start.click();
    expect(container.querySelector(".wgd-schemaform")).not.toBeNull();
  });
});
