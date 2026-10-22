import { describe, expect, it } from "vitest";
import { checkWidgetThemes, createCatalog, el } from "../index.js";

describe("descriptors may name the widget's themes", () => {
  it("a descriptor names a theme per mode", () => {
    const catalog = createCatalog();
    catalog.register("promo", () => el("p", {}, ["x"]), {
      description: "d",
      dataShape: "{}",
      themes: { light: "acme", dark: "acme-night" }
    });
    expect(catalog.describe("promo")?.themes).toEqual({ light: "acme", dark: "acme-night" });
    expect(catalog.list().find((d) => d.kind === "promo")?.themes).toEqual({ light: "acme", dark: "acme-night" });
    catalog.register("plain", () => el("p", {}, ["x"]), { description: "d", dataShape: "{}" });
    expect(catalog.describe("plain")).not.toHaveProperty("themes");
  });

  it("one mode, or a built-in, is enough", () => {
    expect(checkWidgetThemes({ light: "acme" })).toBeUndefined();
    expect(checkWidgetThemes({ dark: "dark" })).toBeUndefined();
    expect(checkWidgetThemes({})).toBeUndefined();
  });

  it("a malformed themes field is refused", () => {
    for (const value of [{ light: 5 }, { sepia: "acme" }, { light: "" }, { light: "a b" }, "acme", null, ["acme"]]) {
      const problem = checkWidgetThemes(value);
      expect(problem, JSON.stringify(value)).toContain("descriptor.themes");
    }
  });
});
