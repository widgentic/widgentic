import { describe, it, expect } from "vitest";
import { SEEDABLE_BUILTINS, seedThemeEntry, seedWidgetDraft } from "../seed.js";
import type { WidgetDraft } from "../store.js";
import { createCatalog, renderToHtml } from "@widgentic/core";
import { registerTemplate } from "@widgentic/core";
import { deriveDiagnostics } from "../validate.js";

const stored: WidgetDraft = {
  kind: "person-card",
  template: {
    tag: "div",
    attrs: { class: "wg-person" },
    children: [{ bind: "name" }]
  },
  descriptor: {
    description: "Person",
    dataShape: "{ name }",
    dataSchemaRef: "person",
    styles: { ".wg-person": { color: "var(--wg-accent, #2563eb)" } }
  }
};

describe("seedWidgetDraft", () => {
  it("copies a stored widget under a distinct kind, source untouched", () => {
    const before = JSON.stringify(stored);
    const seeded = seedWidgetDraft(stored, ["person-card"]);
    expect(seeded.kind).toBe("person-card-copy");
    expect(seeded.template).toEqual(stored.template);
    expect(seeded.descriptor.dataSchemaRef).toBe("person");
    expect(seeded.descriptor.styles).toEqual(stored.descriptor.styles);
    expect(JSON.stringify(stored)).toBe(before);
    // and the copy is deep — editing it never reaches the source
    (seeded.template as { attrs?: Record<string, unknown> }).attrs!.class = "x";
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("suffixing is deterministic against the taken set", () => {
    const taken = ["person-card", "person-card-copy", "person-card-copy2"];
    expect(seedWidgetDraft(stored, taken).kind).toBe("person-card-copy3");
    expect(seedWidgetDraft(stored, taken).kind).toBe("person-card-copy3");
  });

  it("every built-in starter validates and renders with its wg classes", () => {
    const markers: Record<string, string[]> = {
      card: ["wg-card", "wg-card-title", "wg-card-field"],
      table: ["wg-table", "wg-table-header", "wg-table-row"],
      tree: ["wg-tree", "wg-tree-node", "wg-tree-branch", "wg-tree-label", "wg-tree-icon"]
    };
    const contents: Record<string, string[]> = {
      card: ["Essence Mascara", "9.99", "99"],
      table: ["Ada", "eng", "Lin", "ops"],
      tree: ["root", "leaf", "leaf 2", "\u{1F4C1}", "\u{1F4C4}"]
    };
    for (const builtin of SEEDABLE_BUILTINS) {
      const seeded = seedWidgetDraft(builtin);
      expect(seeded.kind).toBe(`my-${builtin}`);
      // validates through the designer's own diagnostics
      const diagnostics = deriveDiagnostics(seeded, { schemas: [] });
      expect(diagnostics.template).toBeUndefined();
      expect(diagnostics.example).toBeUndefined();
      expect(diagnostics.kind).toBeUndefined();
      // and renders through the REAL pipeline with the example data
      const catalog = createCatalog();
      registerTemplate(catalog, seeded.kind, seeded.template, seeded.descriptor);
      const result = catalog.render({
        kind: seeded.kind,
        data: seeded.descriptor.dataExample
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const html = renderToHtml(result.node);
      for (const marker of markers[builtin]!) expect(html).toContain(marker);
      // content, not just chrome — empty cells once slipped past markers
      for (const value of contents[builtin]!) expect(html).toContain(value);
    }
  });

  it("starter identities avoid taken kinds", () => {
    expect(seedWidgetDraft("card", ["my-card", "my-card2"]).kind).toBe("my-card3");
  });
});

describe("seedThemeEntry", () => {
  it("seeds from presets under non-reserved names with the preset tokens", () => {
    const light = seedThemeEntry("light");
    const dark = seedThemeEntry("dark");
    expect(light.name).toBe("my-light");
    expect(dark.name).toBe("my-dark");
    expect(light.tokens.bg).toBeDefined();
    expect(dark.tokens.bg).toBeDefined();
    expect(dark.tokens.bg).not.toBe(light.tokens.bg);
    for (const entry of [light, dark]) {
      expect(["light", "dark"]).not.toContain(entry.name);
    }
  });

  it("seeds from a stored entry under a distinct name, source untouched", () => {
    const source = { name: "midnight", label: "Midnight", tokens: { bg: "#000" } };
    const before = JSON.stringify(source);
    const seeded = seedThemeEntry(source, ["midnight"]);
    expect(seeded.name).toBe("midnight-copy");
    expect(seeded.tokens).toEqual({ bg: "#000" });
    seeded.tokens.bg = "#111";
    expect(JSON.stringify(source)).toBe(before);
  });

  it("never returns a reserved name even for hostile inputs", () => {
    const source = { name: "light", tokens: {} };
    const seeded = seedThemeEntry(source);
    expect(["light", "dark"]).not.toContain(seeded.name);
  });
});
