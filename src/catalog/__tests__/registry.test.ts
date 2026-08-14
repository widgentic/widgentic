import { describe, it, expect } from "vitest";
import { createCatalog, DuplicateKindError, el } from "../index.js";

describe("createCatalog", () => {
  it("pre-registers the built-ins", () => {
    const kinds = createCatalog().kinds();
    expect(kinds).toContain("card");
    expect(kinds).toContain("table");
    expect(kinds).toContain("tree");
    expect(kinds).toContain("custom");
  });

  it("instances are independent", () => {
    const a = createCatalog();
    const b = createCatalog();
    a.register("timeline", () => el("div"));
    expect(a.has("timeline")).toBe(true);
    expect(b.has("timeline")).toBe(false);
  });

  it("kinds() returns a fresh array", () => {
    const catalog = createCatalog();
    const kinds = catalog.kinds();
    kinds.length = 0;
    expect(catalog.kinds()).toContain("card");
  });

  it("resolve returns the registered renderer, undefined otherwise", () => {
    const catalog = createCatalog();
    const renderer = () => el("div");
    catalog.register("timeline", renderer);
    expect(catalog.resolve("timeline")).toBe(renderer);
    expect(catalog.resolve("nope")).toBeUndefined();
  });
});

describe("register", () => {
  it("registered custom kind renders via the catalog", () => {
    const catalog = createCatalog();
    const received: unknown[] = [];
    catalog.register("timeline", (payload) => {
      received.push(payload);
      return el("div", { class: "timeline" }, ["ok"]);
    });
    const payload = { kind: "timeline", data: [1, 2, 3] };
    const result = catalog.render(payload);
    expect(result.ok).toBe(true);
    expect(received).toEqual([payload]);
  });

  it("re-registering a custom kind throws DuplicateKindError", () => {
    const catalog = createCatalog();
    catalog.register("timeline", () => el("div"));
    let caught: unknown;
    try {
      catalog.register("timeline", () => el("span"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DuplicateKindError);
    const dup = caught as DuplicateKindError;
    expect(dup.code).toBe("DUPLICATE_KIND");
    expect(dup.kind).toBe("timeline");
    expect(dup.message).toContain("timeline");
  });

  it("built-ins cannot be overridden", () => {
    const catalog = createCatalog();
    expect(() => catalog.register("card", () => el("div"))).toThrow(
      DuplicateKindError
    );
  });
});

describe("render", () => {
  it("renders each built-in kind ok", () => {
    const catalog = createCatalog();
    const payloads = [
      { kind: "card", data: { title: "T" } },
      { kind: "table", data: [{ a: 1 }] },
      { kind: "tree", data: { label: "root", children: [] } },
      { kind: "custom", data: { any: "shape" } }
    ];
    for (const payload of payloads) {
      const result = catalog.render(payload);
      expect(result.ok).toBe(true);
    }
  });

  it("unknown kind returns UNKNOWN_KIND", () => {
    const result = createCatalog().render({ kind: "nope", data: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN_KIND");
  });

  it("missing kind returns MISSING_FIELD", () => {
    const result = createCatalog().render({ data: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("never throws on garbage input", () => {
    const catalog = createCatalog();
    for (const input of [null, undefined, 42, "x", [], { kind: 1 }]) {
      const result = catalog.render(input);
      expect(result.ok).toBe(false);
    }
  });

  it("a throwing custom renderer surfaces as RENDER_FAILED, not an exception", () => {
    const catalog = createCatalog();
    catalog.register("boom", () => {
      throw new Error("renderer exploded");
    });
    const result = catalog.render({ kind: "boom", data: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RENDER_FAILED");
      expect(result.error.path).toBe("widget");
      expect(result.error.message).toContain("boom");
      expect(result.error.message).toContain("renderer exploded");
    }
  });
});
