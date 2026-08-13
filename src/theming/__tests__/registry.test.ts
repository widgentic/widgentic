import { describe, expect, it } from "vitest";
import {
  createThemeRegistry,
  darkTheme,
  DuplicateThemeError,
  validateTheme
} from "../index.js";

describe("theme registry", () => {
  it("ships light and dark built-ins", () => {
    const registry = createThemeRegistry();
    expect(registry.names()).toContain("light");
    expect(registry.names()).toContain("dark");
    expect(registry.get("light")?.tokens).toEqual({});
    expect(registry.get("dark")?.tokens).toEqual(darkTheme);
    // Every built-in is valid theme data.
    for (const entry of registry.list()) {
      expect(validateTheme(entry.tokens).ok, entry.name).toBe(true);
    }
  });

  it("registers and retrieves named themes", () => {
    const registry = createThemeRegistry();
    registry.register({
      name: "brand",
      label: "Brand",
      description: "House colors",
      tokens: { accent: "#ff5a1f" }
    });
    expect(registry.get("brand")).toMatchObject({
      name: "brand",
      label: "Brand",
      tokens: { accent: "#ff5a1f" }
    });
    expect(registry.list().map((e) => e.name)).toContain("brand");
  });

  it("merges extends at registration and keeps the base name", () => {
    const registry = createThemeRegistry();
    registry.register({
      name: "brand-dark",
      extends: "dark",
      tokens: { accent: "#ff5a1f" }
    });
    const entry = registry.get("brand-dark");
    // Base tokens inherited…
    expect(entry?.tokens.bg).toBe(darkTheme.bg);
    expect(entry?.tokens.surface).toBe(darkTheme.surface);
    // …with the override winning, and provenance retained.
    expect(entry?.tokens.accent).toBe("#ff5a1f");
    expect(entry?.extends).toBe("dark");
  });

  it("carries custom variables through registration and inheritance", () => {
    const registry = createThemeRegistry();
    registry.register({ name: "base", tokens: { "x-gap": "4px" } });
    registry.register({ name: "child", extends: "base", tokens: { accent: "#000" } });
    expect(registry.get("child")?.tokens["x-gap"]).toBe("4px");
  });

  it("refuses duplicates, invalid tokens, unknown bases and empty names", () => {
    const registry = createThemeRegistry();
    expect(() => registry.register({ name: "dark", tokens: {} })).toThrow(
      DuplicateThemeError
    );
    expect(() =>
      registry.register({ name: "bad", tokens: { sneaky: "red" } as never })
    ).toThrow(/UNKNOWN_TOKEN|sneaky/);
    expect(() =>
      registry.register({ name: "orphan", extends: "nope", tokens: {} })
    ).toThrow(/not registered/);
    expect(() => registry.register({ name: "  ", tokens: {} })).toThrow(
      /non-empty/
    );
  });

  it("keeps registries independent", () => {
    const a = createThemeRegistry();
    const b = createThemeRegistry();
    a.register({ name: "only-a", tokens: {} });
    expect(b.get("only-a")).toBeUndefined();
  });
});
