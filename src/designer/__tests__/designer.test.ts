// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { invoiceWidget } from "../../../examples/mcp-server/widgets/invoice.js";
import {
  createDesigner,
  defineDesignerElement,
  exportWidgetJson,
  importWidgetJson,
  toTypeScriptModule
} from "../index.js";
import { starterDraft } from "../store.js";

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** Find a labeled control by its `.wgd-field-label` text. */
function field(root: Element, label: string): HTMLInputElement | HTMLTextAreaElement {
  for (const span of root.querySelectorAll(".wgd-field-label")) {
    if (span.textContent === label) {
      const control = span.parentElement?.querySelector("input, textarea");
      if (control) return control as HTMLInputElement;
      // Row layouts place the control in a sibling row.
      const sibling = span.closest("label")?.querySelector("input, textarea");
      if (sibling) return sibling as HTMLInputElement;
    }
  }
  throw new Error(`No field labeled '${label}'`);
}

function type(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("designer shell", () => {
  it("mounts, previews the starter draft, and disposes cleanly", () => {
    const container = host();
    const designer = createDesigner(container);
    expect(container.querySelector(".wgd-root")).not.toBeNull();
    expect(container.querySelector(".wgd-preview")?.innerHTML).toContain(
      "Hello from the widgentic designer"
    );
    designer.dispose();
    expect(container.querySelector(".wgd-root")).toBeNull();
  });

  it("renders the template projections before any edit (initial refresh)", () => {
    const container = host();
    createDesigner(container);
    // Tree editor shows the starter root node immediately…
    expect(container.querySelector(".wgd-tree .wgd-node")).not.toBeNull();
    // …and the JSON pane carries the template source. The starter binds
    // only schema-declared properties — no $meta (unvalidated) paths.
    const json = container.querySelector(".wgd-template-json") as HTMLTextAreaElement;
    expect(json.value).toContain('"title"');
    expect(json.value).not.toContain("$meta");
  });

  it("starter draft declares everything it binds in its dataSchema", () => {
    const draft = starterDraft();
    const schema = draft.descriptor.dataSchema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties).sort()).toEqual(["message", "title"]);
    expect(schema.required).toEqual(["message"]);
    expect(JSON.stringify(draft.template)).not.toContain("$meta");
  });

  it("lays out definition panels left and presentation panels right", () => {
    const container = host();
    createDesigner(container);
    const left = container.querySelector(".wgd-panels") as HTMLElement;
    const right = container.querySelector(".wgd-side") as HTMLElement;
    expect(left.textContent).toContain("General");
    expect(left.textContent).toContain("Template");
    // Import and export are independent sections, import first.
    const ioTitles = [...left.querySelectorAll(".wgd-io .wgd-section-title")].map(
      (el) => el.textContent
    );
    expect(ioTitles).toEqual(["Import", "Export"]);
    expect(right.textContent).toContain("Data for preview");
    expect(right.textContent).toContain("Preview theme");
    expect(right.querySelector(".wgd-preview")).not.toBeNull();
  });

  it("gives textareas the full panel width", () => {
    const container = host();
    createDesigner(container);
    const chrome = document.head.querySelector(
      "style[data-widgentic-designer]"
    ) as HTMLStyleElement;
    // The template JSON pane builds its textarea directly (not via the
    // labeled-field helper), so full width has to come from the stylesheet.
    expect(chrome.textContent).toMatch(/\.wgd-textarea\s*\{[^}]*width:\s*100%/);
    expect(chrome.textContent).toMatch(/\.wgd-textarea\s*\{[^}]*box-sizing:\s*border-box/);
  });

  it("supports a dark chrome, pinned or system-driven", () => {
    const auto = host();
    createDesigner(auto);
    // Default follows prefers-color-scheme — no attribute pins it.
    expect(auto.querySelector(".wgd-root")?.getAttribute("data-wgd-theme")).toBeNull();

    const dark = host();
    createDesigner(dark, { appearance: "dark" });
    expect(dark.querySelector(".wgd-root")?.getAttribute("data-wgd-theme")).toBe("dark");

    const chrome = document.head.querySelector(
      "style[data-widgentic-designer]"
    ) as HTMLStyleElement;
    expect(chrome.textContent).toContain("prefers-color-scheme: dark");
    expect(chrome.textContent).toContain('.wgd-root[data-wgd-theme="dark"]');
  });

  it("keeps two instances isolated", () => {
    const a = createDesigner(host());
    const bContainer = host();
    const b = createDesigner(bContainer);
    type(field(bContainer, "Kind (id)"), "only-b");
    expect(b.getDraft().kind).toBe("only-b");
    expect(a.getDraft().kind).toBe("my-widget");
  });

  it("loadWidget accepts the invoice example and rejects invalid definitions", () => {
    const designer = createDesigner(host());
    expect(designer.loadWidget(invoiceWidget)).toEqual({ ok: true });
    expect(designer.getDraft().kind).toBe("invoice");
    const bad = designer.loadWidget({ kind: "x", template: { tag: "a", attrs: { onclick: "x" } }, descriptor: { description: "d" } });
    expect(bad.ok).toBe(false);
    expect(designer.getDraft().kind).toBe("invoice"); // untouched
  });
});

describe("template editing", () => {
  it("JSON pane parse errors never destroy the tree", () => {
    const container = host();
    const designer = createDesigner(container);
    const json = container.querySelector(".wgd-template-json") as HTMLTextAreaElement;
    type(json, "{ not json");
    expect(designer.getDraft().template).toEqual(starterDraft().template);
    expect(container.textContent).toContain("Invalid JSON");
  });

  it("a forbidden attribute surfaces as a diagnostic at the node and freezes the preview", () => {
    const container = host();
    const designer = createDesigner(container);
    const before = container.querySelector(".wgd-preview")?.innerHTML;
    const json = container.querySelector(".wgd-template-json") as HTMLTextAreaElement;
    type(json, JSON.stringify({ tag: "button", attrs: { onclick: "x()" } }));
    // Draft accepted (valid JSON), diagnostic shown, preview frozen.
    expect(designer.getDraft().template).toEqual({ tag: "button", attrs: { onclick: "x()" } });
    expect(container.textContent).toContain("FORBIDDEN_ATTRIBUTE");
    const banner = container.querySelector(".wgd-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
    expect(container.querySelector(".wgd-preview")?.innerHTML).toBe(before);
  });

  it("valid same-shape edits patch the preview in place", () => {
    const container = host();
    createDesigner(container);
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    const mounted = preview.firstChild;
    const json = container.querySelector(".wgd-template-json") as HTMLTextAreaElement;
    const edited = starterDraft().template as { children: unknown[] };
    const next = JSON.parse(JSON.stringify(edited)) as { children: unknown[] };
    next.children[1] = { bind: "message" }; // same shape, same content — then tweak data below
    type(json, JSON.stringify(next));
    expect(preview.firstChild).toBe(mounted);
  });
});

describe("data and styles diagnostics", () => {
  it("cross-checks dataExample against dataSchema in the panel", () => {
    const container = host();
    createDesigner(container);
    type(
      field(container, "dataSchema (JSON-Schema subset: type/properties/required/items/enum/pattern)"),
      JSON.stringify({ type: "object", required: ["missing"] })
    );
    expect(container.textContent).toContain("MISSING_FIELD");
    expect(container.textContent).toContain("data.missing");
  });

  it("flags style entries the renderer would skip", () => {
    const container = host();
    createDesigner(container);
    // The styles JSON pane carries no legend — the section title names it.
    const stylesSection = [...container.querySelectorAll(".wgd-section")].find(
      (s) => s.querySelector(".wgd-section-title")?.textContent?.startsWith("Styles")
    ) as HTMLElement;
    type(
      stylesSection.querySelector("textarea") as HTMLTextAreaElement,
      JSON.stringify({ ".rogue": { color: "red" } })
    );
    expect(container.textContent).toContain(".rogue");
    expect(container.textContent).toContain("skipped");
  });
});

describe("preview controls", () => {
  it("offers no kind selection — the preview renders the draft only", () => {
    const container = host();
    createDesigner(container);
    // Previewing arbitrary kinds under a theme is the theme designer's job.
    expect(container.querySelector(".wgd-preview-kind")).toBeNull();
    expect(container.querySelector(".wgd-preview")?.innerHTML).toContain(
      "wg-template"
    );
  });
});

describe("preview never blanks", () => {
  it("shows an empty state when the FIRST draft is invalid", () => {
    // Freezing needs something to freeze on; before this the pane was
    // simply left empty — the one state the contract forbids.
    const container = host();
    createDesigner(container, {
      initialWidget: {
        kind: "probe",
        template: { tag: "div", attrs: { onclick: "x()" }, children: [] },
        descriptor: { description: "d", dataShape: "s" }
      }
    });
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.innerHTML).not.toBe("");
    expect(preview.querySelector(".wgd-preview-empty")).not.toBeNull();
    const banner = container.querySelector(".wgd-banner") as HTMLElement;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("FORBIDDEN_ATTRIBUTE");
  });

  it("shows an empty state when the first draft's kind is reserved", () => {
    const container = host();
    createDesigner(container, {
      initialWidget: {
        kind: "card", // valid template, unusable kind
        template: { tag: "div", children: ["hi"] },
        descriptor: { description: "d", dataShape: "s" }
      }
    });
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.querySelector(".wgd-preview-empty")).not.toBeNull();
  });

  it("the empty state gives way to the first valid render", () => {
    const container = host();
    const designer = createDesigner(container, {
      initialWidget: {
        kind: "card",
        template: { tag: "div", children: ["hi"] },
        descriptor: { description: "d", dataShape: "s" }
      }
    });
    expect(
      container.querySelector(".wgd-preview .wgd-preview-empty")
    ).not.toBeNull();
    designer.loadWidget({
      kind: "fine",
      template: { tag: "div", children: ["rendered"] },
      descriptor: { description: "d", dataShape: "s" }
    });
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.querySelector(".wgd-preview-empty")).toBeNull();
    expect(preview.textContent).toContain("rendered");
  });
});

describe("theme diagnostics surface", () => {
  it("shows the theme validator's error in the panel that owns the value", () => {
    const container = host();
    createDesigner(container, {
      themes: [{ name: "bad", tokens: { bg: "url(https://evil.example/x)" } }]
    });
    const select = container.querySelector(".wgd-theme-select") as HTMLSelectElement;
    select.value = "bad";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const previewSection = [...container.querySelectorAll(".wgd-section")].find(
      (s) => s.querySelector(".wgd-section-title")?.textContent === "Preview"
    ) as HTMLElement;
    const shown = [...previewSection.querySelectorAll(".wgd-diagnostic")].filter(
      (d) => !(d as HTMLElement).hidden
    );
    expect(shown.length).toBeGreaterThan(0);
    expect(previewSection.textContent).toContain("INVALID_TOKEN_VALUE");
  });

  it("clears the diagnostic when a safe theme is selected", () => {
    const container = host();
    createDesigner(container, {
      themes: [
        { name: "bad", tokens: { bg: "url(https://evil.example/x)" } },
        { name: "good", tokens: { bg: "#0f131c" } }
      ]
    });
    const select = container.querySelector(".wgd-theme-select") as HTMLSelectElement;
    select.value = "bad";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.value = "good";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(container.textContent).not.toContain("INVALID_TOKEN_VALUE");
  });
});

describe("read-only mode", () => {
  it("inerts editing surfaces but keeps the theme selector and preview live", () => {
    const container = host();
    const designer = createDesigner(container, {
      themes: [{ name: "dark", tokens: { bg: "#0f131c" } }],
      readOnly: true
    });
    const root = container.querySelector(".wgd-root") as HTMLElement;
    expect(root.classList.contains("wgd-readonly")).toBe(true);
    // Every editing section body is inert: the whole definition column
    // plus the right column's preview-data and styles sections.
    // …except the view-only Export section: read-only restricts editing,
    // not looking.
    const leftBodies = [
      ...root.querySelectorAll(".wgd-panels .wgd-section-body")
    ].filter((b) => !b.parentElement?.classList.contains("wgd-view-only"));
    expect(leftBodies.length).toBeGreaterThan(3);
    for (const body of leftBodies) expect(body.hasAttribute("inert")).toBe(true);
    expect(
      root.querySelector(".wgd-view-only > .wgd-section-body")?.hasAttribute("inert")
    ).toBe(false);
    for (const body of root.querySelectorAll(".wgd-edit-only > .wgd-section-body")) {
      expect(body.hasAttribute("inert")).toBe(true);
    }
    // The theme panel stays operable: selecting a theme updates the draft
    // and the preview even while read-only.
    const themeSelect = root.querySelector(".wgd-theme-select") as HTMLSelectElement;
    expect(themeSelect.closest("[inert]")).toBeNull();
    themeSelect.value = "dark";
    themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(designer.getDraft().theme).toEqual({ bg: "#0f131c" });
  });

  it("de-emphasizes the inert surfaces visibly", () => {
    const container = host();
    createDesigner(container, { readOnly: true });
    const chrome = document.head.querySelector(
      "style[data-widgentic-designer]"
    ) as HTMLStyleElement;
    // Opacity alone was invisible on dark chrome (seen live): read-only
    // also flattens the control borders so fields read as plain values.
    expect(chrome.textContent).toMatch(
      /\.wgd-readonly \[inert\] \.wgd-input[^{]*\{[^}]*border-color:\s*transparent/
    );
  });

  it("leaves the Export section operable — read-only restricts editing, not looking", () => {
    const container = host();
    createDesigner(container, { readOnly: true });
    const exportButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Export widget JSON"
    ) as HTMLButtonElement;
    expect(exportButton.closest("[inert]")).toBeNull();
    exportButton.click();
    const output = container.querySelector(
      ".wgd-view-only textarea"
    ) as HTMLTextAreaElement;
    expect(JSON.parse(output.value)).toMatchObject({ kind: expect.any(String) });
  });

  it("setReadOnly toggles both ways", () => {
    const container = host();
    const designer = createDesigner(container);
    const root = container.querySelector(".wgd-root") as HTMLElement;
    expect(root.querySelector(".wgd-section-body[inert]")).toBeNull();
    designer.setReadOnly(true);
    expect(root.querySelector(".wgd-panels .wgd-section-body[inert]")).not.toBeNull();
    designer.setReadOnly(false);
    expect(root.querySelector(".wgd-section-body[inert]")).toBeNull();
  });
});

describe("import/export", () => {
  it("round-trips the invoice example", () => {
    const designer = createDesigner(host());
    designer.loadWidget(invoiceWidget);
    const exported = exportWidgetJson(designer.getDraft());
    const imported = importWidgetJson(exported);
    expect(imported).toMatchObject({ ok: true });
    if (imported.ok) {
      expect(imported.definition).toEqual({
        kind: invoiceWidget.kind,
        template: invoiceWidget.template,
        descriptor: invoiceWidget.descriptor
      });
    }
  });

  it("copy-as-TypeScript emits a CustomWidget module body", () => {
    const designer = createDesigner(host());
    designer.loadWidget(invoiceWidget);
    const module = toTypeScriptModule(designer.getDraft());
    expect(module).toContain('import type { CustomWidget } from "./index.js";');
    expect(module).toContain("export const invoiceWidget: CustomWidget =");
    expect(module).toContain('"kind": "invoice"');
  });
});

describe("custom element", () => {
  it("registers only on the explicit call and emits change events", () => {
    expect(customElements.get("widgentic-designer")).toBeUndefined();
    defineDesignerElement();
    expect(customElements.get("widgentic-designer")).toBeDefined();

    const el = document.createElement("widgentic-designer");
    const events: unknown[] = [];
    el.addEventListener("widgentic-change", (event) =>
      events.push((event as CustomEvent).detail)
    );
    document.body.appendChild(el);
    const kind = field(el, "Kind (id)");
    type(kind, "from-element");
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1] as { draft: { kind: string } };
    expect(last.draft.kind).toBe("from-element");
    el.remove();
    expect(el.querySelector(".wgd-root")).toBeNull();
  });
});

describe("shared data schemas in the widget designer", () => {
  const person = {
    name: "person",
    label: "Person",
    schema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } }
    }
  };

  function schemaSection(container: HTMLElement): HTMLElement {
    return [...container.querySelectorAll(".wgd-section")].find(
      (s) => s.querySelector(".wgd-section-title")?.textContent === "Data schema"
    ) as HTMLElement;
  }

  it("shared mode stores the ref, shows the schema read-only, and inline restores", () => {
    const container = host();
    const designer = createDesigner(container, { schemas: [person] });
    const section = schemaSection(container);
    const mode = section.querySelector(".wgd-schema-mode") as HTMLSelectElement;
    mode.value = "shared";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    const draft = designer.getDraft();
    expect(draft.descriptor.dataSchemaRef).toBe("person");
    expect(draft.descriptor.dataSchema).toBeUndefined();
    const sharedView = section.querySelector(".wgd-schema-shared") as HTMLTextAreaElement;
    expect(sharedView.readOnly).toBe(true);
    expect(sharedView.value).toContain('"name"');
    // Back to inline: the ref drops and an editable copy seeds the schema.
    mode.value = "inline";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    const after = designer.getDraft();
    expect(after.descriptor.dataSchemaRef).toBeUndefined();
    expect(after.descriptor.dataSchema).toEqual(person.schema);
  });

  it("refs resolve locally: dataExample validates against the shared schema", () => {
    const container = host();
    const designer = createDesigner(container, { schemas: [person] });
    designer.loadWidget({
      kind: "person-card",
      template: { tag: "div", children: [{ bind: "name" }] },
      descriptor: {
        description: "d",
        dataShape: "s",
        dataExample: { role: "no name here" },
        dataSchemaRef: "person"
      }
    });
    // Loading a ref-carrying widget lands in shared mode…
    const section = schemaSection(container);
    const mode = section.querySelector(".wgd-schema-mode") as HTMLSelectElement;
    expect(mode.value).toBe("shared");
    // …and the example check runs against the RESOLVED schema.
    expect(container.textContent).toContain("MISSING_FIELD");
    expect(container.textContent).toContain("name");
  });

  it("an unknown ref surfaces a diagnostic at the section", () => {
    const container = host();
    const designer = createDesigner(container); // no schemas supplied
    designer.loadWidget({
      kind: "person-card",
      template: { tag: "div", children: ["x"] },
      descriptor: { description: "d", dataShape: "s", dataSchemaRef: "person" }
    });
    const section = schemaSection(container);
    expect(section.textContent).toContain("unknown schema 'person'");
  });

  it("export carries the ref exactly as authored", () => {
    const container = host();
    const designer = createDesigner(container, { schemas: [person] });
    const section = schemaSection(container);
    const mode = section.querySelector(".wgd-schema-mode") as HTMLSelectElement;
    mode.value = "shared";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    const draft = designer.getDraft();
    const exported = JSON.parse(
      exportWidgetJson(draft)
    ) as { descriptor: Record<string, unknown> };
    expect(exported.descriptor.dataSchemaRef).toBe("person");
    expect(exported.descriptor.dataSchema).toBeUndefined();
  });

  it("without supplied schemas the shared option is disabled", () => {
    const container = host();
    createDesigner(container);
    const section = schemaSection(container);
    const shared = section.querySelector(
      '.wgd-schema-mode option[value="shared"]'
    ) as HTMLOptionElement;
    expect(shared.disabled).toBe(true);
  });
});
