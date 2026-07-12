import { describe, it, expect } from "vitest";
import { inferKind } from "../index.js";

describe("inferKind", () => {
  describe("default selection by data shape", () => {
    it("maps a non-empty array of consistent records to table", () => {
      expect(inferKind([{ a: 1 }, { a: 2 }])).toBe("table");
    });

    it("maps a single-element records array to table", () => {
      expect(inferKind([{ a: 1 }])).toBe("table");
    });

    it("maps a plain object without children to card", () => {
      expect(inferKind({ name: "Ada", email: "ada@x" })).toBe("card");
    });

    it("maps a node with a children array to tree", () => {
      expect(inferKind({ label: "root", children: [] })).toBe("tree");
    });

    it("maps a nested tree root to tree", () => {
      expect(
        inferKind({
          label: "root",
          children: [{ label: "leaf", children: [] }]
        })
      ).toBe("tree");
    });
  });

  describe("ambiguous shapes fall back to card", () => {
    it("maps a string to card", () => {
      expect(inferKind("hello")).toBe("card");
    });

    it("maps a number to card", () => {
      expect(inferKind(42)).toBe("card");
    });

    it("maps null and undefined to card", () => {
      expect(inferKind(null)).toBe("card");
      expect(inferKind(undefined)).toBe("card");
    });

    it("maps an empty array to card", () => {
      expect(inferKind([])).toBe("card");
    });

    it("maps an array of primitives to card", () => {
      expect(inferKind([1, 2, 3])).toBe("card");
    });

    it("maps a mixed-type array to card", () => {
      expect(inferKind([{ a: 1 }, "x", 2])).toBe("card");
    });

    it("maps an array of arrays to card", () => {
      expect(
        inferKind([
          [1, 2],
          [3, 4]
        ])
      ).toBe("card");
    });
  });

  describe("precedence and edge cases", () => {
    it("prefers tree over table when every record has a children array", () => {
      expect(
        inferKind([
          { label: "a", children: [] },
          { label: "b", children: [] }
        ])
      ).toBe("tree");
    });

    it("maps records where only some have children to table", () => {
      expect(inferKind([{ label: "a", children: [] }, { label: "b" }])).toBe(
        "table"
      );
    });

    it("maps records with optional fields to table", () => {
      expect(inferKind([{ id: 1, name: "a" }, { id: 2 }])).toBe("table");
    });

    it("maps records with no shared keys to card", () => {
      expect(inferKind([{ a: 1 }, { b: 2 }])).toBe("card");
    });

    it("does not treat an object with non-array children as a tree", () => {
      expect(inferKind({ children: "none" })).toBe("card");
    });
  });
});
