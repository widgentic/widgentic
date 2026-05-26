import { describe, it, expectTypeOf } from "vitest";
import type {
  WidgetPayload,
  WidgetHints,
  WidgetMeta,
  ValidateResult
} from "../index.js";

describe("widget-contract types", () => {
  it("allows omitting optional hints and meta", () => {
    const payload: WidgetPayload = { kind: "card", data: {} };
    expectTypeOf(payload).toMatchTypeOf<WidgetPayload>();
  });

  it("typed hints and meta", () => {
    expectTypeOf<WidgetHints>().toMatchTypeOf<Record<string, unknown>>();
    expectTypeOf<WidgetMeta["title"]>().toEqualTypeOf<string | undefined>();
  });

  it("ValidateResult is a discriminated union", () => {
    const r = { ok: true, payload: { kind: "card", data: {} } } as ValidateResult;
    if (r.ok) {
      expectTypeOf(r.payload).toMatchTypeOf<WidgetPayload>();
    } else {
      expectTypeOf(r.error.code).toMatchTypeOf<string>();
    }
  });
});
