import { describe, it, expectTypeOf } from "vitest";
import {
  handleListWidgets,
  handleRenderWidget,
  LIST_WIDGETS_TOOL
} from "../index.js";
import type { McpToolDefinition } from "../index.js";
import type { WidgetCatalog, WidgetDescriptor } from "@widgentic/core";
import type { McpToolResult } from "../../output/index.js";

describe("mcp-server types", () => {
  it("handlers take a catalog and return MCP-shaped results", () => {
    expectTypeOf(handleListWidgets).parameter(0).toEqualTypeOf<WidgetCatalog>();
    expectTypeOf(handleListWidgets).returns.toEqualTypeOf<McpToolResult>();
    expectTypeOf(handleRenderWidget).parameter(1).toEqualTypeOf<unknown>();
    expectTypeOf(handleRenderWidget).returns.toEqualTypeOf<McpToolResult>();
  });

  it("tool definitions are typed data", () => {
    expectTypeOf(LIST_WIDGETS_TOOL).toEqualTypeOf<McpToolDefinition>();
  });

  it("descriptor dataSchema is typed", () => {
    expectTypeOf<WidgetDescriptor["dataSchema"]>().toEqualTypeOf<
      Record<string, unknown> | undefined
    >();
  });

  it("catalog metadata surface is typed", () => {
    expectTypeOf<ReturnType<WidgetCatalog["describe"]>>().toEqualTypeOf<
      WidgetDescriptor | undefined
    >();
    expectTypeOf<ReturnType<WidgetCatalog["list"]>>().toEqualTypeOf<
      WidgetDescriptor[]
    >();
    // register accepts an optional descriptor without kind
    expectTypeOf<Parameters<WidgetCatalog["register"]>[2]>().toEqualTypeOf<
      Omit<WidgetDescriptor, "kind"> | undefined
    >();
  });
});
