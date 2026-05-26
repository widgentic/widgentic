import { describe, it, expect } from "vitest";
import { validateWidgetPayload } from "../index.js";
import type { WidgetPayload } from "../index.js";

describe("validateWidgetPayload", () => {
  it("accepts a minimum viable payload", () => {
    const input = { kind: "card", data: { title: "Hello" } };
    const result = validateWidgetPayload(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toBe(input);
    }
  });

  it("rejects missing kind with MISSING_FIELD", () => {
    const result = validateWidgetPayload({ data: {} });
    expect(result).toEqual({
      ok: false,
      error: { code: "MISSING_FIELD", path: "kind", message: expect.any(String) }
    });
  });

  it("rejects non-string kind with INVALID_TYPE", () => {
    const result = validateWidgetPayload({ kind: 42, data: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TYPE");
      expect(result.error.path).toBe("kind");
    }
  });

  it("rejects empty kind", () => {
    const result = validateWidgetPayload({ kind: "", data: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_FIELD");
      expect(result.error.path).toBe("kind");
    }
  });

  it("rejects missing data with MISSING_FIELD", () => {
    const result = validateWidgetPayload({ kind: "card" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MISSING_FIELD");
      expect(result.error.path).toBe("data");
    }
  });

  it("accepts null as data", () => {
    const result = validateWidgetPayload({ kind: "card", data: null });
    expect(result.ok).toBe(true);
  });

  it("rejects non-object input (null)", () => {
    const result = validateWidgetPayload(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TYPE");
      expect(result.error.path).toBe("");
    }
  });

  it("rejects non-object input (string)", () => {
    const result = validateWidgetPayload("x");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TYPE");
      expect(result.error.path).toBe("");
    }
  });

  it("rejects array input", () => {
    const result = validateWidgetPayload([{ kind: "card", data: {} }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects non-object hints", () => {
    const result = validateWidgetPayload({ kind: "card", data: {}, hints: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TYPE");
      expect(result.error.path).toBe("hints");
    }
  });

  it("rejects non-object meta", () => {
    const result = validateWidgetPayload({ kind: "card", data: {}, meta: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_TYPE");
      expect(result.error.path).toBe("meta");
    }
  });

  it("accepts known kind from registry", () => {
    const result = validateWidgetPayload(
      { kind: "card", data: {} },
      { knownKinds: new Set(["card"]) }
    );
    expect(result.ok).toBe(true);
  });

  it("rejects unknown kind from registry with UNKNOWN_KIND", () => {
    const result = validateWidgetPayload(
      { kind: "xyz", data: {} },
      { knownKinds: new Set(["card"]) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_KIND");
      expect(result.error.path).toBe("kind");
    }
  });

  it("skips kind membership check when registry is omitted", () => {
    const result = validateWidgetPayload({ kind: "anything", data: {} });
    expect(result.ok).toBe(true);
  });

  it("skips kind membership check when registry is empty", () => {
    const result = validateWidgetPayload(
      { kind: "anything", data: {} },
      { knownKinds: new Set<string>() }
    );
    expect(result.ok).toBe(true);
  });

  it("preserves unknown top-level fields", () => {
    const input = { kind: "card", data: {}, futureField: 1 };
    const result = validateWidgetPayload(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.futureField).toBe(1);
    }
  });

  it("accepts payload without optional hints/meta", () => {
    const input: WidgetPayload = { kind: "card", data: {} };
    const result = validateWidgetPayload(input);
    expect(result.ok).toBe(true);
  });
});
