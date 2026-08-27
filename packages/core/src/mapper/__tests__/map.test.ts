import { describe, it, expect } from "vitest";
import { mapToWidget } from "../index.js";
import type { MapperInput } from "../index.js";
import { validateWidgetPayload } from "../../contract/index.js";

describe("mapToWidget", () => {
  describe("kind selection", () => {
    it("fills kind from data shape when absent", () => {
      const rows = [{ a: 1 }, { a: 2 }];
      const result = mapToWidget({ data: rows });
      expect(result.kind).toBe("table");
      expect(result.data).toBe(rows);
    });

    it("preserves an explicit kind even when data suggests another", () => {
      const result = mapToWidget({ kind: "card", data: [{ a: 1 }, { a: 2 }] });
      expect(result.kind).toBe("card");
    });

    it("does not re-infer an explicit kind", () => {
      const result = mapToWidget({ kind: "tree", data: { a: 1 } });
      expect(result.kind).toBe("tree");
    });
  });

  describe("totality", () => {
    it("maps null data to the card fallback", () => {
      const result = mapToWidget({ data: null });
      expect(result.kind).toBe("card");
      expect(result.data).toBeNull();
    });

    it("replaces a non-string kind by inference", () => {
      const input = { kind: 42, data: [{ a: 1 }] } as unknown as MapperInput;
      expect(mapToWidget(input).kind).toBe("table");
    });

    it("replaces an empty-string kind by inference", () => {
      expect(mapToWidget({ kind: "", data: { a: 1 } }).kind).toBe("card");
    });

    it("does not throw on a non-object input", () => {
      const result = mapToWidget(null as unknown as MapperInput);
      expect(result.kind).toBe("card");
      expect(result.data).toBeNull();
    });
  });

  describe("passthrough and non-mutation", () => {
    it("preserves hints, meta, and unknown top-level fields", () => {
      const hints = { density: "compact" };
      const meta = { title: "T" };
      const result = mapToWidget({ data: { a: 1 }, hints, meta, custom: 1 });
      expect(result.hints).toBe(hints);
      expect(result.meta).toBe(meta);
      expect(result.custom).toBe(1);
    });

    it("does not mutate the input and returns a new object", () => {
      const input: MapperInput = { data: { a: 1 } };
      const result = mapToWidget(input);
      expect("kind" in input).toBe(false);
      expect(result).not.toBe(input);
    });

    it("passes data through by reference", () => {
      const rows = [{ a: 1 }];
      expect(mapToWidget({ data: rows }).data).toBe(rows);
    });
  });

  describe("contract integration", () => {
    it("produces payloads that pass validateWidgetPayload", () => {
      const inputs: MapperInput[] = [
        { data: [{ a: 1 }, { a: 2 }] },
        { data: { name: "Ada" }, hints: { density: "compact" } },
        { data: { label: "root", children: [] }, meta: { title: "T" } },
        { kind: "custom", data: "raw", extra: true },
        { data: null }
      ];
      for (const input of inputs) {
        const result = validateWidgetPayload(mapToWidget(input));
        expect(result.ok).toBe(true);
      }
    });
  });
});
