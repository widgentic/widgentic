import { describe, it, expect } from "vitest";
import { parseCsv } from "../parse.js";

describe("parseCsv type inference", () => {
  it("coerces numbers and booleans when inferTypes is true", () => {
    const result = parseCsv("n,b\n1,true", { inferTypes: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ n: 1, b: true });
  });

  it("keeps strings when inferTypes is false (default)", () => {
    const result = parseCsv("n,b\n1,true");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ n: "1", b: "true" });
  });

  it("keeps empty cells as empty strings under inference", () => {
    const result = parseCsv("a,b\n,1", { inferTypes: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ a: "", b: 1 });
  });

  it("does not coerce booleans of other casings as different types", () => {
    const result = parseCsv("b\nTrue", { inferTypes: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ b: true });
  });

  it("does not coerce non-numeric strings", () => {
    const result = parseCsv("a\n007abc", { inferTypes: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ a: "007abc" });
  });

  it("coerces floats", () => {
    const result = parseCsv("x\n-1.5", { inferTypes: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ x: -1.5 });
  });
});
