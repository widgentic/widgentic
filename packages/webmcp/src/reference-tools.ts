/**
 * Tools that need no designer: the authoring contract, a dry-run validation
 * of a widget definition, and the theme-token reference — all derived at call
 * time from the exported specs and validators.
 */
import { TOKEN_SPECS } from "@widgentic/core";
import { isPlainObject } from "@widgentic/core";
import { deriveDiagnostics, importWidgetJson } from "@widgentic/designer";
import type { WidgetDefinition } from "@widgentic/designer";
import { buildDesignerGuide, dslCheatSheet } from "./guide.js";
import { argumentsOf, invalidArgument, okResult, rejected } from "./result.js";
import { defineTool, objectSchema } from "./tool.js";
import type { NameOf } from "./tool.js";
import type { WebMcpTool } from "./types.js";

export function authoringGuideTool(name: NameOf, prefix: string): WebMcpTool {
  return defineTool({
    name: name("authoring_guide"),
    title: "Read the authoring guide",
    readOnly: true,
    description:
      "The complete authoring contract for widgets, themes, shared schemas and actions, derived from the validators the designers enforce: " +
      "the widget shape, the template DSL (bind/each/when/element, the map/prefix/format transforms, paths, actions), safety rules, style rules, data-schema subset, theme tokens, identifier patterns and limits. " +
      "Read it once before drafting anything non-trivial; the editing tools carry only a summary.",
    inputSchema: objectSchema({}),
    execute() {
      return okResult({ guide: buildDesignerGuide(prefix) });
    }
  });
}

export function widgetDefinitionCheckTool(name: NameOf, prefix: string): WebMcpTool {
  return defineTool({
    name: name("widget_definition_check"),
    title: "Check a widget definition",
    readOnly: true,
    description:
      "Validate a widget definition WITHOUT touching the designer: { definition: { kind, template, descriptor, load? } }. " +
      "Returns exactly what the load tool would — { ok: true, diagnostics } (previewable, example-vs-schema verdict, style entries the renderer would drop) or { ok: false, code: 'REJECTED', errors } with the designer's messages. " +
      "Iterate here until it is clean, then load it into the designer. " +
      dslCheatSheet(prefix),
    inputSchema: objectSchema({ definition: { type: "object", description: "The widget definition in export shape." } }, ["definition"]),
    execute(input) {
      const { definition } = argumentsOf(input);
      if (!isPlainObject(definition)) return invalidArgument("definition", "object");
      const checked = importWidgetJson(JSON.stringify(definition));
      if (!checked.ok) return rejected(checked.errors);
      const accepted: WidgetDefinition = checked.definition;
      const diagnostics = deriveDiagnostics({
        kind: accepted.kind,
        template: accepted.template,
        descriptor: accepted.descriptor,
        ...(accepted.load !== undefined ? { load: accepted.load } : {})
      });
      return okResult({ diagnostics, diagnosticsDerived: true });
    }
  });
}

export function themeTokenSpecsTool(name: NameOf): WebMcpTool {
  return defineTool({
    name: name("theme_token_specs"),
    title: "List the theme tokens",
    readOnly: true,
    description:
      "List every --wg-* theme token with its value type, default, purpose and fallback token — the vocabulary for theme entries and preview themes. Author-defined variables are x-<name>.",
    inputSchema: objectSchema({}),
    execute() {
      const tokens = Object.entries(TOKEN_SPECS).map(([token, spec]) => ({
        name: token,
        type: spec.type,
        default: spec.default,
        use: spec.use,
        ...("fallback" in spec && spec.fallback !== undefined ? { fallback: spec.fallback } : {})
      }));
      return okResult({ tokens });
    }
  });
}
