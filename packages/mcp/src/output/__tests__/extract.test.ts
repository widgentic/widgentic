import { describe, it, expect } from "vitest";
import {
  extractWidgetPayload,
  isWidgetResult,
  toWidgetResult,
  WIDGENTIC_MIME_TYPE
} from "../index.js";

function widgenticResult(text: unknown) {
  return {
    content: [
      {
        type: "resource",
        resource: { uri: "ui://widgentic/widget", mimeType: WIDGENTIC_MIME_TYPE, text }
      }
    ]
  };
}

describe("extractWidgetPayload", () => {
  it("round-trips an emitted widget payload", () => {
    const payload = {
      kind: "card",
      data: { a: 1 },
      hints: { density: "compact" },
      meta: { title: "T" }
    };
    const extraction = extractWidgetPayload(toWidgetResult(payload));
    expect(extraction).toEqual({ found: true, ok: true, payload });
  });

  it("leaves non-widget results alone", () => {
    expect(
      extractWidgetPayload({ content: [{ type: "text", text: "hi" }] })
    ).toEqual({ found: false });
  });

  it("ignores resource blocks with other mime types", () => {
    const result = {
      content: [
        {
          type: "resource",
          resource: { uri: "file://x", mimeType: "text/plain", text: "{}" }
        }
      ]
    };
    expect(extractWidgetPayload(result)).toEqual({ found: false });
  });

  it("returns found:false for garbage input without throwing", () => {
    for (const input of [null, undefined, 42, "x", {}, { content: "nope" }]) {
      expect(extractWidgetPayload(input)).toEqual({ found: false });
    }
  });

  it("reports invalid JSON as a structured error", () => {
    const extraction = extractWidgetPayload(widgenticResult("{not json"));
    expect(extraction.found).toBe(true);
    if (extraction.found && !extraction.ok) {
      expect(extraction.error.code).toBe("INVALID_JSON");
    } else {
      expect.fail("expected an error extraction");
    }
  });

  it("reports contract violations as structured errors", () => {
    const extraction = extractWidgetPayload(
      widgenticResult(JSON.stringify({ data: 1 }))
    );
    expect(extraction.found).toBe(true);
    if (extraction.found && !extraction.ok) {
      expect(extraction.error.code).toBe("MISSING_FIELD");
    } else {
      expect.fail("expected an error extraction");
    }
  });

  it("honors knownKinds", () => {
    const extraction = extractWidgetPayload(
      widgenticResult(JSON.stringify({ kind: "exotic", data: 1 })),
      { knownKinds: new Set(["card"]) }
    );
    if (extraction.found && !extraction.ok) {
      expect(extraction.error.code).toBe("UNKNOWN_KIND");
    } else {
      expect.fail("expected an error extraction");
    }
  });

  it("first widgentic block wins", () => {
    const first = JSON.stringify({ kind: "card", data: 1 });
    const second = JSON.stringify({ kind: "table", data: 2 });
    const result = {
      content: [
        widgenticResult(first).content[0],
        widgenticResult(second).content[0]
      ]
    };
    const extraction = extractWidgetPayload(result);
    if (extraction.found && extraction.ok) {
      expect(extraction.payload.kind).toBe("card");
    } else {
      expect.fail("expected a successful extraction");
    }
  });
});

describe("isWidgetResult", () => {
  it("detects widgentic blocks regardless of validity", () => {
    expect(isWidgetResult(widgenticResult("{not json"))).toBe(true);
    expect(isWidgetResult({ content: [{ type: "text", text: "x" }] })).toBe(
      false
    );
    expect(isWidgetResult(null)).toBe(false);
  });
});
