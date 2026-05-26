import { describe, it, expectTypeOf } from "vitest";
import { parseJson, parseCsv } from "../index.js";
import type { ParseJsonResult, ParseCsvResult, AdapterError } from "../index.js";

describe("adapter types", () => {
  it("parseJson result narrows on ok", () => {
    const r: ParseJsonResult = parseJson("{}");
    if (r.ok) {
      expectTypeOf(r.value).toEqualTypeOf<unknown>();
    } else {
      expectTypeOf(r.error).toMatchTypeOf<AdapterError>();
    }
  });

  it("parseCsv result narrows on ok", () => {
    const r: ParseCsvResult = parseCsv("");
    if (r.ok) {
      expectTypeOf(r.records).toEqualTypeOf<Record<string, unknown>[]>();
    } else {
      expectTypeOf(r.error.code).toMatchTypeOf<"INVALID_JSON" | "INVALID_CSV">();
    }
  });
});
