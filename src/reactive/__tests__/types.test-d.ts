import { describe, it, expectTypeOf } from "vitest";
import { mountWidget } from "../index.js";
import type { WidgetMount, MountOptions, UpdateResult } from "../index.js";
import type { WidgetCatalog, WidgetNode } from "../../catalog/index.js";
import type { WidgetContractError } from "../../contract/index.js";

describe("reactive types", () => {
  it("mountWidget returns a WidgetMount", () => {
    expectTypeOf(mountWidget).returns.toEqualTypeOf<WidgetMount>();
    expectTypeOf(mountWidget).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(mountWidget).parameter(1).toEqualTypeOf<Element>();
  });

  it("UpdateResult narrows on ok", () => {
    expectTypeOf<WidgetMount["initial"]>().toEqualTypeOf<UpdateResult>();
    const check = (result: UpdateResult): void => {
      if (!result.ok) {
        expectTypeOf(result.error).toEqualTypeOf<WidgetContractError>();
      }
    };
    expectTypeOf(check).parameter(0).toEqualTypeOf<UpdateResult>();
  });

  it("handle members are typed", () => {
    expectTypeOf<WidgetMount["update"]>().returns.toEqualTypeOf<UpdateResult>();
    expectTypeOf<WidgetMount["node"]>().returns.toEqualTypeOf<
      WidgetNode | undefined
    >();
    expectTypeOf<MountOptions["catalog"]>().toEqualTypeOf<
      WidgetCatalog | undefined
    >();
  });
});
