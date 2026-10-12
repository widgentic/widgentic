// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ThemeEntry } from "@widgentic/core";
import { previewThemes } from "../designers.js";

describe("previewThemes", () => {
  it("merges an entry's base in, as render_widget does, whatever the order", () => {
    const saved: ThemeEntry[] = [
      { name: "child", extends: "base", tokens: { accent: "#0000ff" }, styles: { ".wg-btn": { color: "blue" } } },
      { name: "base", tokens: { bg: "#111111" }, styles: { ".wg-btn": { padding: "4px" } } }
    ];
    const entries = previewThemes(saved);
    expect(entries.map((entry) => entry.name)).toEqual(["light", "dark", "base", "child"]);
    const child = entries.find((entry) => entry.name === "child");
    expect(child?.tokens).toEqual({ bg: "#111111", accent: "#0000ff" });
    expect(child?.styles).toEqual({ ".wg-btn": { padding: "4px", color: "blue" } });
  });

  it("keeps the built-ins first and leaves out an entry that never registers", () => {
    const entries = previewThemes([
      { name: "dark", tokens: { bg: "#ff0000" } },
      { name: "orphan", extends: "missing", tokens: {} }
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["light", "dark"]);
    expect(entries.find((entry) => entry.name === "dark")?.tokens.bg).not.toBe("#ff0000");
  });
});
