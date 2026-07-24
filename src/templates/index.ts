export type {
  WidgetTemplate,
  TemplateNode,
  TemplateAttrValue,
  TemplateBind,
  TemplateElement,
  TemplateEach,
  TemplateWhen,
  TemplateError,
  TemplateErrorCode
} from "./types.js";
export { validateTemplate, InvalidTemplateError } from "./validate.js";
export type { ValidateTemplateResult } from "./validate.js";
export { compileTemplate, registerTemplate } from "./compile.js";
