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
import type { ThemeEntry } from "@widgentic/core";
import { isPlainObject } from "@widgentic/core";
import { argumentsOf, invalidArgument, notMounted, okResult, rejected } from "./result.js";
import { defineTool, objectSchema, PERSON_SAVES } from "./tool.js";
import type { NameOf } from "./tool.js";
import type { WebMcpTool } from "./types.js";

const ENTRY_SCHEMA = (what: string): Record<string, unknown> =>
  objectSchema({ entry: { type: "object", description: `The ${what} entry.` } }, ["entry"]);

export function themeTools(source: () => ThemeDesignerHandle | undefined, name: NameOf): WebMcpTool[] {
  return [
    defineTool({
      name: name("theme_get"),
      title: "Read the theme entry",
      readOnly: true,
      description:
        "Read the theme entry open in the theme designer: { entry: { name, label?, description?, extends?, tokens } } — tokens is a map of --wg-* token names (and x-<name> author variables) to CSS values.",
      inputSchema: objectSchema({}),
      execute() {
        const handle = source();
        if (handle === undefined) return notMounted("theme");
        return okResult({ entry: handle.getTheme() });
      }
    }),
    defineTool({
      name: name("theme_load"),
      title: "Load a theme entry",
      description:
        "Replace the entry in the theme designer: { entry: { name, label?, description?, tokens } }. name: lowercase letters, digits, '.', '_' or '-'; light and dark are reserved. " +
        "Validated by the theming rules (list tokens with theme_token_specs); refused → { ok: false, code: 'REJECTED', errors }. " +
        PERSON_SAVES,
      inputSchema: ENTRY_SCHEMA("theme"),
      execute(input) {
        const handle = source();
        if (handle === undefined) return notMounted("theme");
        const { entry } = argumentsOf(input);
        if (!isPlainObject(entry)) return invalidArgument("entry", "object");
        const result = handle.loadTheme(entry);
        if (!result.ok) return rejected(result.errors);
        return okResult({ entry: handle.getTheme() });
      }
    }),
    defineTool({
      name: name("theme_tokens_set"),
      title: "Merge theme tokens",
      description:
        "Change some tokens of the theme entry open in the theme designer without retyping the rest: { tokens: { <token>: <css value> }, remove?: [<token>] }. " +
        "The result is validated as a whole; an invalid value leaves the entry unchanged and returns { ok: false, code: 'REJECTED', errors }. " +
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
        return okResult({ entry: handle.getTheme() });
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
        "Replace the entry in the schema designer: { entry: { name, label?, description?, schema } }. name: letters, digits, '.', '_' or '-'; schema: a JSON Schema object. " +
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
        return okResult({ entry: handle.getSchema() });
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
