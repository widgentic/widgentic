import { describe, it, expectTypeOf } from "vitest";
import { validateTheme, applyTheme, themeToCss } from "../index.js";
import type {
  WidgetTheme,
  WidgetThemeInput,
  ThemeError,
  ThemeErrorCode,
  ValidateThemeResult
} from "../index.js";

describe("theming types", () => {
  it("WidgetTheme accepts registry tokens only", () => {
    expectTypeOf<{ bg: string; accent: string }>().toMatchTypeOf<WidgetTheme>();
    expectTypeOf<{ sneaky: string }>().not.toMatchTypeOf<WidgetTheme>();
  });

  it("WidgetThemeInput adds custom x-* variables without losing tokens", () => {
    expectTypeOf<{ bg: string }>().toMatchTypeOf<WidgetThemeInput>();
    expectTypeOf<{ "x-badge-gap": string }>().toMatchTypeOf<WidgetThemeInput>();
    // Registry tokens keep their exact-name typing.
    expectTypeOf<{ bg: string; accent: string }>().toMatchTypeOf<WidgetThemeInput>();
  });

  it("validateTheme narrows on ok", () => {
    const result: ValidateThemeResult = validateTheme({});
    if (result.ok) {
      expectTypeOf(result.theme).toEqualTypeOf<WidgetThemeInput>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<ThemeError>();
      expectTypeOf(result.error.code).toEqualTypeOf<ThemeErrorCode>();
    }
  });

  it("apply and generate are typed", () => {
    expectTypeOf(applyTheme).parameter(0).toEqualTypeOf<Element>();
    expectTypeOf(applyTheme).parameter(1).toEqualTypeOf<WidgetThemeInput>();
    expectTypeOf(themeToCss).returns.toEqualTypeOf<string>();
  });
});
