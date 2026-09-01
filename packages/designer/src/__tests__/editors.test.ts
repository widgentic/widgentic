// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDesigner } from "../index.js";
import { validateTemplate } from "@widgentic/core";
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
    // mark required (the nullable toggle is also a checkbox — be precise)
    const requiredBox = builder.element.querySelector(
      'label[title="required"] input[type="checkbox"]'
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

describe("hints record editor", () => {
  function generalSection(container: HTMLElement): HTMLElement {
    return [...container.querySelectorAll(".wgd-section")].find(
      (s) => s.querySelector(".wgd-section-title")?.textContent === "General"
    ) as HTMLElement;
  }

  it("edits hints as name→doc rows beside the JSON tab, no legend", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    const general = generalSection(container);
    const hintsTabs = [...general.querySelectorAll(".wgd-tab")].map((b) => b.textContent);
    expect(hintsTabs).toEqual(["Tree", "JSON"]);
    // The plain "Hints" label stays; the (Record<name, doc>) legend is gone.
    expect(general.textContent).toContain("Hints");
    expect(general.textContent).not.toContain("Record<name, doc>");
    const add = [...general.querySelectorAll("button")].find(
      (b) => b.textContent === "+ hint"
    ) as HTMLButtonElement;
    add.click();
    change(general.querySelector(".wgd-rec-key") as HTMLInputElement, "columns");
    change(
      general.querySelector(".wgd-rec-value") as HTMLInputElement,
      "Column order for tables"
    );
    expect(designer.getDraft().descriptor.hints).toEqual({
      columns: "Column order for tables"
    });
  });

  it("removing the last hint drops the hints key entirely", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "probe",
      template: "x",
      descriptor: { description: "d", dataShape: "s", hints: { a: "doc" } }
    });
    const general = generalSection(container);
    const remove = [...general.querySelectorAll(".wgd-rec-row .wgd-icon")].find(
      (b) => b.getAttribute("title") === "Remove entry"
    ) as HTMLButtonElement;
    remove.click();
    expect(designer.getDraft().descriptor.hints).toBeUndefined();
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
    // A div is not activatable: no "action" here (see the button case below).
    expect(labels).toEqual(["attribute", "text", "bind", "element", "each", "when"]);
    (menu.querySelectorAll(".wgd-menu-item")[2] as HTMLButtonElement).click(); // bind
    expect(getTemplate()).toEqual({ tag: "div", children: [{ bind: "." }] });
  });

  it("offers an action only on buttons and links", () => {
    for (const tag of ["button", "a"]) {
      const { container } = designerWith({ tag, children: [] });
      (container.querySelector(".wgd-menu-toggle") as HTMLButtonElement).click();
      const labels = [...container.querySelectorAll(".wgd-menu .wgd-menu-item")].map((b) => b.textContent);
      expect(labels, tag).toContain("action");
    }
    const { container } = designerWith({ tag: "span", children: [] });
    (container.querySelector(".wgd-menu-toggle") as HTMLButtonElement).click();
    expect([...container.querySelectorAll(".wgd-menu .wgd-menu-item")].map((b) => b.textContent)).not.toContain("action");
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

  it("a root-array schema completes inside each \".\"", () => {
    // The shape most list APIs return — a currency ticker here. Before the
    // enumerator descended a root array, this produced zero candidates and
    // every path input degraded to free text.
    const tickerSchema = {
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
    };
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "ticker",
      template: { each: ".", template: { tag: "li", children: [{ bind: "ask" }] } },
      descriptor: { description: "d", dataShape: "s", dataSchema: tickerSchema }
    });
    // [0] is the each path, [1] is the bind inside the item scope.
    expect(optionsOf(container, 0)).toContain(".");
    const inner = optionsOf(container, 1);
    expect(inner).toContain("ask");
    expect(inner).toContain("bid");
    expect(inner).toContain("book");
    expect(inner).toContain("date");
    // a schema is present, so this is NOT the free-text fallback
    expect(container.querySelectorAll(".wgd-path").length).toBeGreaterThan(1);
  });

  it("a bind at the ROOT of a root-array schema offers only \".\" — no item property resolves there", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "ticker-root",
      template: { tag: "h1", children: [{ bind: "." }] },
      descriptor: {
        description: "d",
        dataShape: "s",
        dataSchema: { type: "array", items: { type: "object", properties: { ask: { type: "string" } } } }
      }
    });
    const options = optionsOf(container, 0);
    expect(options).toContain(".");
    expect(options).not.toContain("ask");
    designer.dispose();
  });

  it("offers \".\" for each only when the scope itself is an array", () => {
    // The invoice root is an object: "." is not a list to walk.
    const container = designerWithSchema({ each: "lines", template: "x" });
    expect(optionsOf(container)).not.toContain(".");
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

describe("which transforms each bind row offers", () => {
  function load(template: unknown) {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "probe",
      template,
      descriptor: {
        description: "d",
        dataShape: "s",
        dataExample: { book: "usdc_cop", email: "a@b.c" },
        dataSchema: {
          type: "object",
          properties: { book: { type: "string" }, email: { type: "string" } }
        }
      }
    });
    return { container, designer };
  }
  const mapButtons = (c: Element) =>
    [...c.querySelectorAll(".wgd-icon")].filter((b) => b.textContent === "map").length;

  it("a TEXT bind offers format and map, never prefix; map hides format once set", () => {
    const { container, designer } = load({ tag: "span", children: [{ bind: "status" }] });
    // The only bind in this template is the text child, so container-level
    // queries address its row.
    expect(container.querySelectorAll(".wgd-format-type")).toHaveLength(1);
    expect(container.querySelectorAll(".wgd-attr-prefix")).toHaveLength(0);
    const mapButton = [...container.querySelectorAll(".wgd-icon")].find((b) => b.textContent === "map") as HTMLButtonElement;
    expect(mapButton).toBeDefined();
    mapButton.click();
    const child = (designer.getDraft().template as unknown as { children: unknown[] }).children[0];
    expect(child).toEqual({ bind: "status", map: {} });
    expect(container.querySelectorAll(".wgd-format-type")).toHaveLength(0);
    expect(container.querySelector(".wgd-attr-map")).not.toBeNull();
    designer.dispose();
  });

  it("a bound ATTR offers all three, and the map button is REACHABLE", () => {
    const { container, designer } = load({ tag: "span", attrs: { class: { bind: "book" } } });
    const row = container.querySelector(".wgd-attr-row") as HTMLElement;
    expect(row.querySelectorAll(".wgd-format-type")).toHaveLength(1);
    expect(row.querySelectorAll(".wgd-attr-prefix")).toHaveLength(1);
    expect(mapButtons(row)).toBe(1);
    // The button lives in a .wgd-node-icons group hidden until its row is
    // hovered or focused. ONE reveal rule names every hosting row type, so a
    // row left out of it cannot ship present-but-invisible controls.
    const group = row.querySelector(".wgd-node-icons");
    expect(group).not.toBeNull();
    const styles = document.head.textContent ?? "";
    const reveal = /:is\(([^)]*)\):is\(:hover, :focus-within\) > \.wgd-node-icons/.exec(styles);
    expect(reveal).not.toBeNull();
    for (const rowType of [".wgd-node-row", ".wgd-st-row", ".wgd-attr-row"]) {
      expect(reveal?.[1]).toContain(rowType);
    }
    expect(group?.querySelectorAll(".wgd-icon")).toHaveLength(2); // map + remove
    designer.dispose();
  });

  it("clicking map commits the transform and hides the other two", () => {
    const { container, designer } = load({ tag: "span", attrs: { class: { bind: "book" } } });
    const button = [...container.querySelectorAll(".wgd-icon")].find(
      (b) => b.textContent === "map"
    ) as HTMLButtonElement;
    button.click();
    expect(
      (designer.getDraft().template as unknown as { attrs: Record<string, unknown> }).attrs.class
    ).toEqual({ bind: "book", map: {} });
    const row = container.querySelector(".wgd-attr-row") as HTMLElement;
    expect(row.querySelectorAll(".wgd-format-type")).toHaveLength(0);
    expect(row.querySelectorAll(".wgd-attr-prefix")).toHaveLength(0);
    designer.dispose();
  });

  it("the row wraps rather than clipping its trailing controls", () => {
    // Structural smoke only — the real guarantee is a computed-visibility
    // check in a browser (see TESTING.md); this catches an accidental
    // deletion of the rule.
    const { designer } = load({ tag: "span", attrs: { class: { bind: "book" } } });
    expect(document.head.textContent ?? "").toMatch(/\.wgd-attr-row \{[^}]*flex-wrap: wrap/);
    designer.dispose();
  });

  it("no per-attribute or per-element restriction on the transforms", () => {
    for (const [tag, attr] of [
      ["span", "title"],
      ["div", "class"],
      ["img", "alt"],
      ["a", "href"],
      ["p", "id"]
    ] as const) {
      const { container, designer } = load({ tag, attrs: { [attr]: { bind: "book" } } });
      const row = container.querySelector(".wgd-attr-row") as HTMLElement;
      expect(row.querySelectorAll(".wgd-format-type"), `${tag}/${attr}`).toHaveLength(1);
      expect(row.querySelectorAll(".wgd-attr-prefix"), `${tag}/${attr}`).toHaveLength(1);
      expect(mapButtons(row), `${tag}/${attr}`).toBe(1);
      designer.dispose();
    }
  });

  it("a LITERAL attr offers none of them until its mode becomes bind", () => {
    const { container, designer } = load({ tag: "span", attrs: { class: "static" } });
    const row = container.querySelector(".wgd-attr-row") as HTMLElement;
    expect(row.querySelectorAll(".wgd-format-type")).toHaveLength(0);
    expect(row.querySelectorAll(".wgd-attr-prefix")).toHaveLength(0);
    expect(mapButtons(row)).toBe(0);
    const mode = row.querySelector(".wgd-attr-mode") as HTMLSelectElement;
    mode.value = "bind";
    mode.dispatchEvent(new Event("change"));
    const bound = container.querySelector(".wgd-attr-row") as HTMLElement;
    expect(bound.querySelectorAll(".wgd-format-type")).toHaveLength(1);
    expect(mapButtons(bound)).toBe(1);
    designer.dispose();
  });
});

describe("bind format editor", () => {
  const tickerSchema = {
    type: "array",
    items: {
      type: "object",
      properties: { ask: { type: "string" }, date: { type: "string" } }
    }
  };

  function tickerDesigner(template: unknown) {
    const container = document.createElement("div");
    document.body.append(container);
    const designer = createDesigner(container);
    designer.loadWidget({
      kind: "ticker",
      template,
      descriptor: {
        description: "d",
        dataShape: "s",
        dataSchema: tickerSchema,
        dataExample: [{ ask: "3206.9905920000", date: "2026-09-01T02:04:47.257871358" }]
      }
    });
    return { container, designer };
  }

  it("authoring a currency format on a text bind reaches the draft and the preview", () => {
    const { container, designer } = tickerDesigner({
      each: ".",
      template: { tag: "li", children: [{ bind: "ask" }] }
    });
    // The bind row starts raw.
    const type = container.querySelector(".wgd-format-type") as HTMLSelectElement;
    expect(type.value).toBe("none");
    expect([...type.options].map((o) => o.value)).toEqual(["none", "number", "currency", "date"]);

    type.value = "currency";
    type.dispatchEvent(new Event("change"));

    // A complete spec is committed — the draft is never momentarily invalid.
    const bindOf = () =>
      (designer.getDraft().template as unknown as {
        template: { children: { bind: string; format?: Record<string, unknown> }[] };
      }).template.children[0];
    expect(bindOf()?.format).toEqual({
      type: "currency",
      currency: "USD",
      decimals: 2
    });

    const code = container.querySelector(".wgd-format-currency") as HTMLInputElement;
    code.value = "cop";
    code.dispatchEvent(new Event("change"));
    const decimals = container.querySelector(".wgd-format-decimals") as HTMLInputElement;
    decimals.value = "0";
    decimals.dispatchEvent(new Event("change"));

    expect(bindOf()?.format).toEqual({
      type: "currency",
      currency: "COP", // upper-cased for the author
      decimals: 0
    });
    // and the live preview renders the formatted amount
    expect(container.textContent).toContain("$3,207");
    designer.dispose();
  });

  it("a date pattern round-trips and previews", () => {
    const { container, designer } = tickerDesigner({
      each: ".",
      template: { tag: "li", children: [{ bind: "date" }] }
    });
    const type = container.querySelector(".wgd-format-type") as HTMLSelectElement;
    type.value = "date";
    type.dispatchEvent(new Event("change"));
    const pattern = container.querySelector(".wgd-format-pattern") as HTMLInputElement;
    expect(pattern.value).toBe("yyyy-MM-dd");
    pattern.value = "dd-MM-yyyy HH:mm";
    pattern.dispatchEvent(new Event("change"));
    expect(container.textContent).toContain("01-09-2026 02:04");
    designer.dispose();
  });

  it("switching back to raw drops the transform entirely", () => {
    const { container, designer } = tickerDesigner({
      each: ".",
      template: {
        tag: "li",
        children: [{ bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } }]
      }
    });
    expect(container.textContent).toContain("$3,207");
    const type = container.querySelector(".wgd-format-type") as HTMLSelectElement;
    expect(type.value).toBe("currency");
    type.value = "none";
    type.dispatchEvent(new Event("change"));
    const bind = (designer.getDraft().template as unknown as {
      template: { children: Record<string, unknown>[] };
    }).template.children[0];
    expect(bind).toEqual({ bind: "ask" });
    expect(container.textContent).toContain("3206.9905920000");
    designer.dispose();
  });

  it("an attribute bind carries a format, and it is mutually exclusive with map and prefix", () => {
    const { container, designer } = tickerDesigner({
      each: ".",
      template: { tag: "span", attrs: { title: { bind: "ask" } } }
    });
    const type = container.querySelector(".wgd-attr-row .wgd-format-type") as HTMLSelectElement;
    type.value = "number";
    type.dispatchEvent(new Event("change"));
    const attrOf = () =>
      (designer.getDraft().template as unknown as {
        template: { attrs: Record<string, unknown> };
      }).template.attrs.title;
    expect(attrOf()).toEqual({
      bind: "ask",
      format: { type: "number", decimals: 2 }
    });
    // with a format set, the map button and the prefix input are gone —
    // one transform per value, mirroring the validator
    expect(container.querySelector(".wgd-attr-prefix")).toBeNull();
    expect(
      [...container.querySelectorAll(".wgd-attr-row .wgd-icon")].some(
        (b) => b.textContent === "map"
      )
    ).toBe(false);
    designer.dispose();
  });

  it("a format authored in the designer passes template validation", () => {
    const { container, designer } = tickerDesigner({
      each: ".",
      template: { tag: "li", children: [{ bind: "ask" }] }
    });
    const type = container.querySelector(".wgd-format-type") as HTMLSelectElement;
    type.value = "currency";
    type.dispatchEvent(new Event("change"));
    const draft = designer.getDraft();
    expect(validateTemplate(draft.template).ok).toBe(true);
    designer.dispose();
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

describe("attr transforms in the tree", () => {
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

  const withBindAttr = {
    tag: "a",
    attrs: { href: { bind: "email" } },
    children: [{ bind: "email" }]
  };

  it("authors a prefix from the row, preserving it across path edits", () => {
    const { container, getTemplate } = designerWith(withBindAttr);
    const prefix = container.querySelector(".wgd-attr-prefix") as HTMLInputElement;
    change(prefix, "mailto:");
    expect((getTemplate() as { attrs: { href: unknown } }).attrs.href).toEqual({
      bind: "email",
      prefix: "mailto:"
    });
    // Editing the bind path keeps the prefix — rebuild() never drops fields.
    const pathInput = container.querySelector(".wgd-attr-value") as HTMLInputElement;
    change(pathInput, "contact");
    expect((getTemplate() as { attrs: { href: unknown } }).attrs.href).toEqual({
      bind: "contact",
      prefix: "mailto:"
    });
    // Clearing the prefix drops the field entirely.
    change(container.querySelector(".wgd-attr-prefix") as HTMLInputElement, "");
    expect((getTemplate() as { attrs: { href: unknown } }).attrs.href).toEqual({
      bind: "contact"
    });
  });

  it("authors a value→literal map with a default", () => {
    const { container, getTemplate } = designerWith({
      tag: "span",
      attrs: { class: { bind: "status" } },
      children: []
    });
    const addMap = [...container.querySelectorAll(".wgd-attr-row button")].find(
      (b) => b.textContent === "map"
    ) as HTMLButtonElement;
    addMap.click();
    // The map block appears; the prefix input hides (one transform per value).
    expect(container.querySelector(".wgd-attr-map")).not.toBeNull();
    expect(container.querySelector(".wgd-attr-prefix")).toBeNull();
    // Add a mapping row and rename it.
    const addRow = [...container.querySelectorAll(".wgd-attr-map button")].find(
      (b) => b.textContent === "+ mapping"
    ) as HTMLButtonElement;
    addRow.click();
    change(
      container.querySelector(".wgd-attr-map .wgd-rec-key") as HTMLInputElement,
      "do-not-contact"
    );
    change(
      container.querySelector(".wgd-attr-map .wgd-rec-value") as HTMLInputElement,
      "wg-status-danger"
    );
    change(
      container.querySelector(".wgd-attr-map-default") as HTMLInputElement,
      "wg-status"
    );
    expect((getTemplate() as { attrs: { class: unknown } }).attrs.class).toEqual({
      bind: "status",
      map: { "do-not-contact": "wg-status-danger" },
      default: "wg-status"
    });
  });

  it("loads transform-carrying templates into the controls, round-tripping", () => {
    const template = {
      tag: "div",
      attrs: {
        class: {
          bind: "status",
          map: { active: "wg-status-success" },
          default: "wg-status"
        }
      },
      children: [{ tag: "a", attrs: { href: { bind: "phone", prefix: "tel:" } }, children: [] }]
    };
    const { container, getTemplate } = designerWith(template);
    // The map rows and default show the loaded values…
    expect(
      (container.querySelector(".wgd-attr-map .wgd-rec-key") as HTMLInputElement).value
    ).toBe("active");
    expect(
      (container.querySelector(".wgd-attr-map-default") as HTMLInputElement).value
    ).toBe("wg-status");
    // …the nested anchor's prefix input shows tel:…
    expect(
      (container.querySelector(".wgd-attr-prefix") as HTMLInputElement).value
    ).toBe("tel:");
    // …and the draft is untouched by loading alone.
    expect(getTemplate()).toEqual(template);
  });

  it("emptying the map drops the transform back to a plain bind", () => {
    const { container, getTemplate } = designerWith({
      tag: "span",
      attrs: { class: { bind: "status", map: { a: "x" } } },
      children: []
    });
    const removeRow = [...container.querySelectorAll(".wgd-attr-map .wgd-icon")].find(
      (b) => b.getAttribute("title") === "Remove entry"
    ) as HTMLButtonElement;
    removeRow.click();
    expect((getTemplate() as { attrs: { class: unknown } }).attrs.class).toEqual({
      bind: "status"
    });
  });
});

describe("nullable type arrays in the schema builder", () => {
  /** The agent's real email field — the shape that collapsed to `any`. */
  const emailField = {
    type: "object",
    properties: {
      email: {
        type: ["string", "null"],
        pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"
      }
    }
  };

  it("shows the primary type, the nullable toggle, and the pattern", () => {
    const changes: unknown[] = [];
    const builder = createSchemaBuilder(emailField, (s) => changes.push(s));
    document.body.append(builder.element);
    // The property's type select reads string, not any…
    const selects = [...builder.element.querySelectorAll(".wgd-sb-type")] as HTMLSelectElement[];
    const propSelect = selects[1] as HTMLSelectElement; // [0] is the root object
    expect(propSelect.value).toBe("string");
    // …the nullable toggle is set…
    const nullBoxes = [...builder.element.querySelectorAll(".wgd-sb-null input")] as HTMLInputElement[];
    expect((nullBoxes[1] as HTMLInputElement).checked).toBe(true);
    // …and the pattern constraint is visible with its value.
    const pattern = [...builder.element.querySelectorAll(".wgd-sb-constraint")].find(
      (i) => (i as HTMLInputElement).placeholder.startsWith("pattern")
    ) as HTMLInputElement;
    expect(pattern).toBeDefined();
    expect(pattern.value).toBe("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
  });

  it("the toggle round-trips between string and the array form, keeping the pattern", () => {
    const changes: Record<string, unknown>[] = [];
    const builder = createSchemaBuilder(emailField, (s) => changes.push(s as Record<string, unknown>));
    document.body.append(builder.element);
    const nullBox = [...builder.element.querySelectorAll(".wgd-sb-null input")][1] as HTMLInputElement;
    nullBox.checked = false;
    nullBox.dispatchEvent(new Event("change", { bubbles: true }));
    let email = (changes.at(-1)?.properties as Record<string, Record<string, unknown>>).email!;
    expect(email.type).toBe("string");
    expect(email.pattern).toBe("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    // Toggle back on: the array form returns.
    const nullBox2 = [...builder.element.querySelectorAll(".wgd-sb-null input")][1] as HTMLInputElement;
    nullBox2.checked = true;
    nullBox2.dispatchEvent(new Event("change", { bubbles: true }));
    email = (changes.at(-1)?.properties as Record<string, Record<string, unknown>>).email!;
    expect(email.type).toEqual(["string", "null"]);
  });

  it("a type change under the toggle keeps the array form", () => {
    const changes: Record<string, unknown>[] = [];
    const builder = createSchemaBuilder(
      { type: "object", properties: { count: { type: ["string", "null"] } } },
      (s) => changes.push(s as Record<string, unknown>)
    );
    document.body.append(builder.element);
    const propSelect = [...builder.element.querySelectorAll(".wgd-sb-type")][1] as HTMLSelectElement;
    propSelect.value = "number";
    propSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const count = (changes.at(-1)?.properties as Record<string, Record<string, unknown>>).count!;
    expect(count.type).toEqual(["number", "null"]);
  });
});
