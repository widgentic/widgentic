import { describe, it, expect } from "vitest";
// All imports resolve through the package `exports` map (self-reference),
// confirming every entry works for consumers — including the new ./mcp.
import { parseCsv } from "@widgentic/core";
import { mapToWidget } from "@widgentic/core";
import { createCatalog, renderToHtml } from "@widgentic/core";
import {
  declareWidgetCapability,
  hostSupportsWidgets,
  toWidgetResult,
  toTextResult,
  extractWidgetPayload
} from "../index.js";

describe("end-to-end: tool emits, host renders", () => {
  it("csv → mapper → widget result → extraction → catalog → html", () => {
    // Tool side: parse external data and build a payload.
    const parsed = parseCsv("name,role\nAda,eng\nLin,ops");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const payload = mapToWidget({
      data: parsed.records,
      meta: { title: "People" }
    });
    expect(payload.kind).toBe("table");

    // Negotiation: host advertises support, tool emits a widget.
    const hostCapabilities = declareWidgetCapability();
    expect(hostSupportsWidgets(hostCapabilities)).toBe(true);
    const result = toWidgetResult(payload);

    // Host side: extract (validating against the catalog's kinds) and render.
    const catalog = createCatalog();
    const extraction = extractWidgetPayload(result, {
      knownKinds: new Set(catalog.kinds())
    });
    expect(extraction).toMatchObject({ found: true, ok: true });
    if (!(extraction.found && extraction.ok)) return;

    const rendered = catalog.render(extraction.payload);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const html = renderToHtml(rendered.node);
    expect(html).toContain('class="wg-table"');
    expect(html).toContain(">Ada</");
    expect(html).toContain(">ops</");
  });

  it("incapable host gets the text fallback path", () => {
    const payload = mapToWidget({
      data: { name: "Ada" },
      meta: { title: "Person" }
    });
    // Host never advertised support → tool emits text instead.
    expect(hostSupportsWidgets({})).toBe(false);
    const result = toTextResult(payload);

    expect(extractWidgetPayload(result)).toEqual({ found: false });
    const block = result.content[0];
    expect(block?.type).toBe("text");
    const text = typeof block?.text === "string" ? block.text : "";
    expect(text.startsWith("Person\n")).toBe(true);
    expect(text).toContain('"name": "Ada"');
  });
});
