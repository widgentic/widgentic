import { describe, it, expect } from "vitest";
import { createCatalog, el } from "../index.js";
import { registerTemplate } from "../../templates/index.js";

describe("widget metadata", () => {
  it("built-ins ship complete descriptors", () => {
    const list = createCatalog().list();
    const kinds = list.map((d) => d.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["card", "table", "tree", "custom"])
    );
    for (const descriptor of list) {
      expect(descriptor.description.length).toBeGreaterThan(0);
      expect(descriptor.dataShape.length).toBeGreaterThan(0);
      expect(descriptor.dataExample).toBeDefined();
    }
  });

  it("built-in dataExamples are honest (they render)", () => {
    const catalog = createCatalog();
    for (const descriptor of catalog.list()) {
      const result = catalog.render({
        kind: descriptor.kind,
        data: descriptor.dataExample
      });
      expect(result.ok, `example for '${descriptor.kind}' should render`).toBe(
        true
      );
    }
  });

  it("registration without a descriptor gets a minimal generated one", () => {
    const catalog = createCatalog();
    catalog.register("timeline", () => el("div"));
    const descriptor = catalog.describe("timeline");
    expect(descriptor?.kind).toBe("timeline");
    expect(descriptor?.description.length).toBeGreaterThan(0);
  });

  it("registration stores the provided descriptor with kind filled", () => {
    const catalog = createCatalog();
    catalog.register("timeline", () => el("div"), {
      description: "Chronological events",
      dataShape: "array of { when, what }"
    });
    expect(catalog.describe("timeline")).toEqual({
      kind: "timeline",
      description: "Chronological events",
      dataShape: "array of { when, what }"
    });
  });

  it("registerTemplate passes descriptors through", () => {
    const catalog = createCatalog();
    registerTemplate(catalog, "badge", { tag: "span" }, {
      description: "A badge",
      dataShape: "anything"
    });
    expect(catalog.describe("badge")?.description).toBe("A badge");
  });

  it("describe returns undefined for unknown kinds", () => {
    expect(createCatalog().describe("nope")).toBeUndefined();
  });

  it("list returns a fresh array", () => {
    const catalog = createCatalog();
    catalog.list().length = 0;
    expect(catalog.list().length).toBeGreaterThan(0);
  });
});
