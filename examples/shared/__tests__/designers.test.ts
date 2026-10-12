// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ThemeEntry } from "@widgentic/core";
import { previewThemes, restoredDraft } from "../designers.js";

describe("previewThemes", () => {
  it("offers the saved entries after the built-ins, as registered", () => {
    const saved: ThemeEntry[] = [
      { name: "ocean", tokens: { accent: "#0000ff" }, styles: { ".wg-btn": { color: "blue" } } },
      { name: "base", tokens: { bg: "#111111" } }
    ];
    const entries = previewThemes(saved);
    expect(entries.map((entry) => entry.name)).toEqual(["light", "dark", "ocean", "base"]);
    expect(entries.find((entry) => entry.name === "ocean")?.styles).toEqual({ ".wg-btn": { color: "blue" } });
  });

  it("keeps the built-ins and leaves out an entry the registry refuses", () => {
    const entries = previewThemes([
      { name: "dark", tokens: { bg: "#ff0000" } },
      { name: "bad", tokens: { sneaky: "red" } as unknown as ThemeEntry["tokens"] }
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["light", "dark"]);
    expect(entries.find((entry) => entry.name === "dark")?.tokens.bg).not.toBe("#ff0000");
  });
});

describe("restoredDraft", () => {
  const draft = {
    kind: "my widget",
    template: { tag: "div" },
    descriptor: { description: "d" },
    theme: { accent: "#123456" },
    previewTheme: "ocean"
  };

  it("restores the definition as the person left it, a kind Save would refuse included", () => {
    expect(restoredDraft(JSON.stringify(draft))).toEqual({ kind: "my widget", template: { tag: "div" }, descriptor: { description: "d" } });
  });

  it("starts fresh on nothing, corrupt text or a non-draft", () => {
    expect(restoredDraft(null)).toBeUndefined();
    expect(restoredDraft("{not json")).toBeUndefined();
    expect(restoredDraft(JSON.stringify({ kind: "x" }))).toBeUndefined();
  });
});
