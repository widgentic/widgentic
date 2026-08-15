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
export { MAX_TEMPLATE_DEPTH, URL_ATTRS } from "./guards.js";
export type { ValidateTemplateResult } from "./validate.js";
export {
  compileTemplate,
  registerTemplate,
  countTemplateNodes,
  DEFAULT_MAX_NODES
} from "./compile.js";
export type { CompileOptions } from "./compile.js";
