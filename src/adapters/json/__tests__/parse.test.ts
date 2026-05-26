import { describe, it, expect } from "vitest";
import { parseJson } from "../parse.js";

describe("parseJson", () => {
  it("parses a valid JSON string", () => {
    const result = parseJson('{"a":1}');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("passes a parsed object through unchanged", () => {
    const obj = { a: 1 };
    const result = parseJson(obj);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(obj);
  });

  it("passes primitives through", () => {
    expect(parseJson(42)).toEqual({ ok: true, value: 42 });
    expect(parseJson(null)).toEqual({ ok: true, value: null });
    expect(parseJson(true)).toEqual({ ok: true, value: true });
  });

  it("returns structured error for invalid JSON", () => {
    const result = parseJson("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_JSON");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it("includes position when present in parser message", () => {
    const result = parseJson("{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_JSON");
      // position is best-effort; if present it must be a finite number
      if (result.error.position !== undefined) {
        expect(Number.isFinite(result.error.position)).toBe(true);
      }
    }
  });

  it("extracts position from the engine's parser message", () => {
    // Node 22+ format: "Expected ... at position 1 (line 1 column 2)"
    const result = parseJson("{");
    expect(result.ok).toBe(false);
    if (!result.ok && /position\s+\d+/.test(result.error.message)) {
      expect(typeof result.error.position).toBe("number");
    }
  });
});
