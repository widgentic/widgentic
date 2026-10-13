import { describe, it, expect } from "vitest";
import { auditDataSchema, DATA_SCHEMA_TYPES, validateDataAgainstSchema, createCatalog, el } from "../index.js";
import type { DataSchema } from "../index.js";

const invoiceSchema: DataSchema = {
  type: "object",
  required: ["customer", "lines"],
  properties: {
    customer: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        required: ["qty"],
        properties: { qty: { type: "number" } }
      }
    }
  }
};

describe("validateDataAgainstSchema", () => {
  it("passes valid data", () => {
    expect(
      validateDataAgainstSchema(invoiceSchema, {
        customer: "Ada",
        lines: [{ qty: 2 }]
      })
    ).toBeUndefined();
  });

  it("reports missing required properties with dotted paths", () => {
    expect(validateDataAgainstSchema(invoiceSchema, {})).toMatchObject({
      code: "MISSING_FIELD",
      path: "data.customer"
    });
    expect(
      validateDataAgainstSchema(invoiceSchema, { customer: "Ada", lines: [{}] })
    ).toMatchObject({ code: "MISSING_FIELD", path: "data.lines.0.qty" });
  });

  it("reports type violations with dotted paths", () => {
    expect(
      validateDataAgainstSchema(invoiceSchema, {
        customer: "Ada",
        lines: [{ qty: "two" }]
      })
    ).toMatchObject({ code: "INVALID_TYPE", path: "data.lines.0.qty" });
  });

  it("supports every subset type keyword", () => {
    for (const [type, good, bad] of [
      ["object", {}, []],
      ["array", [], {}],
      ["string", "x", 1],
      ["number", 1.5, "x"],
      ["integer", 2, 2.5],
      ["boolean", true, 0],
      ["null", null, "null"]
    ] as const) {
      expect(validateDataAgainstSchema({ type }, good)).toBeUndefined();
      expect(validateDataAgainstSchema({ type }, bad)).toBeDefined();
    }
  });

  it("supports type unions and enum", () => {
    expect(
      validateDataAgainstSchema({ type: ["string", "number"] }, 5)
    ).toBeUndefined();
    expect(
      validateDataAgainstSchema({ type: ["string", "number"] }, true)
    ).toBeDefined();
    expect(
      validateDataAgainstSchema({ enum: ["a", 1, { x: 1 }] }, { x: 1 })
    ).toBeUndefined();
    expect(validateDataAgainstSchema({ enum: ["a"] }, "b")).toMatchObject({
      code: "INVALID_TYPE"
    });
  });

  it("ignores unknown keywords", () => {
    // `pattern` graduated to a supported keyword; $ref/format remain unknown.
    expect(
      validateDataAgainstSchema(
        { type: "string", $ref: "#/nope", format: "email" },
        "anything"
      )
    ).toBeUndefined();
  });
});

describe("schema enforcement in catalog.render", () => {
  it("kinds with a schema fail fast; schema-less kinds stay lenient", () => {
    const catalog = createCatalog();
    catalog.register("strict", () => el("div"), {
      description: "strict kind",
      dataShape: "object with name",
      dataSchema: { type: "object", required: ["name"] }
    });

    const bad = catalog.render({ kind: "strict", data: {} });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toMatchObject({
        code: "MISSING_FIELD",
        path: "data.name"
      });
    }

    expect(catalog.render({ kind: "strict", data: { name: "x" } }).ok).toBe(
      true
    );
    // built-ins have no schema: any data still renders
    expect(catalog.render({ kind: "table", data: null }).ok).toBe(true);
  });

  it("schemas are listed for discovery", () => {
    const catalog = createCatalog();
    catalog.register("strict", () => el("div"), {
      description: "d",
      dataShape: "s",
      dataSchema: { type: "object" }
    });
    const listed = catalog.list().find((d) => d.kind === "strict");
    expect(listed?.dataSchema).toEqual({ type: "object" });
  });
});

describe("bounded pattern checks", () => {
  const currency = {
    type: "object",
    properties: { currency: { type: "string", pattern: "^[A-Z]{3}$" } }
  };

  it("reports violations with the dotted path and passes matches", () => {
    const error = validateDataAgainstSchema(currency, { currency: "usd!" });
    expect(error).toMatchObject({ code: "INVALID_TYPE", path: "data.currency" });
    expect(error?.message).toContain("pattern");
    expect(validateDataAgainstSchema(currency, { currency: "USD" })).toBeUndefined();
  });

  it("ignores unsafe, invalid, and overlong patterns", () => {
    for (const pattern of ["(a+)+$", "[", "a".repeat(300)]) {
      const schema = { type: "string", pattern };
      expect(validateDataAgainstSchema(schema, "anything at all")).toBeUndefined();
    }
  });

  it("never applies pattern to non-string data", () => {
    const schema = { pattern: "^[A-Z]{3}$" };
    expect(validateDataAgainstSchema(schema, 42)).toBeUndefined();
    expect(validateDataAgainstSchema(schema, { a: 1 })).toBeUndefined();
  });

  it("caps tested strings at the documented prefix", () => {
    const schema = { type: "string", pattern: "^a+$" };
    // The violating "b" sits beyond the 10k prefix — documented behavior.
    expect(
      validateDataAgainstSchema(schema, "a".repeat(10_000) + "b")
    ).toBeUndefined();
    expect(validateDataAgainstSchema(schema, "a".repeat(50) + "b")).toBeDefined();
  });
});

describe("auditDataSchema: what the validator would ignore", () => {
  it("names an unknown type, and the validator indeed lets anything through", () => {
    const schema: DataSchema = { type: "object", properties: { kind: { type: "banana" }, tags: { type: ["string", "fruit"] } } };
    expect(auditDataSchema(schema)).toEqual([
      expect.stringContaining("schema.properties.kind.type: 'banana' is not one of"),
      expect.stringContaining("schema.properties.tags.type: 'fruit'")
    ]);
    expect(validateDataAgainstSchema(schema, { kind: 42 })).toBeUndefined();
  });

  it("flags patterns it will not run and keywords of the wrong shape, through items", () => {
    const schema: DataSchema = {
      type: "array",
      items: {
        type: "object",
        required: "name",
        enum: "a",
        properties: { name: { type: "string", pattern: "(a+)+$" }, bad: "string" }
      }
    };
    const warnings = auditDataSchema(schema, "dataSchema");
    expect(warnings).toEqual([
      expect.stringContaining("dataSchema.items.enum:"),
      expect.stringContaining("dataSchema.items.required:"),
      expect.stringContaining("dataSchema.items.properties.name.pattern: not run"),
      expect.stringContaining("dataSchema.items.properties.bad: must be a schema object")
    ]);
  });

  it("is silent on every supported type and unknown keywords", () => {
    for (const type of DATA_SCHEMA_TYPES) expect(auditDataSchema({ type })).toEqual([]);
    expect(auditDataSchema({ type: ["string", "null"], pattern: "^a", required: ["x"], enum: [1], "x-note": true })).toEqual([]);
  });
});
