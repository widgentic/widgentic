import { describe, it, expectTypeOf } from "vitest";
import {
  toWidgetResult,
  toTextResult,
  extractWidgetPayload,
  hostSupportsWidgets,
  declareWidgetCapability,
  WIDGENTIC_MIME_TYPE,
  WIDGENTIC_VERSION
} from "../index.js";
import type { McpToolResult, McpCapabilities, WidgetExtraction } from "../index.js";
import type { WidgetPayload } from "@widgentic/core";
import type { AdapterError } from "@widgentic/core";
import type { WidgetContractError } from "@widgentic/core";

describe("mcp types", () => {
  it("constants have literal types", () => {
    expectTypeOf<typeof WIDGENTIC_MIME_TYPE>().toEqualTypeOf<"application/vnd.widgentic+json">();
    expectTypeOf<typeof WIDGENTIC_VERSION>().toEqualTypeOf<1>();
  });

  it("emission returns MCP-shaped results", () => {
    expectTypeOf(toWidgetResult).returns.toEqualTypeOf<McpToolResult>();
    expectTypeOf(toTextResult).returns.toEqualTypeOf<McpToolResult>();
    // structural: unknown extra fields are permitted
    const result: McpToolResult = { content: [], vendor: { x: 1 } };
    expectTypeOf(result).toMatchTypeOf<McpToolResult>();
  });

  it("extraction result narrows through found and ok", () => {
    const extraction: WidgetExtraction = extractWidgetPayload({});
    if (extraction.found) {
      if (extraction.ok) {
        expectTypeOf(extraction.payload).toEqualTypeOf<WidgetPayload>();
      } else {
        expectTypeOf(extraction.error).toEqualTypeOf<
          AdapterError | WidgetContractError
        >();
      }
    } else {
      // @ts-expect-error payload is unavailable when not found
      extraction.payload;
    }
  });

  it("negotiation helpers are total and typed", () => {
    expectTypeOf(hostSupportsWidgets).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(hostSupportsWidgets).returns.toEqualTypeOf<boolean>();
    expectTypeOf(declareWidgetCapability).returns.toEqualTypeOf<McpCapabilities>();
  });
});
