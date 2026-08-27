import { describe, it, expectTypeOf } from "vitest";
import { createCatalog, renderToHtml, mountNode } from "../index.js";
import type {
  WidgetCatalog,
  WidgetNode,
  WidgetRenderer,
  RenderResult
} from "../index.js";
import type { ErrorCode, WidgetPayload } from "../../contract/index.js";

describe("catalog types", () => {
  it("createCatalog returns WidgetCatalog", () => {
    expectTypeOf(createCatalog).returns.toEqualTypeOf<WidgetCatalog>();
  });

  it("render result narrows on ok", () => {
    const result: RenderResult = createCatalog().render({
      kind: "card",
      data: 1
    });
    if (result.ok) {
      expectTypeOf(result.node).toEqualTypeOf<WidgetNode>();
    } else {
      expectTypeOf(result.error.code).toEqualTypeOf<ErrorCode>();
    }
  });

  it("WidgetRenderer maps payloads to nodes", () => {
    expectTypeOf<WidgetRenderer>().toEqualTypeOf<
      (payload: WidgetPayload) => WidgetNode
    >();
  });

  it("output layers take WidgetNode", () => {
    expectTypeOf(renderToHtml).parameter(0).toEqualTypeOf<WidgetNode>();
    expectTypeOf(renderToHtml).returns.toEqualTypeOf<string>();
    expectTypeOf(mountNode).parameter(0).toEqualTypeOf<WidgetNode>();
    expectTypeOf(mountNode).parameter(1).toEqualTypeOf<Element>();
  });
});
