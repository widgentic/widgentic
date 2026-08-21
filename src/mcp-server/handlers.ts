import type { DataSchema, HintDiagnostic, WidgetCatalog, WidgetStyles } from "../catalog/index.js";
import { analyzeHints, renderToHtml, widgetStylesToCss } from "../catalog/index.js";
import type { WidgetContractError } from "../contract/index.js";
import type { McpToolResult, McpContentBlock } from "../mcp/index.js";
import { WIDGENTIC_MIME_TYPE, WIDGENTIC_URI } from "../mcp/index.js";
import type { ThemeRegistry, WidgetTheme } from "../theming/index.js";
import {
  THEME_TOKENS,
  TOKEN_DEFAULTS,
  TOKEN_SPECS,
  baseStylesheet,
  darkTheme,
  themeToCss,
  validateTheme
} from "../theming/index.js";

import {
  WIDGENTIC_APP_MIME_TYPE,
  WIDGENTIC_UI_URI_PREFIX
} from "./definitions.js";

const FORMATS = ["both", "html", "widget", "page", "app"] as const;
type RenderFormat = (typeof FORMATS)[number];

/** True when a schema declares string-typed data (and not object/array). */
function declaresStringOnly(schema: DataSchema | undefined): boolean {
  if (!schema) return false;
  const type = schema.type;
  const types =
    typeof type === "string" ? [type] : Array.isArray(type) ? type : [];
  return (
    types.includes("string") &&
    !types.includes("object") &&
    !types.includes("array")
  );
}

/**
 * The page body takes background, color, and font from the theme tokens —
 * a dark theme recolors the whole document, not just the widget chrome.
 */
const PAGE_BODY_CSS =
  `body {\n` +
  `  background: var(--wg-bg, ${TOKEN_DEFAULTS.bg});\n` +
  `  color: var(--wg-fg, ${TOKEN_DEFAULTS.fg});\n` +
  `  font-family: var(--wg-font-family, ${TOKEN_DEFAULTS["font-family"]});\n` +
  `  font-size: var(--wg-font-size, ${TOKEN_DEFAULTS["font-size"]});\n` +
  `  margin: calc(var(--wg-spacing, ${TOKEN_DEFAULTS.spacing}) * 2);\n` +
  `}`;

/** Self-contained styled document for `format: "page"`. */
function composePage(
  fragment: string,
  theme: WidgetTheme | undefined,
  styleCss: string
): string {
  const parts = [
    baseStylesheet,
    PAGE_BODY_CSS,
    ...(styleCss ? [styleCss] : []),
    ...(theme ? [themeToCss(theme, ":root")] : [])
  ];
  return (
    `<!doctype html>\n<meta charset="utf-8">\n<title>widgentic</title>\n` +
    `<style>\n${parts.join("\n")}\n</style>\n<body>${fragment}</body>`
  );
}

/** Same plain-object definition as the contract validator. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Undo client-side marshalling: some clients JSON-serialize the `data`
 * argument into a string — occasionally more than once (double encoding).
 * String layers are peeled (bounded) and the result is committed ONLY when
 * it reaches a structured object/array; otherwise the original string
 * passes through verbatim as legitimate literal data, never half-unwrapped.
 */
function coerceData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  let candidate: unknown = data;
  for (let depth = 0; depth < 3 && typeof candidate === "string"; depth++) {
    const trimmed = candidate.trim();
    const first = trimmed.charAt(0);
    if (first !== "{" && first !== "[" && first !== '"') break;
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return typeof candidate === "object" && candidate !== null ? candidate : data;
}

/**
 * Tool-level errors: the contract vocabulary plus codes that only exist at
 * this layer (theme resolution is a server concern, not a payload one).
 */
type ToolError =
  | WidgetContractError
  | { code: "UNKNOWN_THEME"; path: string; message: string };

/** Structured, agent-correctable failure using the contract vocabulary. */
function errorResult(error: ToolError): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(error) }]
  };
}

/**
 * `list_theme_tokens`: the theming vocabulary as JSON — token names with
 * their light defaults, ready-made presets, and the value rules — so remote
 * agents can build valid themes without reading widgentic source.
 */
export function handleListThemeTokens(): McpToolResult {
  const listing = {
    tokens: THEME_TOKENS.map((token) => ({
      name: token,
      default: TOKEN_SPECS[token].default,
      type: TOKEN_SPECS[token].type,
      use: TOKEN_SPECS[token].use
    })),
    presets: { dark: darkTheme },
    rules:
      "Values are CSS strings (e.g. '6px', not 6). Unsafe values are " +
      "rejected: no ';', braces, angle brackets, url(), or expression(). " +
      "Unset tokens fall back to the light defaults. Keys named " +
      "'x-<lowercase-kebab>' are accepted as custom variables and emitted " +
      "as --wg-x-<name>, for widgets that need their own knobs. Pass the " +
      "map (or a registered theme name from list_themes) as " +
      "render_widget's 'theme' input. Each token's 'type' states the kind " +
      "of CSS value it expects (color, dimension, number, font-family, " +
      "font-weight, shadow). When you build a theme the user may want to " +
      "KEEP, also deliver it as the importable entry " +
      "{ name, label?, description?, tokens } and point them to Import in " +
      "the theme designer at widgentic.dev — the inline map only styles " +
      "one render (see get_authoring_guide)."
  };
  return {
    content: [{ type: "text", text: JSON.stringify(listing, null, 2) }]
  };
}

/**
 * `list_widgets`: the catalog's descriptors as JSON, so agents can discover
 * kinds, purposes, expected data shapes, and examples.
 */
export function handleListWidgets(catalog: WidgetCatalog): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(catalog.list(), null, 2) }]
  };
}

/**
 * `list_themes`: the registered named themes, so an agent can ask for
 * `theme: "dark"` instead of composing a token map. Pure — the registry is
 * supplied, mirroring `handleListWidgets(catalog)`.
 */
export function handleListThemes(registry: ThemeRegistry): McpToolResult {
  const listing = {
    themes: registry.list(),
    rules:
      "Pass any 'name' above as render_widget's 'theme' input. Tokens are " +
      "shown for reference; a token map may still be passed inline. A new " +
      "theme the user wants to keep belongs in the designer: deliver it as " +
      "{ name, label?, description?, tokens } for Import at widgentic.dev " +
      "(see get_authoring_guide)."
  };
  return {
    content: [{ type: "text", text: JSON.stringify(listing, null, 2) }]
  };
}

/**
 * `list_schemas`: the principal's saved shared schemas, so an agent asked
 * for a widget "using schema xyz" can bind its real properties and set
 * `descriptor.dataSchemaRef` instead of reconstructing the schema inline.
 * Takes an async SOURCE, not a list: the read happens when the tool is
 * called — renders never pay for it.
 */
export async function handleListSchemas(
  source: (() => Promise<StoredSchemaEntry[]>) | undefined
): Promise<McpToolResult> {
  const schemas = source === undefined ? [] : await source();
  const listing = {
    schemas,
    rules:
      "Reference a listed schema from a widget draft by NAME: set " +
      "descriptor.dataSchemaRef to it and omit descriptor.dataSchema " +
      "(never both). Bind the schema's declared properties and make " +
      "dataExample satisfy it. Copying the schema inline forks it — the " +
      "copy goes stale the moment the user edits the shared one (see " +
      "get_authoring_guide)."
  };
  return {
    content: [{ type: "text", text: JSON.stringify(listing, null, 2) }]
  };
}

/** The stored-schema entry shape `list_schemas` serves (store-owned). */
export interface StoredSchemaEntry {
  name: string;
  label?: string;
  description?: string;
  schema: Record<string, unknown>;
}

/**
 * `render_widget`: validate `{ widget, data, hints?, meta? }` against the
 * catalog and the contract, render, and return the HTML plus the widgentic
 * payload block. Total — any input shape produces a result, never a throw.
 */
export function handleRenderWidget(
  catalog: WidgetCatalog,
  input: unknown,
  options?: { slim?: boolean | undefined; themes?: ThemeRegistry | undefined }
): McpToolResult {
  if (!isPlainObject(input)) {
    return errorResult({
      code: "INVALID_TYPE",
      path: "",
      message: "Input must be an object with 'widget' and 'data'."
    });
  }
  const widget = input.widget;
  if (typeof widget !== "string" || widget.length === 0) {
    return errorResult({
      code: "MISSING_FIELD",
      path: "widget",
      message: "'widget' must be a non-empty widget kind id (see list_widgets)."
    });
  }
  if (!("data" in input) || input.data === undefined) {
    return errorResult({
      code: "MISSING_FIELD",
      path: "data",
      message: "'data' is required (see the kind's dataShape in list_widgets)."
    });
  }

  const format: unknown = input.format === undefined ? "both" : input.format;
  if (!FORMATS.includes(format as RenderFormat)) {
    return errorResult({
      code: "INVALID_TYPE",
      path: "format",
      message: `'format' must be one of ${FORMATS.map((f) => `'${f}'`).join(", ")}.`
    });
  }

  let theme: WidgetTheme | undefined;
  if ("theme" in input && input.theme !== undefined) {
    // A string is a registered theme name; an object is an inline map.
    if (typeof input.theme === "string") {
      const entry = options?.themes?.get(input.theme);
      if (entry === undefined) {
        const available = options?.themes?.names().sort().join(", ") ?? "(none)";
        return errorResult({
          code: "UNKNOWN_THEME",
          path: "theme",
          message: `Unknown theme '${input.theme}'. Available themes: ${available}.`
        });
      }
      theme = entry.tokens;
    } else {
      const validated = validateTheme(input.theme);
      if (!validated.ok) {
        return errorResult({
          code: "INVALID_TYPE",
          path: validated.error.token ? `theme.${validated.error.token}` : "theme",
          message: validated.error.message
        });
      }
      theme = validated.theme;
    }
  }

  // Schema-aware marshalling: kinds declaring string-typed data receive the
  // string verbatim — literal JSON-shaped text stays expressible for them.
  const schema = catalog.describe(widget)?.dataSchema;
  const payload: Record<string, unknown> = {
    kind: widget,
    data: declaresStringOnly(schema) ? input.data : coerceData(input.data)
  };
  if ("hints" in input && input.hints !== undefined) payload.hints = input.hints;
  if ("meta" in input && input.meta !== undefined) payload.meta = input.meta;
  // The theme rides the payload as an unknown-field passthrough, so hosts
  // that mount the widget natively can honor it (advisory, any format).
  if (theme !== undefined) payload.theme = theme;

  // Contract validation (kind membership, hints/meta shape) + rendering.
  const rendered = catalog.render(payload);
  if (!rendered.ok) {
    // Translate payload vocabulary to tool-input vocabulary ('widget', not
    // 'kind') and make unknown-widget errors self-sufficient — recovery
    // should not require a second round trip to list_widgets. Only the
    // TOP-LEVEL kind error translates: a group item's unknown kind keeps
    // its `data.items[<i>].kind` path.
    if (rendered.error.code === "UNKNOWN_KIND" && rendered.error.path === "kind") {
      return errorResult({
        code: "UNKNOWN_KIND",
        path: "widget",
        message: `Unknown widget '${widget}'. Available widgets: ${catalog
          .kinds()
          .sort()
          .join(", ")}.`
      });
    }
    return errorResult(rendered.error);
  }

  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    return errorResult({
      code: "INVALID_TYPE",
      path: "data",
      message: "'data' must be JSON-serializable."
    });
  }

  const html = renderToHtml(rendered.node);
  // Styles channel: the rendered kind's registered styles — and for a
  // group, the union with every distinct item kind's, first-appearance
  // order, each kind's block exactly once (custom items keep their look).
  const styleKinds: string[] = [widget];
  if (widget === "group" && isPlainObject(payload.data) && Array.isArray(payload.data.items)) {
    for (const item of payload.data.items) {
      if (
        isPlainObject(item) &&
        typeof item.kind === "string" &&
        !styleKinds.includes(item.kind)
      ) {
        styleKinds.push(item.kind);
      }
    }
  }
  const widgetBlock: McpContentBlock = {
    type: "resource",
    resource: {
      uri: WIDGENTIC_URI,
      mimeType: WIDGENTIC_MIME_TYPE,
      text: json
    }
  };

  // Presentation channel for the declared MCP Apps template: hosts push the
  // whole result into the mounted iframe via ui/notifications/tool-result,
  // and per the Apps convention structuredContent is not model context.
  const styleCss = styleKinds
    .map((kind) => {
      const styles = catalog.describe(kind)?.styles;
      return styles ? widgetStylesToCss(styles) : "";
    })
    .filter((part) => part.length > 0)
    .join("\n");
  // The doubled selector matches the app template's dark-override
  // specificity (:root[data-theme="dark"]), so an explicit render theme
  // wins on dark hosts too — same specificity, later style element.
  const themeCss = theme ? themeToCss(theme, ':root, :root[data-theme="dark"]') : "";
  const structuredContent: Record<string, unknown> = {
    html,
    css: [styleCss, themeCss].filter((part) => part.length > 0).join("\n"),
    payload,
    // The same render, as data: the app template mounts this natively
    // (DOM from tree, patched in place across results); `html` stays the
    // fallback projection for hosts and templates that predate it.
    tree: rendered.node
  };

  // Hint-coherence feedback: forward compatibility ignores unmatched hints
  // at render time, so the model-facing text is where an agent learns its
  // hints missed. Never fatal, never changes the markup.
  const diagnostics: HintDiagnostic[] = analyzeHints(
    widget,
    payload.data,
    payload.hints,
    catalog.describe(widget)
  );
  // Group items carry their own hints; each is analyzed against its own
  // kind's descriptor, re-pathed so the caller knows which item missed.
  if (widget === "group" && isPlainObject(payload.data) && Array.isArray(payload.data.items)) {
    payload.data.items.forEach((item, index) => {
      if (!isPlainObject(item) || typeof item.kind !== "string") return;
      for (const diagnostic of analyzeHints(
        item.kind,
        item.data,
        item.hints,
        catalog.describe(item.kind)
      )) {
        diagnostics.push({
          ...diagnostic,
          hint: `data.items[${index}].hints.${diagnostic.hint}`
        });
      }
    });
  }
  if (diagnostics.length > 0) structuredContent.diagnostics = diagnostics;
  const hintNotes =
    diagnostics.length > 0
      ? `\n\nHint notes: ${diagnostics
          .map((d) => `${d.hint}: ${d.message}`)
          .join("; ")}`
      : "";

  switch (format as RenderFormat) {
    case "html":
      return {
        structuredContent,
        content: [{ type: "text", text: html + hintNotes }]
      };
    case "widget":
      return { structuredContent, content: [widgetBlock] };
    case "page":
      // The page text is a browser-facing document, not model prose — hint
      // notes would corrupt it, so they ride structuredContent only.
      return {
        structuredContent,
        content: [
          { type: "text", text: composePage(html, theme, styleCss) },
          widgetBlock
        ]
      };
    case "app":
      // Embedded static path for legacy (mcp-ui lineage) hosts that mount
      // resources straight from tool results; formal Apps hosts use the
      // declared template + structuredContent instead. Native hosts keep
      // the payload block; everyone else gets the fallback line.
      return {
        structuredContent,
        content: [
          {
            type: "text",
            text: `Rendered '${widget}' widget — view inline in an MCP Apps-capable host.${hintNotes}`
          },
          {
            type: "resource",
            resource: {
              uri: `${WIDGENTIC_UI_URI_PREFIX}${widget}`,
              mimeType: WIDGENTIC_APP_MIME_TYPE,
              text: composePage(html, theme, styleCss)
            }
          },
          widgetBlock
        ]
      };
    default:
      // Capability-aware slimming: on Apps hosts the visual mounts from
      // structuredContent, so the full HTML text block is pure model-context
      // weight — replace it with a confirmation that also heads off the
      // restate-the-data-as-text reflex. Explicit formats never slim.
      if (options?.slim === true) {
        return {
          structuredContent,
          content: [
            {
              type: "text",
              text:
                `Rendered '${widget}' widget inline — the visual is already ` +
                `displayed to the user; do not restate this data as text.${hintNotes}`
            },
            widgetBlock
          ]
        };
      }
      return {
        structuredContent,
        content: [{ type: "text", text: html + hintNotes }, widgetBlock]
      };
  }
}
