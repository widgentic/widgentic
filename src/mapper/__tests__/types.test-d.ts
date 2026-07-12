import { describe, it, expectTypeOf } from "vitest";
import { inferKind, mapToWidget } from "../index.js";
import type { MapperInput } from "../index.js";
import type { WidgetKind, WidgetPayload } from "../../contract/index.js";

describe("mapper types", () => {
  it("inferKind takes unknown and returns WidgetKind", () => {
    expectTypeOf(inferKind).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(inferKind).returns.toEqualTypeOf<WidgetKind>();
  });

  it("mapToWidget accepts kind-optional input and returns WidgetPayload", () => {
    expectTypeOf(mapToWidget).returns.toEqualTypeOf<WidgetPayload>();
    // kind is optional on input, required on output
    expectTypeOf<MapperInput["kind"]>().toEqualTypeOf<WidgetKind | undefined>();
    expectTypeOf<WidgetPayload["kind"]>().toEqualTypeOf<WidgetKind>();
    // data-only input is sufficient
    expectTypeOf(mapToWidget({ data: null })).toEqualTypeOf<WidgetPayload>();
  });

  it("MapperInput accepts hints, meta, and unknown fields", () => {
    const input: MapperInput = {
      data: [1],
      hints: { density: "compact" },
      meta: { title: "T" },
      custom: true
    };
    expectTypeOf(input).toMatchTypeOf<MapperInput>();
  });
});
