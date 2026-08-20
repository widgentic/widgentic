/**
 * The designer's derive step: run widgentic's pure validators over the
 * draft and shape their structured errors into per-panel diagnostics.
 * Everything here goes through public package entries — the designer owns
 * no validation logic of its own.
 */
import {
  createCatalog,
  validateDataAgainstSchema,
  widgetStylesToCss
} from "widgentic/catalog";
import type { WidgetStyles } from "widgentic/catalog";
import type { WidgetContractError } from "widgentic/contract";
import { validateTemplate } from "widgentic/templates";
import { validateTheme } from "widgentic/theming";
import type { ThemeError } from "widgentic/theming";
import type { WidgetDraft } from "./store.js";

export interface TemplateIssue {
  code: string;
  message: string;
  /** Node path when the validator reports one. */
  path?: string;
}

export interface StyleIssue {
  selector: string;
  property?: string;
  message: string;
}

export interface DesignerDiagnostics {
  /** Problem with the kind id itself (empty, or colliding with a base kind). */
  kind?: string;
  template?: TemplateIssue;
  /** `descriptor.dataExample` vs `descriptor.dataSchema`. */
  example?: WidgetContractError;
  /** `sampleData` vs `descriptor.dataSchema`. */
  sample?: WidgetContractError;
  /** Entries the renderer's safety filters would skip. */
  styles: StyleIssue[];
  theme?: ThemeError;
  /** Shared-schema reference problems (unknown ref, or ref + inline). */
  schemaRef?: string;
  /** True when the draft can be registered and previewed. */
  previewable: boolean;
}

/** Host-supplied shared schemas the draft may reference by name. */
export interface DeriveOptions {
  schemas?: { name: string; schema: Record<string, unknown> }[];
}

/**
 * The schema validation actually runs against: the inline one, or the
 * referenced shared one resolved from the supplied list — the same join
 * the server's composition performs.
 */
export function effectiveDataSchema(
  draft: WidgetDraft,
  schemas: { name: string; schema: Record<string, unknown> }[] = []
): Record<string, unknown> | undefined {
  const ref = draft.descriptor?.dataSchemaRef;
  if (typeof ref === "string") {
    return schemas.find((entry) => entry.name === ref)?.schema;
  }
  const inline = draft.descriptor?.dataSchema;
  return isPlainObject(inline) ? inline : undefined;
}

const BASE_KINDS = new Set(createCatalog().kinds());

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detect style entries the renderer would skip, using only the public
 * generator: a probe that produces no CSS was filtered by the safety
 * guards. Selector and per-declaration issues are reported separately.
 */
function auditStyles(styles: WidgetStyles | undefined): StyleIssue[] {
  if (!isPlainObject(styles)) return [];
  const issues: StyleIssue[] = [];
  for (const [selector, declarations] of Object.entries(styles)) {
    if (widgetStylesToCss({ [selector]: { color: "red" } }) === "") {
      issues.push({
        selector,
        message:
          "Selector would be skipped — every comma-separated part must target a .wg- class and avoid ;{}<>@\\."
      });
      continue;
    }
    if (!isPlainObject(declarations)) {
      issues.push({ selector, message: "Declarations must be a property → value map." });
      continue;
    }
    for (const [property, value] of Object.entries(declarations)) {
      if (
        typeof value !== "string" ||
        widgetStylesToCss({ ".wg-probe": { [property]: value } }) === ""
      ) {
        issues.push({
          selector,
          property,
          message:
            "Declaration would be skipped — unsafe property name or value (no url(), expression(), or ;{}<>@\\)."
        });
      }
    }
  }
  return issues;
}

/** Run every validator; total — never throws on any draft shape. */
export function deriveDiagnostics(
  draft: WidgetDraft,
  options: DeriveOptions = {}
): DesignerDiagnostics {
  const diagnostics: DesignerDiagnostics = { styles: [], previewable: false };

  if (typeof draft.kind !== "string" || draft.kind.trim().length === 0) {
    diagnostics.kind = "Kind must be a non-empty id.";
  } else if (BASE_KINDS.has(draft.kind)) {
    diagnostics.kind = `'${draft.kind}' is a built-in kind — pick a distinct id.`;
  }

  const template = validateTemplate(draft.template);
  if (!template.ok) {
    const issue: TemplateIssue = {
      code: template.error.code,
      message: template.error.message
    };
    const path = (template.error as { path?: unknown }).path;
    if (typeof path === "string") issue.path = path;
    diagnostics.template = issue;
  }

  // Shared-schema refs resolve here exactly as the server's composition
  // resolves them, so diagnostics match what the store will enforce.
  const ref = draft.descriptor?.dataSchemaRef;
  if (typeof ref === "string") {
    if (draft.descriptor?.dataSchema !== undefined) {
      diagnostics.schemaRef =
        "A descriptor carries 'dataSchema' OR 'dataSchemaRef', never both.";
    } else if (
      (options.schemas ?? []).every((entry) => entry.name !== ref)
    ) {
      diagnostics.schemaRef = `References unknown schema '${ref}' — it is not among the supplied shared schemas.`;
    }
  }
  const schema = effectiveDataSchema(draft, options.schemas ?? []);
  if (isPlainObject(schema)) {
    if (draft.descriptor.dataExample !== undefined) {
      const error = validateDataAgainstSchema(schema, draft.descriptor.dataExample);
      if (error) diagnostics.example = error;
    }
    if (draft.sampleData !== undefined) {
      const error = validateDataAgainstSchema(schema, draft.sampleData);
      if (error) diagnostics.sample = error;
    }
  }

  diagnostics.styles = auditStyles(draft.descriptor?.styles);

  if (draft.theme !== undefined) {
    const theme = validateTheme(draft.theme);
    if (!theme.ok) diagnostics.theme = theme.error;
  }

  diagnostics.previewable =
    diagnostics.kind === undefined && diagnostics.template === undefined;
  return diagnostics;
}
