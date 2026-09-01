import { describe, it, expect } from "vitest";
import {
  allPaths,
  collectPaths,
  itemSchema,
  schemaAt,
  schemaType,
  typesConflict
} from "../schema-paths.js";

/** The ticker schema: a ROOT array, the shape most list APIs return. */
const TICKER = {
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

const INVOICE = {
  type: "object",
  properties: {
    customer: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { item: { type: "string" }, qty: { type: "number" } }
      }
    }
  }
};

describe("collectPaths is context-free; callers pick the item schema", () => {
  it("a root-array schema enumerates nothing — its item's properties come through itemSchema", () => {
    expect(allPaths(TICKER)).toEqual([]);
    expect(allPaths(itemSchema(TICKER))).toEqual(["ask", "bid", "book", "date"]);
  });

  it("schemaAt steps into an array by INDEX only, as the resolvers do", () => {
    expect(schemaType(schemaAt(INVOICE, "lines.0.qty"))).toBe("number");
    expect(schemaAt(INVOICE, "lines.qty")).toBeUndefined();
    expect(schemaType(schemaAt(TICKER, "0.ask"))).toBe("string");
    expect(schemaAt(TICKER, "ask")).toBeUndefined();
  });

  it("a nested array is offered as itself and NOT descended", () => {
    const paths = allPaths(INVOICE);
    expect(paths).toContain("customer");
    expect(paths).toContain("lines"); // the array, for `each`
    // `lines.qty` resolves to nothing in the template resolver and in the
    // projection's getAtPath (only `lines.0.qty` does) — offering it would
    // hand the author a dead path. Its properties arrive through its each.
    expect(paths).not.toContain("lines.item");
    expect(paths).not.toContain("lines.qty");
  });

  it("every enumerated path resolves through schemaAt — reader and enumerator agree", () => {
    for (const schema of [TICKER, INVOICE]) {
      for (const path of allPaths(schema)) {
        expect(schemaAt(schema, path), path).toBeDefined();
      }
    }
  });

  it("carries the schema at each path, so type checks work over arrays", () => {
    const entries: { path: string; schema: unknown }[] = [];
    collectPaths(itemSchema(TICKER), "", entries);
    expect(entries.map((e) => schemaType(e.schema))).toEqual([
      "string",
      "string",
      "string",
      "string"
    ]);
    const nested: { path: string; schema: unknown }[] = [];
    collectPaths(INVOICE, "", nested);
    expect(schemaType(nested.find((e) => e.path === "lines")?.schema)).toBe("array");
    // the item's own properties are enumerated from the item schema
    const item: { path: string; schema: unknown }[] = [];
    collectPaths(itemSchema(INVOICE.properties.lines), "", item);
    expect(schemaType(item.find((e) => e.path === "qty")?.schema)).toBe("number");
  });

  it("stops at the depth budget instead of walking forever", () => {
    // A schema that references itself through an array would recurse
    // without a bound; the budget makes collection total.
    const recursive: Record<string, unknown> = { type: "object" };
    recursive.properties = {
      child: { type: "array", items: recursive }
    };
    expect(() => allPaths(recursive)).not.toThrow();
    const paths = allPaths(recursive);
    expect(paths).toEqual(["child"]);
  });

  it("a schema with no properties and a non-schema yield nothing", () => {
    expect(allPaths({ type: "object" })).toEqual([]);
    expect(allPaths({ type: "array" })).toEqual([]);
    expect(allPaths({ type: "string" })).toEqual([]);
    expect(allPaths(undefined)).toEqual([]);
    expect(allPaths("nope")).toEqual([]);
  });
});

describe("schemaAt over arrays", () => {
  it('"." and "" are the schema itself', () => {
    expect(schemaAt(TICKER, ".")).toBe(TICKER);
    expect(schemaAt(TICKER, "")).toBe(TICKER);
  });

  it("a named segment under an array resolves to nothing — only an index steps in", () => {
    expect(schemaAt(INVOICE, "lines.qty")).toBeUndefined();
    expect(schemaAt(TICKER, "ask")).toBeUndefined();
  });

  it("an index segment addresses the item itself", () => {
    expect(schemaAt(TICKER, "0")).toBe(TICKER.items);
    expect(schemaType(schemaAt(INVOICE, "lines.0"))).toBe("object");
  });
});

describe("itemSchema", () => {
  it("unwraps an array and passes anything else through", () => {
    expect(itemSchema(TICKER)).toBe(TICKER.items);
    expect(itemSchema(INVOICE)).toBe(INVOICE);
    expect(itemSchema(undefined)).toBeUndefined();
    expect(itemSchema({ type: "array" })).toBeUndefined();
  });
});

describe("typesConflict", () => {
  it("integer and number agree; unknown never conflicts", () => {
    expect(typesConflict("integer", "number")).toBe(false);
    expect(typesConflict(undefined, "string")).toBe(false);
    expect(typesConflict("string", "number")).toBe(true);
  });
});
