import { describe, it, expect } from "vitest";
import {
  toWidgetResult,
  toTextResult,
  isWidgetResult,
  extractWidgetPayload,
  WIDGENTIC_MIME_TYPE,
  WIDGENTIC_URI
} from "../index.js";
import type { McpResourceContent, McpTextContent } from "../index.js";

const payload = {
  kind: "table",
  data: [{ a: 1 }],
  meta: { title: "T" }
};

function resourceBlock(result: { content: unknown[] }): McpResourceContent {
  const block = result.content.find(
    (b): b is McpResourceContent =>
      typeof b === "object" && b !== null && (b as { type?: unknown }).type === "resource"
  );
  expect(block).toBeDefined();
  return block as McpResourceContent;
}

describe("toWidgetResult", () => {
  it("carries the payload as a widgentic resource block", () => {
    const result = toWidgetResult(payload);
    const block = resourceBlock(result);
    expect(block.resource.mimeType).toBe(WIDGENTIC_MIME_TYPE);
    expect(block.resource.uri).toBe(WIDGENTIC_URI);
    expect(JSON.parse(block.resource.text ?? "")).toEqual(payload);
  });

  it("includes a fallback text block equal to the toTextResult text", () => {
    const result = toWidgetResult(payload);
    const textBlock = result.content[0] as McpTextContent;
    expect(textBlock.type).toBe("text");
    const textOnly = toTextResult(payload).content[0] as McpTextContent;
    expect(textBlock.text).toBe(textOnly.text);
  });

  it("honors uri and text overrides", () => {
    const result = toWidgetResult(payload, {
      uri: "ui://widgentic/orders",
      text: "custom fallback"
    });
    expect(resourceBlock(result).resource.uri).toBe("ui://widgentic/orders");
    expect((result.content[0] as McpTextContent).text).toBe("custom fallback");
  });

  it("round-trips unknown top-level payload fields", () => {
    const extra = { ...payload, custom: { flag: true } };
    const extraction = extractWidgetPayload(toWidgetResult(extra));
    expect(extraction).toEqual({ found: true, ok: true, payload: extra });
  });

  it("degrades to text-only when the payload cannot serialize", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = toWidgetResult({ kind: "card", data: circular });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    expect(isWidgetResult(result)).toBe(false);
  });
});

describe("toTextResult", () => {
  it("contains title line and pretty-printed data", () => {
    const result = toTextResult({
      kind: "card",
      data: { a: 1 },
      meta: { title: "T" }
    });
    expect(result.content).toHaveLength(1);
    const block = result.content[0] as McpTextContent;
    expect(block.type).toBe("text");
    expect(block.text.startsWith("T\n")).toBe(true);
    expect(block.text).toContain('"a": 1');
  });

  it("omits the title line when meta has none", () => {
    const result = toTextResult({ kind: "card", data: { a: 1 } });
    const block = result.content[0] as McpTextContent;
    expect(block.text.startsWith("{")).toBe(true);
  });

  it("is not a widget result", () => {
    expect(isWidgetResult(toTextResult(payload))).toBe(false);
  });

  it("never throws on circular data", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const block = toTextResult({ kind: "card", data: circular })
      .content[0] as McpTextContent;
    expect(block.text).toBe("[object Object]");
  });
});
