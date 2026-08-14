// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateWidgetPayload } from "widgentic/contract";
import type { WidgetPayload } from "widgentic/contract";

describe("package entry ./contract", () => {
  it("resolves the validator and types via package exports", () => {
    const payload: WidgetPayload = { kind: "card", data: { a: 1 } };
    const result = validateWidgetPayload(payload);
    expect(result.ok).toBe(true);
  });
});
