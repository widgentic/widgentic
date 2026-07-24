import { describe, it, expect } from "vitest";
import {
  declareWidgetCapability,
  hostSupportsWidgets,
  WIDGENTIC_CAPABILITY,
  WIDGENTIC_VERSION
} from "../index.js";

describe("capability negotiation", () => {
  it("declared capability is detected", () => {
    expect(hostSupportsWidgets(declareWidgetCapability())).toBe(true);
  });

  it("declares the documented shape", () => {
    const capabilities = declareWidgetCapability();
    expect(capabilities.experimental?.[WIDGENTIC_CAPABILITY]).toEqual({
      version: WIDGENTIC_VERSION
    });
  });

  it("preserves existing capabilities without mutating the input", () => {
    const input = { experimental: { other: true }, sampling: {} };
    const output = declareWidgetCapability(input);
    expect(output.experimental?.other).toBe(true);
    expect(output.sampling).toEqual({});
    expect(output.experimental?.[WIDGENTIC_CAPABILITY]).toBeDefined();
    // input untouched
    expect(input.experimental).toEqual({ other: true });
    expect(WIDGENTIC_CAPABILITY in input.experimental).toBe(false);
  });

  it("absent or malformed capabilities mean no support", () => {
    for (const input of [
      undefined,
      null,
      {},
      { experimental: null },
      { experimental: "yes" },
      { experimental: {} },
      { experimental: { widgentic: false } }
    ]) {
      expect(hostSupportsWidgets(input)).toBe(false);
    }
  });

  it("any truthy widgentic value counts as support", () => {
    expect(hostSupportsWidgets({ experimental: { widgentic: true } })).toBe(
      true
    );
    expect(
      hostSupportsWidgets({ experimental: { widgentic: { version: 2 } } })
    ).toBe(true);
  });
});
