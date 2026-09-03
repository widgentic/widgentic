/**
 * Widget designer tools: read the draft the person is looking at, load a
 * definition into it, replace its example data, set its preview theme. Every
 * edit goes through the designer's own validation and is visible immediately.
 */
import type { DesignerDiagnostics, DesignerHandle, WidgetDefinition, WidgetDraft } from "@widgentic/designer";
import { deriveDiagnostics } from "@widgentic/designer";
import { isPlainObject } from "@widgentic/core";
import { dslCheatSheet } from "./guide.js";
import { argumentsOf, invalidArgument, notMounted, okResult, rejected } from "./result.js";
import { defineTool, objectSchema, PERSON_SAVES } from "./tool.js";
import type { NameOf } from "./tool.js";
import type { WebMcpTool } from "./types.js";

/**
 * The designer computes diagnostics on every change and hands them to
 * subscribers; there is no getter. Subscribe once per handle so the tools
 * return exactly what the designer computed for the change they made.
 * Before the first change nothing is cached — then derive without the host's
 * shared entries and say so (`diagnosticsDerived`), because unknown schema or
 * action references may be over-reported there.
 */
const latest = new WeakMap<DesignerHandle, DesignerDiagnostics>();
const tracked = new WeakSet<DesignerHandle>();

function track(handle: DesignerHandle): void {
  if (tracked.has(handle)) return;
  tracked.add(handle);
  handle.subscribe((_draft, diagnostics) => {
    latest.set(handle, diagnostics);
  });
}

function diagnosticsOf(handle: DesignerHandle): { diagnostics: DesignerDiagnostics; diagnosticsDerived: boolean } {
  track(handle);
  const cached = latest.get(handle);
  if (cached !== undefined) return { diagnostics: cached, diagnosticsDerived: false };
  return { diagnostics: deriveDiagnostics(handle.getDraft()), diagnosticsDerived: true };
}

/** The export shape: what the designer's Export panel and the server's import consume. */
function definitionOf(draft: WidgetDraft): WidgetDefinition {
  return {
    kind: draft.kind,
    template: draft.template,
    descriptor: draft.descriptor,
    ...(draft.load !== undefined ? { load: draft.load } : {})
  };
}

const DEFINITION_SHAPE =
  "{ kind, template, descriptor, load? } — kind: a unique id that is not a built-in (card, table, tree, group); " +
  "template: the widgentic template DSL (data SELECTS, you supply every literal; no expressions); " +
  "descriptor: { description (required), dataSchema? | dataSchemaRef?, dataExample?, … }; load?: an http action binding run on first render.";

export function widgetTools(source: () => DesignerHandle | undefined, name: NameOf, prefix: string): WebMcpTool[] {
  const rules = dslCheatSheet(prefix);
  const resolve = (): DesignerHandle | undefined => {
    const handle = source();
    if (handle !== undefined) track(handle);
    return handle;
  };

  return [
    defineTool({
      name: name("widget_draft_get"),
      title: "Read the widget draft",
      readOnly: true,
      description:
        "Read the widget definition currently open in the widget designer, in its export shape " +
        DEFINITION_SHAPE +
        " Returns { definition, diagnostics } — diagnostics is the designer's verdict (previewable, kind/template/example/style issues). " +
        "Call this first: it is what the person is looking at.",
      inputSchema: objectSchema({}),
      execute() {
        const handle = resolve();
        if (handle === undefined) return notMounted("widget");
        return okResult({ definition: definitionOf(handle.getDraft()), ...diagnosticsOf(handle) });
      }
    }),
    defineTool({
      name: name("widget_draft_load"),
      title: "Load a widget definition",
      description:
        "Replace the draft in the widget designer with a complete definition " +
        DEFINITION_SHAPE +
        " The designer validates it: applied → { ok: true, diagnostics } and the person sees it immediately; refused → { ok: false, code: 'REJECTED', errors } with the exact messages the designer shows. " +
        "Keep the person's kind unless asked to change it. " +
        PERSON_SAVES +
        " " +
        rules,
      inputSchema: objectSchema(
        { definition: { type: "object", description: "The widget definition in export shape." } },
        ["definition"]
      ),
      execute(input) {
        const handle = resolve();
        if (handle === undefined) return notMounted("widget");
        const { definition } = argumentsOf(input);
        if (!isPlainObject(definition)) return invalidArgument("definition", "object");
        const result = handle.loadWidget(definition);
        if (!result.ok) return rejected(result.errors);
        return okResult(diagnosticsOf(handle));
      }
    }),
    defineTool({
      name: name("widget_example_data_set"),
      title: "Set the widget's example data",
      description:
        "Replace the draft's example data (descriptor.dataExample) — the data the preview renders and the example saved with the widget. " +
        "Send { data } matching the draft's data schema (the shape descriptor.dataShape sketches; bind paths in the template must exist in it). Returns the diagnostics; a mismatch with the schema is reported in diagnostics.example rather than silently previewed. " +
        PERSON_SAVES,
      inputSchema: objectSchema(
        { data: { description: "Example data for the widget (any JSON value the data schema accepts)." } },
        ["data"]
      ),
      execute(input) {
        const handle = resolve();
        if (handle === undefined) return notMounted("widget");
        const args = argumentsOf(input);
        if (!("data" in args) || args.data === undefined) return invalidArgument("data", "a JSON value");
        const draft = handle.getDraft();
        const next: WidgetDefinition = {
          ...definitionOf(draft),
          descriptor: { ...draft.descriptor, dataExample: args.data }
        };
        const result = handle.loadWidget(next);
        if (!result.ok) return rejected(result.errors);
        return okResult(diagnosticsOf(handle));
      }
    }),
    defineTool({
      name: name("widget_theme_set"),
      title: "Set the widget preview theme",
      description:
        "Set the theme tokens the widget preview is rendered with: { tokens: { <token>: <css value> } } over the --wg-* tokens " +
        "(list them with the theme_token_specs tool; author variables are x-<name>). Validated by the theming rules; refused → { ok: false, code: 'REJECTED', errors }. " +
        "This is the preview theme of the draft, not a saved theme entry.",
      inputSchema: objectSchema(
        { tokens: { type: "object", description: "Token name → CSS value.", additionalProperties: { type: "string" } } },
        ["tokens"]
      ),
      execute(input) {
        const handle = resolve();
        if (handle === undefined) return notMounted("widget");
        const { tokens } = argumentsOf(input);
        if (!isPlainObject(tokens)) return invalidArgument("tokens", "object of token → value");
        const result = handle.loadTheme(tokens);
        if (!result.ok) return rejected(result.errors);
        return okResult({ theme: handle.getDraft().theme ?? {} });
      }
    })
  ];
}
