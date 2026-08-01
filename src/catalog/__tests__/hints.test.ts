import { describe, expect, it } from "vitest";
import { analyzeHints, createCatalog } from "../index.js";

const catalog = createCatalog();
const tableDescriptor = catalog.describe("table");
const cardDescriptor = catalog.describe("card");
const treeDescriptor = catalog.describe("tree");

describe("analyzeHints", () => {
  it("suggests the nearest advertised key for unknown hints", () => {
    const result = analyzeHints("table", [{ a: 1 }], { colums: ["a"] }, tableDescriptor);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      hint: "colums",
      code: "UNKNOWN_HINT",
      suggestion: "columns"
    });
    expect(result[0]?.message).toContain("did you mean 'columns'");
  });

  it("reports unknown hints without suggestion when nothing is close", () => {
    const result = analyzeHints("table", [{ a: 1 }], { sparkle: true }, tableDescriptor);
    expect(result[0]).toMatchObject({ hint: "sparkle", code: "UNKNOWN_HINT" });
    expect(result[0]?.suggestion).toBeUndefined();
  });

  it("reports hint keys that match no data field", () => {
    const result = analyzeHints(
      "card",
      { fields: { price: 1 } },
      { fieldFormat: { cost: "${value}" } },
      cardDescriptor
    );
    expect(result[0]).toMatchObject({ hint: "fieldFormat.cost", code: "NO_MATCH" });
  });

  it("reports columns that match no record key", () => {
    const result = analyzeHints(
      "table",
      [{ a: 1, b: 2 }],
      { columns: ["a", "z"] },
      tableDescriptor
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ hint: "columns.z", code: "NO_MATCH" });
  });

  it("distinguishes invalid image shapes from unsafe sources", () => {
    const invalidShape = analyzeHints(
      "card",
      { fields: { photo: "https://cdn.example/p.png" } },
      { images: { photo: "big" } },
      cardDescriptor
    );
    expect(invalidShape[0]).toMatchObject({
      hint: "images.photo",
      code: "INVALID_VALUE"
    });

    const unsafe = analyzeHints(
      "card",
      { fields: { x: "javascript:alert(1)" } },
      { images: { x: "avatar" } },
      cardDescriptor
    );
    expect(unsafe[0]).toMatchObject({
      hint: "images.x",
      code: "UNSAFE_IMAGE_SOURCE"
    });
  });

  it("accepts images: false without checking the source", () => {
    const result = analyzeHints(
      "table",
      [{ shot: "not a url" }],
      { images: { shot: false } },
      tableDescriptor
    );
    expect(result).toEqual([]);
  });

  it("flags non-number expandDepth", () => {
    const result = analyzeHints(
      "tree",
      { label: "r" },
      { expandDepth: "2" },
      treeDescriptor
    );
    expect(result[0]).toMatchObject({ hint: "expandDepth", code: "INVALID_VALUE" });
  });

  it("is silent for coherent hints", () => {
    const result = analyzeHints(
      "table",
      [{ a: 1, avatar: "https://cdn.example/a.png" }],
      { columns: ["a", "avatar"], images: { avatar: true } },
      tableDescriptor
    );
    expect(result).toEqual([]);
  });

  it("is total over garbage input", () => {
    expect(analyzeHints("table", null, 42, tableDescriptor)).toEqual([]);
    expect(analyzeHints("card", null, { fieldFormat: 7 }, cardDescriptor)).toHaveLength(1);
    expect(analyzeHints("nope", { a: 1 }, { anything: 1 }, undefined)).toMatchObject([
      { code: "UNKNOWN_HINT" }
    ]);
    expect(analyzeHints("card", undefined, undefined, cardDescriptor)).toEqual([]);
  });
});
