/**
 * Theme, schema and action designer tools: each mirrors its handle — read the
 * entry, load an entry through the designer's validation — plus a token merge
 * for the theme designer.
 */
import type {
  ActionDesignerHandle,
  SchemaDesignerHandle,
  ThemeDesignerHandle
} from "@widgentic/designer";
import { auditStyles } from "@widgentic/designer";
import type { ThemeEntry } from "@widgentic/core";
import { auditDataSchema, DATA_SCHEMA_TYPES, isPlainObject, TOKEN_VALUE_RULE } from "@widgentic/core";
import { argumentsOf, invalidArgument, notMounted, okResult, rejected } from "./result.js";
import { defineTool, objectSchema, PERSON_SAVES } from "./tool.js";
import type { NameOf } from "./tool.js";
import type { WebMcpTool } from "./types.js";

const ENTRY_SCHEMA = (what: string): Record<string, unknown> =>
  objectSchema({ entry: { type: "object", description: `The ${what} entry.` } }, ["entry"]);

/**
 * The entry with what the theme designer's Styles panel shows: every style
 * entry the renderer would drop, with its reason — the same audit a widget's
 * styles get in its diagnostics.
 */
function themeResult(handle: ThemeDesignerHandle) {
  const entry = handle.getTheme();
  return okResult({ entry, diagnostics: { styles: auditStyles(entry.styles) } });
}

const THEME_RESULT =
  "Returns { entry, diagnostics: { styles } } — styles lists every style entry the renderer would drop, with its reason (empty when all apply). ";

export function themeTools(source: () => ThemeDesignerHandle | undefined, name: NameOf): WebMcpTool[] {
  return [
    defineTool({
      name: name("theme_get"),
      title: "Read the theme entry",
      readOnly: true,
      description:
        "Read the theme entry open in the theme designer: { entry: { name, label?, description?, extends?, tokens, styles? } } — tokens is a map of --wg-* token names (and x-<name> author variables) to CSS values; styles maps .wg- selectors to { property: value } (shared classes every widget under the theme can use). " +
        THEME_RESULT,
      inputSchema: objectSchema({}),
      execute() {
        const handle = source();
        if (handle === undefined) return notMounted("theme");
        return themeResult(handle);
      }
    }),
    defineTool({
      name: name("theme_load"),
      title: "Load a theme entry",
      description:
        "Replace the WHOLE entry in the theme designer: { entry: { name, label?, description?, tokens, styles? } } — read it with theme_get first and keep its styles, or they are dropped. name: letters, digits, '.', '_' or '-'; light and dark are reserved. " +
        "tokens: bare --wg-* token names (colours: bg, surface, fg, muted, accent, accent-fg, border; shape: radius, radius-sm, radius-lg, spacing, border-width; type and status tokens — list them all with theme_token_specs) and author variables x-<name>, to plain CSS values. " + TOKEN_VALUE_RULE + " " +
        "styles: shared .wg- classes, { \".wg-btn\": { \"padding\": \"4px 8px\" } }, under the widget style rules. " +
        "A dark theme sets bg/surface/fg/muted/border together so contrast holds. " + THEME_RESULT +
        "Refused → { ok: false, code: 'REJECTED', errors }. " +
        PERSON_SAVES,
      inputSchema: ENTRY_SCHEMA("theme"),
      execute(input) {
        const handle = source();
        if (handle === undefined) return notMounted("theme");
        const { entry } = argumentsOf(input);
        if (!isPlainObject(entry)) return invalidArgument("entry", "object");
        const result = handle.loadTheme(entry);
        if (!result.ok) return rejected(result.errors);
        return themeResult(handle);
      }
    }),
    defineTool({
      name: name("theme_tokens_set"),
      title: "Merge theme tokens",
      description:
        "Change some tokens of the theme entry open in the theme designer without retyping the rest: { tokens: { <token>: <css value> }, remove?: [<token>] }. " +
        "The result is validated as a whole; an invalid value leaves the entry unchanged and returns { ok: false, code: 'REJECTED', errors }. " +
        THEME_RESULT +
        PERSON_SAVES,
      inputSchema: objectSchema({
        tokens: { type: "object", description: "Token name → CSS value to set.", additionalProperties: { type: "string" } },
        remove: { type: "array", items: { type: "string" }, description: "Token names to drop." }
      }),
      execute(input) {
        const handle = source();
        if (handle === undefined) return notMounted("theme");
        const args = argumentsOf(input);
        const tokens = args.tokens === undefined ? {} : args.tokens;
        if (!isPlainObject(tokens)) return invalidArgument("tokens", "object of token → value");
        const remove = args.remove === undefined ? [] : args.remove;
        if (!Array.isArray(remove) || !remove.every((item) => typeof item === "string")) {
          return invalidArgument("remove", "array of token names");
        }
        const current = handle.getTheme();
        const merged: Record<string, unknown> = { ...current.tokens, ...tokens };
        for (const token of remove) delete merged[token];
        const next: ThemeEntry = { ...current, tokens: merged as ThemeEntry["tokens"] };
        const result = handle.loadTheme(next);
        if (!result.ok) return rejected(result.errors);
        return themeResult(handle);
      }
    })
  ];
}

export function schemaTools(source: () => SchemaDesignerHandle | undefined, name: NameOf): WebMcpTool[] {
  return [
    defineTool({
      name: name("schema_get"),
      title: "Read the schema entry",
      readOnly: true,
      description:
        "Read the shared data-schema entry open in the schema designer: { entry: { name, label?, description?, schema } } — schema is a JSON Schema object widgets reference by name (dataSchemaRef).",
      inputSchema: objectSchema({}),
      execute() {
        const handle = source();
        if (handle === undefined) return notMounted("schema");
        return okResult({ entry: handle.getSchema() });
      }
    }),
    defineTool({
      name: name("schema_load"),
      title: "Load a schema entry",
      description:
        "Replace the entry in the schema designer: { entry: { name, label?, description?, schema } }. name: letters, digits, '.', '_' or '-'; schema: a JSON Schema object in the supported subset — type (" + DATA_SCHEMA_TYPES.join("/") + " or an array of those), properties, required, items, enum, pattern (bounded); unknown keywords are ignored. " +
        "What the validator would ignore (another type name, a pattern it will not run, a keyword of the wrong shape) still loads, with { warnings } naming each — fix them, or the schema checks less than you meant. " +
        "Widgets reference it as descriptor.dataSchemaRef: \"<name>\" instead of an inline dataSchema. " +
        "Refused → { ok: false, code: 'REJECTED', errors }. " +
        PERSON_SAVES,
      inputSchema: ENTRY_SCHEMA("schema"),
      execute(input) {
        const handle = source();
        if (handle === undefined) return notMounted("schema");
        const { entry } = argumentsOf(input);
        if (!isPlainObject(entry)) return invalidArgument("entry", "object");
        const result = handle.loadSchema(entry);
        if (!result.ok) return rejected(result.errors);
        const loaded = handle.getSchema();
        const warnings = auditDataSchema(loaded.schema);
        return okResult(warnings.length === 0 ? { entry: loaded } : { entry: loaded, warnings });
      }
    })
  ];
}

export function actionTools(source: () => ActionDesignerHandle | undefined, name: NameOf): WebMcpTool[] {
  return [
    defineTool({
      name: name("action_get"),
      title: "Read the action entry",
      readOnly: true,
      description:
        "Read the action entry open in the action designer: { entry: { name, label?, description?, definition } } — definition is a prompt action ({ kind: 'prompt', text }) or an http action ({ kind: 'http', … }).",
      inputSchema: objectSchema({}),
      execute() {
        const handle = source();
        if (handle === undefined) return notMounted("action");
        return okResult({ entry: handle.getAction() });
      }
    }),
    defineTool({
      name: name("action_load"),
      title: "Load an action entry",
      description:
        "Replace the entry in the action designer: { entry: { name, label?, description?, definition } }. name: lowercase letters, digits and dashes, starting with a letter. " +
        "Refused → { ok: false, code: 'REJECTED', errors }. Secrets are referenced by name only and never pass through this tool. " +
        PERSON_SAVES,
      inputSchema: ENTRY_SCHEMA("action"),
      execute(input) {
        const handle = source();
        if (handle === undefined) return notMounted("action");
        const { entry } = argumentsOf(input);
        if (!isPlainObject(entry)) return invalidArgument("entry", "object");
        const result = handle.loadAction(entry);
        if (!result.ok) return rejected(result.errors);
        return okResult({ entry: handle.getAction() });
      }
    })
  ];
}
