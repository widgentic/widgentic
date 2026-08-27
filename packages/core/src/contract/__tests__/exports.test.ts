// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateWidgetPayload } from "../index.js";
import type { WidgetPayload } from "../index.js";

describe("package entry ./contract", () => {
  it("resolves the validator and types via package exports", () => {
    const payload: WidgetPayload = { kind: "card", data: { a: 1 } };
    const result = validateWidgetPayload(payload);
    expect(result.ok).toBe(true);
  });
});
