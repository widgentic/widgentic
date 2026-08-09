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
export { defineDesignerElement, DEFAULT_TAG } from "./element.js";
export type { WidgetDraft, DraftStore } from "./store.js";
export { starterDraft } from "./store.js";
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
