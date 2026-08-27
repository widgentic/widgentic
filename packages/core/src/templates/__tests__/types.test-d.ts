import { describe, it, expectTypeOf } from "vitest";
import { compileTemplate, validateTemplate } from "../index.js";
import type {
  TemplateNode,
  TemplateError,
  WidgetTemplate,
  ValidateTemplateResult
} from "../index.js";
import type { WidgetRenderer } from "../../catalog/index.js";

describe("template types", () => {
  it("TemplateNode accepts all five forms", () => {
    expectTypeOf<"literal">().toMatchTypeOf<TemplateNode>();
    expectTypeOf<{ bind: string }>().toMatchTypeOf<TemplateNode>();
    expectTypeOf<{ tag: string; attrs: { href: { bind: string } } }>().toMatchTypeOf<TemplateNode>();
    expectTypeOf<{ each: string; template: string }>().toMatchTypeOf<TemplateNode>();
    expectTypeOf<{ when: string; template: string; else: string }>().toMatchTypeOf<TemplateNode>();
  });

  it("validateTemplate narrows on ok", () => {
    const result: ValidateTemplateResult = validateTemplate("x");
    if (result.ok) {
      expectTypeOf(result.template).toEqualTypeOf<WidgetTemplate>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<TemplateError>();
    }
  });

  it("compileTemplate returns an ordinary WidgetRenderer", () => {
    expectTypeOf(compileTemplate).returns.toEqualTypeOf<WidgetRenderer>();
    expectTypeOf(compileTemplate).parameter(0).toEqualTypeOf<WidgetTemplate>();
  });
});
