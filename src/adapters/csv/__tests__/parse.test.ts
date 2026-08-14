import { describe, it, expect } from "vitest";
import { parseCsv } from "../parse.js";

describe("parseCsv", () => {
  it("uses header row for record keys", () => {
    const result = parseCsv("name,email\nAda,ada@x");
    expect(result).toEqual({
      ok: true,
      records: [{ name: "Ada", email: "ada@x" }]
    });
  });

  it("preserves commas inside quoted fields", () => {
    const result = parseCsv('a,b\n"x,y",z');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ a: "x,y", b: "z" });
  });

  it("preserves newlines inside quoted fields", () => {
    const result = parseCsv('a,b\n"line1\nline2",z');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ a: "line1\nline2", b: "z" });
  });

  it("handles escaped double quotes", () => {
    const result = parseCsv('a\n"he said ""hi"""');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records[0]).toEqual({ a: 'he said "hi"' });
  });

  it("handles CRLF line endings", () => {
    const lf = parseCsv("a,b\n1,2\n3,4");
    const crlf = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(crlf).toEqual(lf);
  });

  it("tolerates a trailing newline", () => {
    const result = parseCsv("a,b\n1,2\n");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns empty records for empty input", () => {
    expect(parseCsv("")).toEqual({ ok: true, records: [] });
  });

  it("returns header-only input as empty records", () => {
    const result = parseCsv("a,b");
    expect(result).toEqual({ ok: true, records: [] });
  });

  it("returns INVALID_CSV for a ragged row", () => {
    const result = parseCsv("a,b\n1,2,3");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CSV");
      expect(result.error.line).toBe(2);
    }
  });

  it("returns INVALID_CSV for a row with fewer fields too", () => {
    const result = parseCsv("a,b,c\n1,2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CSV");
      expect(result.error.line).toBe(2);
    }
  });

  it("returns INVALID_CSV for an unterminated quoted field", () => {
    const result = parseCsv('a\n"oops');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CSV");
  });
});
