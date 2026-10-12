/**
 * The designer's derive step: run widgentic's pure validators over the
 * draft and shape their structured errors into per-panel diagnostics.
 * Everything here goes through public package entries — the designer owns
 * no validation logic of its own.
 */
import { auditDataSchema, isPlainObject, PROPERTY_NAME, SAFE_IDENTIFIER, STYLE_RULES } from "@widgentic/core";
import {
  createCatalog,
  validateDataAgainstSchema,
  widgetStylesToCss
} from "@widgentic/core";
import type { WidgetStyles } from "@widgentic/core";
import type { WidgetContractError } from "@widgentic/core";
import { collectActionRefs, parsePath, validateTemplate } from "@widgentic/core";
import { validateLoadBinding } from "@widgentic/core";
import { validateTheme } from "@widgentic/core";
import type { ThemeError } from "@widgentic/core";
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
  /** The widget-level `load` binding failed validation. */
  load?: string;
  /** Shared actions referenced by the template or `load` that are not among the supplied ones. */
  actionRefs?: string;
  /**
   * A warning, never blocking: without `descriptor.dataShape` agents that
   * list the widget see a placeholder instead of the data it expects.
   */
  dataShape?: string;
  /** Warnings, never blocking: what the validator would ignore in the inline `dataSchema`. */
  dataSchema?: string[];
  /** True when the draft can be registered and previewed. */
  previewable: boolean;
}

/** Host-supplied shared schemas the draft may reference by name. */
export interface DeriveOptions {
  schemas?: { name: string; schema: Record<string, unknown> }[];
  /** Host-supplied shared actions the draft may bind by name. */
  actions?: { name: string }[];
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

/** What saving would refuse about a kind, in the store's terms; `undefined` when acceptable. */
export function kindProblem(kind: string): string | undefined {
  if (!SAFE_IDENTIFIER.test(kind)) {
    return `INVALID_IDENTIFIER — '${kind}' may use letters, digits, '.', '_' or '-' only.`;
  }
  if (BASE_KINDS.has(kind)) {
    return `RESERVED_KIND — '${kind}' is a built-in kind; give the widget its own kind.`;
  }
  return undefined;
}

/**
 * Detect style entries the renderer would skip, using only the public
 * generator: a probe that produces no CSS was filtered by the safety
 * guards. Selector and per-declaration issues are reported separately.
 */
export function auditStyles(styles: WidgetStyles | undefined): StyleIssue[] {
  if (!isPlainObject(styles)) return [];
  const issues: StyleIssue[] = [];
  for (const [selector, declarations] of Object.entries(styles)) {
    if (widgetStylesToCss({ [selector]: { color: "red" } }) === "") {
      issues.push({
        selector,
        message: `Selector would be skipped. ${STYLE_RULES.selectors} ${STYLE_RULES.banned}`
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
        // Name the part at fault: the property name, or else the value.
        issues.push({
          selector,
          property,
          message: !PROPERTY_NAME.test(property)
            ? `Property would be skipped. ${STYLE_RULES.propertyNames}`
            : typeof value !== "string"
              ? "Value would be skipped: it must be a string."
              : `Value would be skipped. ${STYLE_RULES.banned}`
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
  } else {
    const problem = kindProblem(draft.kind);
    if (problem !== undefined) diagnostics.kind = problem;
  }

  const dataShape = draft.descriptor?.dataShape;
  if (typeof dataShape !== "string" || dataShape.trim() === "") {
    diagnostics.dataShape =
      "Data shape is empty — agents listing this widget will see a placeholder instead of the data it expects.";
  }

  const inlineSchema = draft.descriptor?.dataSchema;
  if (isPlainObject(inlineSchema)) {
    const warnings = auditDataSchema(inlineSchema, "dataSchema");
    if (warnings.length > 0) diagnostics.dataSchema = warnings;
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
      // Unverifiable without the host's schemas: never a false "unknown".
      options.schemas !== undefined &&
      options.schemas.every((entry) => entry.name !== ref)
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

  if (draft.load !== undefined) {
    const problem = validateLoadBinding(draft.load, "load", {
      isPath: (value) => parsePath(value) !== undefined
    });
    if (problem) diagnostics.load = `${problem.message} (at ${problem.path})`;
  }
  if (options.actions !== undefined) {
    const known = new Set(options.actions.map((action) => action.name));
    const unknown = collectActionRefs(draft.template, draft.load).filter((ref) => !known.has(ref));
    if (unknown.length > 0) {
      diagnostics.actionRefs = `References unknown shared action${unknown.length === 1 ? "" : "s"} ${unknown
        .map((ref) => `'${ref}'`)
        .join(", ")} — bound elements will render disabled.`;
    }
  }

  if (draft.theme !== undefined) {
    const theme = validateTheme(draft.theme);
    if (!theme.ok) diagnostics.theme = theme.error;
  }

  diagnostics.previewable =
    diagnostics.kind === undefined && diagnostics.template === undefined;
  return diagnostics;
}
