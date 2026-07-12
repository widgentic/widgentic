import { describe, it, expect } from "vitest";
// Resolved through the package `exports` map (self-reference), confirming
// the `./mapper` entry works for consumers.
import { inferKind, mapToWidget } from "widgentic/mapper";

describe("package entry ./mapper", () => {
  it("resolves inferKind and mapToWidget via package exports", () => {
    expect(inferKind([{ a: 1 }])).toBe("table");
    expect(mapToWidget({ data: "raw" }).kind).toBe("card");
  });
});
