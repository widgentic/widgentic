// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { invoiceWidget } from "../../../apps/mcp-server/widgets/invoice.js";
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
    // …and the JSON pane carries the template source.
    const json = container.querySelector(".wgd-template-json") as HTMLTextAreaElement;
    expect(json.value).toContain('"$meta.title"');
  });

  it("lays out definition panels left and presentation panels right", () => {
    const container = host();
    createDesigner(container);
    const left = container.querySelector(".wgd-panels") as HTMLElement;
    const right = container.querySelector(".wgd-side") as HTMLElement;
    expect(left.textContent).toContain("General");
    expect(left.textContent).toContain("Template");
    expect(left.textContent).toContain("Import / Export");
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
    type(
      field(container, "styles (Record<selector, Record<property, value>>)"),
      JSON.stringify({ ".rogue": { color: "red" } })
    );
    expect(container.textContent).toContain(".rogue");
    expect(container.textContent).toContain("skipped");
  });
});

describe("preview controls", () => {
  it("preview-kind selector renders built-ins for theme previews", () => {
    const container = host();
    createDesigner(container);
    const select = container.querySelector(".wgd-preview-kind") as HTMLSelectElement;
    select.value = "card";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(container.querySelector(".wgd-preview")?.innerHTML).toContain("wg-card");
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
