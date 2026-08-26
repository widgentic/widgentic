/**
 * widgentic/designer — the embeddable widget designer.
 *
 * Import discipline: this capability consumes the rest of widgentic ONLY
 * through public package entries (`widgentic/catalog`, `widgentic/templates`,
 * `widgentic/theming`, `widgentic/reactive`, `widgentic/contract`) so it can
 * be extracted into a standalone npm package without code changes. It
 * performs no network I/O — hosts own persistence via change events.
 */
export { createDesigner } from "./shell.js";
export type {
  DesignerHandle,
  DesignerOptions,
  LoadResult,
  WidgetDefinition
} from "./shell.js";
export {
  defineDesignerElement,
  defineThemeDesignerElement,
  defineSchemaDesignerElement,
  defineActionDesignerElement,
  DEFAULT_TAG,
  DEFAULT_THEME_TAG,
  DEFAULT_SCHEMA_TAG,
  DEFAULT_ACTION_TAG
} from "./element.js";
export { createActionDesigner, checkActionEntry } from "./action-designer.js";
export type {
  ActionDesignerHandle,
  ActionDesignerOptions,
  ActionEntry,
  ActionLoadResult
} from "./action-designer.js";
export {
  createBindingEditor,
  createDefinitionEditor,
  starterHttpDefinition,
  starterPromptDefinition
} from "./action-editor.js";
export type {
  ActionEditorContext,
  BindingEditor,
  BindingEditorContext,
  DefinitionEditor
} from "./action-editor.js";
export { createThemeDesigner, checkThemeEntry } from "./theme-designer.js";
export { createSchemaDesigner, checkSchemaEntry } from "./schema-designer.js";
export type {
  SchemaDesignerHandle,
  SchemaDesignerOptions,
  SchemaEntry,
  SchemaLoadResult
} from "./schema-designer.js";
export type {
  ThemeDesignerHandle,
  ThemeDesignerOptions,
  ThemeLoadResult
} from "./theme-designer.js";
export type { WidgetDraft, DraftStore } from "./store.js";
export { starterDraft } from "./store.js";
export { seedWidgetDraft, seedThemeEntry, SEEDABLE_BUILTINS } from "./seed.js";
export type { SeedableBuiltin } from "./seed.js";
export { deriveDiagnostics } from "./validate.js";
export type {
  DesignerDiagnostics,
  StyleIssue,
  TemplateIssue
} from "./validate.js";
export {
  exportWidgetJson,
  exportThemeJson,
  importWidgetJson,
  toTypeScriptModule
} from "./io.js";
export type { ImportResult } from "./io.js";
