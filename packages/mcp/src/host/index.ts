/**
 * The runtime-neutral widgentic host: what an MCP server outside Node needs
 * from widgentic, behind JSON strings in and out, so any embedded engine
 * with ECMAScript and `Intl` can serve it (the .NET package runs the bundle
 * of this module on V8).
 *
 * The configuration (designer-exported widgets, theme entries, shared
 * schemas) is composed once per host by the store's own composition and
 * checks; refused entries are skipped and listed by `problems()`, never
 * thrown. Calls dispatch to the same handlers the Node assembly wires, and
 * nothing is kept from one call to the next.
 *
 * Render-only: http actions compile disabled (`unresolved`), no `load` is
 * emitted, and neither `execute_action` nor `list_actions` is served. The
 * template's own `preview_widget` is served, marked app-only; rate limiting
 * previews belongs to the embedding server's transport.
 */
import { isPlainObject } from "@widgentic/core";
import type { McpToolResult } from "../output/index.js";
import {
  GET_AUTHORING_GUIDE_TOOL,
  LIST_SCHEMAS_TOOL,
  LIST_THEME_TOKENS_TOOL,
  LIST_THEMES_TOOL,
  LIST_WIDGETS_TOOL,
  PREVIEW_WIDGET_TOOL,
  RENDER_WIDGET_TOOL,
  APP_ONLY_VISIBILITY,
  APP_TEMPLATE_RESOURCE,
  WIDGET_PAGE_RESOURCE
} from "../server/definitions.js";
import type { McpToolDefinition } from "../server/definitions.js";
import {
  handleListThemeTokens,
  handleListThemes,
  handleListWidgets,
  handlePreviewWidget,
  handleRenderWidget,
  listSchemasResult,
  renderWidgetPage,
  unknownToolResult
} from "../server/handlers.js";
import type { StoredSchemaEntry } from "../server/handlers.js";
import { handleGetAuthoringGuide } from "../server/guide.js";
import { buildAppTemplate } from "../server/app-template.js";
import { composeCatalogEntries, composeThemeEntries } from "../store/compose.js";
import type { ComposeProblem } from "../store/compose.js";
import { checkStoredSchema } from "../store/validate.js";
import { DEFAULT_LIMITS } from "../store/limits.js";

/** Replaced with the package version when the bundle is built. */
declare const WIDGENTIC_HOST_VERSION: string | undefined;

/** One refused configuration entry. `index` is -1 when the section itself is malformed. */
export interface HostProblem {
  section: string;
  index: number;
  name: string;
  code: string;
  message: string;
}

/** A widgentic host. Every argument and result is a string. */
export interface WidgenticHost {
  /** The `@widgentic/mcp` version the bundle was built from (`source` when run unbundled). */
  version(): string;
  /** JSON array of {@link HostProblem}: the configuration entries that were refused. */
  problems(): string;
  /**
   * JSON array of the served tools' definitions (name, description,
   * inputSchema), with `visibility: ["app"]` on the tools only the mounted
   * template calls.
   */
  definitions(): string;
  /** JSON of the served resources (app template, preview-page template): name, URI, MIME type, description. */
  resources(): string;
  /** The MCP tool result JSON for one call; an unknown name is an `UNKNOWN_TOOL` result. */
  call(name: string, argsJson: string, slim: boolean): string;
  /** The MCP Apps template document (`ui://widgentic/app.html`). */
  appTemplate(): string;
  /** The preview page for `ui://widgentic/page/{kind}`. */
  widgetPage(kind: string): string;
}

/** A served tool: its exported definition, plus its visibility when only the template calls it. */
type ServedTool = McpToolDefinition & { visibility?: readonly string[] };

/** The tools a host serves, in the order the Node assembly registers them. */
const SERVED_TOOLS: readonly ServedTool[] = [
  LIST_WIDGETS_TOOL,
  LIST_THEME_TOKENS_TOOL,
  LIST_THEMES_TOOL,
  LIST_SCHEMAS_TOOL,
  GET_AUTHORING_GUIDE_TOOL,
  RENDER_WIDGET_TOOL,
  { ...PREVIEW_WIDGET_TOOL, visibility: APP_ONLY_VISIBILITY }
];

/** The host's documents, registered exactly as the Node assembly registers them. */
const SERVED_RESOURCES = { appTemplate: APP_TEMPLATE_RESOURCE, widgetPage: WIDGET_PAGE_RESOURCE };

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** A configuration section as an entry list, or the problem with the section itself. */
function section(
  config: Record<string, unknown>,
  name: string,
  problems: HostProblem[]
): readonly unknown[] {
  const value = config[name];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  problems.push({
    section: name,
    index: -1,
    name,
    code: "INVALID_SHAPE",
    message: `'${name}' must be an array.`
  });
  return [];
}

/** Valid shared schemas, by the store's check; duplicates are refused, never shadowed. */
function composeSchemas(entries: readonly unknown[], problems: HostProblem[]): StoredSchemaEntry[] {
  const schemas: StoredSchemaEntry[] = [];
  for (const [index, entry] of entries.entries()) {
    const name = String(isPlainObject(entry) ? entry.name : undefined);
    if (schemas.length >= DEFAULT_LIMITS.maxSchemas) {
      problems.push({
        section: "schemas",
        index,
        name,
        code: "LIMIT_REACHED",
        message: `stopped at the ${DEFAULT_LIMITS.maxSchemas}-schema limit; later entries were skipped.`
      });
      break;
    }
    const problem = checkStoredSchema(entry);
    if (problem !== undefined) {
      problems.push({ section: "schemas", index, name, code: problem.code, message: problem.message });
      continue;
    }
    const schema = entry as StoredSchemaEntry;
    if (schemas.some((known) => known.name === schema.name)) {
      problems.push({
        section: "schemas",
        index,
        name,
        code: "DUPLICATE_NAME",
        message: `a schema named '${schema.name}' is already configured.`
      });
      continue;
    }
    schemas.push(schema);
  }
  return schemas;
}

/** Refusals only: an unknown action ref is a warning, and every http action is disabled here anyway. */
function refusals(problems: readonly ComposeProblem[]): HostProblem[] {
  return problems
    .filter((problem) => problem.warning !== true)
    .map(({ section, index, name, code, message }) => ({ section, index, name, code, message }));
}

/**
 * Create a host from a JSON configuration:
 * `{ widgets?: WidgetDefinition[], themes?: ThemeEntry[], schemas?: StoredSchemaEntry[] }`.
 */
export function createWidgenticHost(configJson: string): WidgenticHost {
  const problems: HostProblem[] = [];
  const parsed = parseJson(configJson);
  let config: Record<string, unknown> = {};
  if (parsed.ok && isPlainObject(parsed.value)) {
    config = parsed.value;
  } else {
    problems.push({
      section: "config",
      index: -1,
      name: "config",
      code: "INVALID_SHAPE",
      message: "The configuration must be a JSON object with optional 'widgets', 'themes' and 'schemas' arrays."
    });
  }

  const schemas = composeSchemas(section(config, "schemas", problems), problems);
  const composed = composeCatalogEntries(
    {
      widgets: section(config, "widgets", problems),
      schemas: new Map(schemas.map((entry) => [entry.name, entry.schema]))
    },
    { httpDisabled: "unresolved" }
  );
  const themes = composeThemeEntries(section(config, "themes", problems));
  problems.push(...refusals(composed.problems), ...refusals(themes.problems));

  const catalog = composed.catalog;
  const registry = themes.registry;
  const handlers = new Map<string, (args: unknown, slim: boolean) => McpToolResult>([
    [LIST_WIDGETS_TOOL.name, () => handleListWidgets(catalog)],
    [LIST_THEME_TOKENS_TOOL.name, () => handleListThemeTokens()],
    [LIST_THEMES_TOOL.name, () => handleListThemes(registry)],
    [LIST_SCHEMAS_TOOL.name, () => listSchemasResult(schemas)],
    [GET_AUTHORING_GUIDE_TOOL.name, () => handleGetAuthoringGuide()],
    [RENDER_WIDGET_TOOL.name, (args, slim) => handleRenderWidget(catalog, args, { slim, themes: registry })],
    [PREVIEW_WIDGET_TOOL.name, (args) => handlePreviewWidget(catalog, args, { themes: registry })]
  ]);

  return {
    version: () => (typeof WIDGENTIC_HOST_VERSION === "string" ? WIDGENTIC_HOST_VERSION : "source"),
    problems: () => JSON.stringify(problems),
    definitions: () => JSON.stringify(SERVED_TOOLS),
    resources: () => JSON.stringify(SERVED_RESOURCES),
    call(name, argsJson, slim) {
      const handler = handlers.get(name);
      if (handler === undefined) {
        return JSON.stringify(unknownToolResult(name, [...handlers.keys()]));
      }
      // Unparseable arguments reach the handler as the raw text, which it
      // rejects in its own vocabulary ("Input must be an object…").
      const args = parseJson(argsJson);
      return JSON.stringify(handler(args.ok ? args.value : argsJson, slim === true));
    },
    appTemplate: () => buildAppTemplate(),
    widgetPage: (kind) => renderWidgetPage(catalog, kind)
  };
}
