// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { darkTheme } from "../../theming/index.js";
import type { ThemeEntry } from "../../theming/index.js";
import {
  createDesigner,
  createThemeDesigner,
  defineThemeDesignerElement
} from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function field(root: Element, label: string): HTMLInputElement {
  for (const span of root.querySelectorAll(".wgd-field-label")) {
    if (span.textContent === label) {
      const control =
        span.parentElement?.querySelector("input, textarea") ??
        span.closest("label")?.querySelector("input, textarea");
      if (control) return control as HTMLInputElement;
    }
  }
  throw new Error(`No field labeled '${label}'`);
}

function type(control: HTMLInputElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("standalone theme designer", () => {
  it("mounts a theme editor with no widget-authoring panels", () => {
    const container = host();
    const designer = createThemeDesigner(container);
    expect(container.querySelector(".wgd-theme-designer")).not.toBeNull();
    expect(container.querySelector(".wgd-preview")).not.toBeNull();
    // Widget-only panels must be absent.
    expect(container.textContent).not.toContain("Template");
    expect(container.textContent).not.toContain("Data schema");
    designer.dispose();
    expect(container.querySelector(".wgd-root")).toBeNull();
  });

  it("edits identity and tokens, previewing immediately", () => {
    const container = host();
    const designer = createThemeDesigner(container);
    type(field(container, "Name (id)"), "brand");
    type(field(container, "--wg-surface"), "#1a2130");
    const entry = designer.getTheme();
    expect(entry.name).toBe("brand");
    expect(entry.tokens.surface).toBe("#1a2130");
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--wg-surface")).toBe("#1a2130");
  });

  it("flags unsafe values and withholds them from the preview", () => {
    const container = host();
    createThemeDesigner(container);
    type(field(container, "--wg-bg"), "url(https://evil.example/x)");
    expect(container.textContent).toContain("INVALID_TOKEN_VALUE");
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--wg-bg")).toBe("");
  });

  it("adds, edits and removes custom variables", () => {
    const container = host();
    const designer = createThemeDesigner(container);
    const add = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "+ variable"
    ) as HTMLButtonElement;
    add.click();
    const rows = container.querySelectorAll(".wgd-attr-row");
    expect(rows).toHaveLength(1);
    const nameInput = rows[0]?.querySelector("input") as HTMLInputElement;
    nameInput.value = "x-badge-gap";
    nameInput.dispatchEvent(new Event("change", { bubbles: true }));
    // The rename re-renders the rows, so re-query before typing the value.
    const valueInput = container.querySelectorAll(
      ".wgd-attr-row input"
    )[1] as HTMLInputElement;
    type(valueInput, "4px");

    expect(designer.getTheme().tokens["x-badge-gap"]).toBe("4px");
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--wg-x-badge-gap")).toBe("4px");

    const remove = container.querySelector(".wgd-attr-row .wgd-icon") as HTMLButtonElement;
    remove.click();
    expect(designer.getTheme().tokens["x-badge-gap"]).toBeUndefined();
  });

  it("rejects malformed custom names without losing the value", () => {
    const container = host();
    const designer = createThemeDesigner(container);
    (
      [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "+ variable"
      ) as HTMLButtonElement
    ).click();
    const nameInput = container.querySelector(".wgd-attr-row input") as HTMLInputElement;
    nameInput.value = "Bad_Name";
    nameInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(container.textContent).toContain("not a valid custom name");
    expect(designer.getTheme().tokens["x-custom"]).toBeDefined();
  });

  it("round-trips the registry entry shape and rejects invalid imports", () => {
    const container = host();
    const designer = createThemeDesigner(container, {
      initialTheme: { name: "dark-copy", label: "Dark copy", tokens: darkTheme }
    });
    const exported = designer.getTheme();
    expect(exported).toEqual({
      name: "dark-copy",
      label: "Dark copy",
      tokens: darkTheme
    });

    const reloaded = createThemeDesigner(host());
    expect(reloaded.loadTheme(exported)).toEqual({ ok: true });
    expect(reloaded.getTheme()).toEqual(exported);

    const bad = reloaded.loadTheme({ name: "x", tokens: { sneaky: "red" } });
    expect(bad.ok).toBe(false);
    expect(reloaded.getTheme().name).toBe("dark-copy"); // untouched
  });

  it("import updates the identity fields, not just the model", () => {
    // Regression: name/label/description inputs were created once and never
    // re-read the entry, so an import left stale text on screen.
    const container = host();
    const designer = createThemeDesigner(container);
    expect(field(container, "Name (id)").value).toBe("my-theme");

    const result = designer.loadTheme({
      name: "midnight-neon",
      label: "Midnight Neon",
      description: "High-contrast dark theme.",
      tokens: { accent: "#22d3ee" }
    });
    expect(result).toEqual({ ok: true });
    expect(field(container, "Name (id)").value).toBe("midnight-neon");
    expect(field(container, "Label").value).toBe("Midnight Neon");
    expect(field(container, "Description").value).toBe("High-contrast dark theme.");
    // …and the token controls follow too.
    expect(field(container, "--wg-accent").value).toBe("#22d3ee");
  });

  it("registers its element only on the explicit call", () => {
    expect(customElements.get("widgentic-theme-designer")).toBeUndefined();
    defineThemeDesignerElement();
    expect(customElements.get("widgentic-theme-designer")).toBeDefined();

    const el = document.createElement("widgentic-theme-designer");
    const events: unknown[] = [];
    el.addEventListener("widgentic-change", (event) =>
      events.push((event as CustomEvent).detail)
    );
    document.body.appendChild(el);
    type(field(el, "Name (id)"), "from-element");
    const last = events.at(-1) as { theme: ThemeEntry };
    expect(last.theme.name).toBe("from-element");
  });
});

describe("widget designer theme selection", () => {
  const themes: ThemeEntry[] = [
    { name: "light", label: "Light", tokens: {} },
    { name: "dark", label: "Dark", tokens: darkTheme }
  ];

  it("offers supplied themes and applies the selection to the preview", () => {
    const container = host();
    createDesigner(container, { themes });
    const select = container.querySelector(".wgd-theme-select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "light", "dark"]);
    select.value = "dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    expect(preview.style.getPropertyValue("--wg-bg")).toBe(darkTheme.bg);
  });

  it("does not edit theme tokens any more", () => {
    const container = host();
    createDesigner(container, { themes });
    // Token EDITING belongs to the theme designer; the widget designer's
    // token panel is a read-only reference (no inputs, no picker swatches).
    expect(container.querySelector(".wgd-swatch")).toBeNull();
    const reference = container.querySelector(".wgd-token-ref");
    expect(reference).not.toBeNull();
    expect(reference?.querySelector("input")).toBeNull();
  });

  it("token reference shows the selected entry's values over the defaults", () => {
    const container = host();
    createDesigner(container, { themes });
    const rowFor = (name: string) =>
      [...container.querySelectorAll(".wgd-token-ref-row")].find((row) =>
        row.querySelector(".wgd-token-ref-name")?.textContent === `--wg-${name}`
      );
    // Defaults first ("none" selected).
    const defaultBg = rowFor("bg")?.querySelector(".wgd-token-ref-value")?.textContent;
    expect(defaultBg).toBeTruthy();

    const select = container.querySelector(".wgd-theme-select") as HTMLSelectElement;
    select.value = "dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const darkEntry = themes.find((t) => t.name === "dark");
    expect(rowFor("bg")?.querySelector(".wgd-token-ref-value")?.textContent).toBe(
      darkEntry?.tokens.bg
    );
    // Color-typed tokens carry a swatch painted with the effective value.
    const swatch = rowFor("bg")?.querySelector(".wgd-token-ref-swatch") as HTMLElement;
    expect(swatch?.getAttribute("style")).toContain(darkEntry?.tokens.bg as string);

    // Back to none: defaults again.
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(rowFor("bg")?.querySelector(".wgd-token-ref-value")?.textContent).toBe(
      defaultBg
    );
  });

  it("keeps the theme selection out of the export", () => {
    const container = host();
    const designer = createDesigner(container, { themes });
    const select = container.querySelector(".wgd-theme-select") as HTMLSelectElement;
    select.value = "dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const definition = {
      kind: designer.getDraft().kind,
      template: designer.getDraft().template,
      descriptor: designer.getDraft().descriptor
    };
    expect(Object.keys(definition)).toEqual(["kind", "template", "descriptor"]);
    expect(JSON.stringify(definition)).not.toContain("--wg");
  });

  it("mounts without themes supplied", () => {
    const container = host();
    createDesigner(container);
    const select = container.querySelector(".wgd-theme-select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([""]);
    expect(container.textContent).toContain("No themes supplied");
  });
});

describe("theme designer read-only mode", () => {
  it("inerts the editing panels while the kind selector keeps previewing", () => {
    const container = host();
    const designer = createThemeDesigner(container, {
      initialTheme: { name: "nord", tokens: { surface: "#2e3440" } },
      readOnly: true
    });
    const root = container.querySelector(".wgd-root") as HTMLElement;
    expect(root.classList.contains("wgd-readonly")).toBe(true);
    // Identity, tokens, custom variables, import/export — all inert.
    // …except the view-only Export section.
    const bodies = [
      ...root.querySelectorAll(".wgd-panels .wgd-section-body")
    ].filter((b) => !b.parentElement?.classList.contains("wgd-view-only"));
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const body of bodies) expect(body.hasAttribute("inert")).toBe(true);
    // The kind selector lives beside the preview, outside the inert
    // panels, and still drives it.
    const kind = root.querySelector(".wgd-preview-kind") as HTMLSelectElement;
    expect(kind.closest("[inert]")).toBeNull();
    kind.value = "table";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      (container.querySelector(".wgd-preview") as HTMLElement).innerHTML
    ).toContain("wg-table");
    // The loaded theme still paints the preview in read-only mode.
    expect(
      (container.querySelector(".wgd-preview") as HTMLElement).style.getPropertyValue(
        "--wg-surface"
      )
    ).toBe("#2e3440");
    designer.setReadOnly(false);
    expect(root.querySelector(".wgd-section-body[inert]")).toBeNull();
  });
});

describe("theme designer previews custom widgets", () => {
  const custom = {
    kind: "invoice-lite",
    template: {
      tag: "div",
      attrs: { class: "wg-invoice-lite" },
      children: [{ bind: "customer" }]
    },
    descriptor: {
      description: "d",
      dataShape: "s",
      dataExample: { customer: "Acme Corp" },
      styles: { ".wg-invoice-lite": { color: "var(--wg-accent)" } }
    }
  };

  it("offers supplied kinds beside the built-ins and renders them styled", () => {
    const container = host();
    createThemeDesigner(container, {
      widgets: [custom],
      initialTheme: { name: "t", tokens: { accent: "#ff00aa" } }
    });
    const kind = container.querySelector(".wgd-preview-kind") as HTMLSelectElement;
    const offered = [...kind.options].map((o) => o.value);
    expect(offered).toContain("card"); // built-ins still there
    expect(offered).toContain("invoice-lite");
    // The internal draft delegate is never offered as a kind.
    expect(offered).not.toContain("designer-preview");

    kind.value = "invoice-lite";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    const preview = container.querySelector(".wgd-preview") as HTMLElement;
    // Rendered from its OWN dataExample...
    expect(preview.textContent).toContain("Acme Corp");
    // ...with its OWN descriptor styles emitted...
    const styles = [...container.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(styles).toContain(".wg-invoice-lite");
    // ...under the edited tokens.
    expect(preview.style.getPropertyValue("--wg-accent")).toBe("#ff00aa");
  });

  it("skips an invalid definition without losing the rest", () => {
    const container = host();
    createThemeDesigner(container, {
      widgets: [{ kind: "broken", template: { tag: 123 } }, custom]
    });
    const offered = [
      ...(container.querySelector(".wgd-preview-kind") as HTMLSelectElement).options
    ].map((o) => o.value);
    expect(offered).not.toContain("broken");
    expect(offered).toContain("invoice-lite");
  });
});

describe("theme designer io sections", () => {
  it("splits Import and Export into two sections, import first", () => {
    const container = host();
    createThemeDesigner(container);
    const titles = [...container.querySelectorAll(".wgd-section-title")].map(
      (t) => t.textContent
    );
    expect(titles).toContain("Import");
    expect(titles).toContain("Export");
    expect(titles.indexOf("Import")).toBeLessThan(titles.indexOf("Export"));
    expect(titles).not.toContain("Import / Export");
  });

  it("keeps Export operable in read-only mode", () => {
    const container = host();
    createThemeDesigner(container, {
      initialTheme: { name: "nord", tokens: { surface: "#2e3440" } },
      readOnly: true
    });
    const exportButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Export theme entry"
    ) as HTMLButtonElement;
    expect(exportButton.closest("[inert]")).toBeNull();
    exportButton.click();
    const output = container.querySelector(
      ".wgd-view-only textarea"
    ) as HTMLTextAreaElement;
    expect(JSON.parse(output.value)).toMatchObject({ name: "nord" });
  });
});
