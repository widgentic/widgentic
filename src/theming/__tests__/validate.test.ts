import { describe, it, expect } from "vitest";
import { validateTheme, darkTheme, themeToCss } from "../index.js";
import type { WidgetTheme } from "../index.js";

describe("validateTheme", () => {
  it("accepts colors, lengths, and font stacks", () => {
    const theme = {
      bg: "#0b0e14",
      accent: "hsl(220, 90%, 65%)",
      spacing: "0.75rem",
      "font-family": "Inter, 'Segoe UI', sans-serif"
    };
    expect(validateTheme(theme)).toEqual({ ok: true, theme });
  });

  it("accepts the dark preset", () => {
    expect(validateTheme(darkTheme)).toEqual({ ok: true, theme: darkTheme });
  });

  it("dark preset lifts surface off the page background", () => {
    // Normative: darkTheme sets `surface` distinct from its `bg`, so
    // cards read as elevated in dark mode.
    expect(darkTheme.surface).toBeDefined();
    expect(darkTheme.surface).not.toBe(darkTheme.bg);
  });

  it("rejects non-object input", () => {
    for (const bad of [null, 42, "dark", ["bg"]]) {
      const result = validateTheme(bad);
      expect(!result.ok && result.error.code).toBe("INVALID_THEME");
    }
  });

  it("rejects unknown tokens with the token name", () => {
    const result = validateTheme({ sneaky: "red" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_TOKEN");
      expect(result.error.token).toBe("sneaky");
    }
  });

  it("rejects injection-shaped and non-string values", () => {
    for (const bad of [
      { bg: "red; } body { display:none" },
      { bg: "url(https://evil.example/x)" },
      { bg: "URL(https://evil.example/x)" },
      { bg: "url (https://evil.example/x)" },
      { bg: "expression(alert(1))" },
      { bg: "EXPRESSION (alert(1))" },
      { bg: "</style><script>x</script>" },
      { bg: 42 as unknown as string }
    ]) {
      const result = validateTheme(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_TOKEN_VALUE");
    }
  });
});

describe("themeToCss", () => {
  it("emits declarations under the selector", () => {
    const css = themeToCss({ bg: "#111", accent: "tomato" }, ".dashboard");
    expect(css.startsWith(".dashboard {")).toBe(true);
    expect(css).toContain("--wg-bg: #111;");
    expect(css).toContain("--wg-accent: tomato;");
  });

  it("defaults to :root", () => {
    expect(themeToCss({ bg: "#111" })).toContain(":root {");
  });

  it("never emits unsafe values", () => {
    const css = themeToCss({
      bg: "red; } * { display:none",
      accent: "url(https://evil.example)",
      fg: "#eee"
    } as WidgetTheme);
    expect(css).toContain("--wg-fg: #eee;");
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("url(");
  });
});

describe("custom x-* variables", () => {
  it("accepts well-formed custom names", () => {
    expect(validateTheme({ "x-badge-gap": "4px" }).ok).toBe(true);
    expect(validateTheme({ "x-1": "0" }).ok).toBe(true);
  });

  it("rejects malformed custom names as unknown tokens", () => {
    for (const key of ["x-", "x-Bad_Name", "xcustom", "-x-a", "x--"]) {
      const result = validateTheme({ [key]: "red" });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNKNOWN_TOKEN");
    }
  });

  it("applies the value guard to custom variables too", () => {
    const result = validateTheme({ "x-ok": "url(https://evil.example/x)" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TOKEN_VALUE");
  });
});

