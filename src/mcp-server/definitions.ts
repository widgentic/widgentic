/**
 * Widgentic MCP server tool definitions as plain, JSON-serializable data.
 * The input schemas are standard JSON Schema; SDK wiring layers convert to
 * their schema flavor (e.g. zod) as needed — this module stays the source
 * of truth and depends on no SDK.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const LIST_WIDGETS_TOOL: McpToolDefinition = {
  name: "list_widgets",
  description:
    "List the available widget kinds with their purpose, expected data " +
    "shape, an example data value, and supported hints. Call this first to " +
    "decide which widget fits your data, then call render_widget.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

/**
 * URI prefix for widget pages served as MCP Apps-style UI resources
 * (`text/html`). The full URI is `ui://widgentic/page/<kind>` —
 * deterministic per kind so Apps hosts can cache and reference it.
 */
export const WIDGENTIC_UI_URI_PREFIX = "ui://widgentic/page/";

/** MCP Apps mime type for UI resources (spec: `text/html;profile=mcp-app`). */
export const WIDGENTIC_APP_MIME_TYPE = "text/html;profile=mcp-app";

/** URI of the declared app template that renders `structuredContent`. */
export const WIDGENTIC_APP_TEMPLATE_URI = "ui://widgentic/app.html";

export const GET_AUTHORING_GUIDE_TOOL: McpToolDefinition = {
  name: "get_authoring_guide",
  description:
    "Get the complete guide for AUTHORING widget and theme JSON: entry " +
    "shapes, the template DSL's node forms and safety rules, identifier " +
    "rules and reserved kinds, style and schema constraints, theme tokens, " +
    "and per-user limits. Call this before drafting a custom widget or " +
    "theme for your user — you draft the JSON, your user imports and saves " +
    "it in the designer at widgentic.dev (there is no registration tool).",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

export const LIST_THEMES_TOOL: McpToolDefinition = {
  name: "list_themes",
  description:
    "List the themes registered on this server — name, label, description " +
    "and token map for each. Pass any listed name as render_widget's " +
    "'theme' input instead of composing tokens by hand.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

export const LIST_THEME_TOKENS_TOOL: McpToolDefinition = {
  name: "list_theme_tokens",
  description:
    "List the theming vocabulary for render_widget's 'theme' input: every " +
    "token name with its light-mode default, ready-made presets (e.g. " +
    "dark), and the value rules. Call this before building a theme.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

export const RENDER_WIDGET_TOOL: McpToolDefinition = {
  name: "render_widget",
  description:
    "Validate and render a widget. Returns the rendered HTML plus an " +
    "embedded widgentic payload block that widgentic-aware hosts can mount " +
    "natively. On invalid input, returns a structured error describing what " +
    "to correct.",
  inputSchema: {
    type: "object",
    properties: {
      widget: {
        type: "string",
        description: "Widget kind id, as returned by list_widgets."
      },
      data: {
        // Explicitly typed so clients marshal structured values instead of
        // JSON-serialized strings (a type-less schema invites stringification).
        type: ["array", "object", "string", "number", "boolean", "null"],
        description: "Widget data matching the kind's documented dataShape."
      },
      hints: {
        type: "object",
        description: "Optional renderer hints (see the kind's hints doc)."
      },
      meta: {
        type: "object",
        description: "Optional metadata (title, subtitle, source, ...)."
      },
      format: {
        type: "string",
        enum: ["both", "html", "widget", "page", "app"],
        description:
          "Output selection (default 'both'): 'html' fragment only (no " +
          "payload block — plain consumers only; strands widgentic-aware " +
          "hosts), 'widget' payload block only, 'page' a self-contained " +
          "styled HTML document (plus the payload block), 'app' the page " +
          "as a ui:// text/html resource for inline display — Apps hosts " +
          "use the html resource, native hosts the payload block."
      },
      theme: {
        type: ["object", "string"],
        description:
          "Either a registered theme NAME (discover with list_themes — the " +
          "simplest path, e.g. 'dark') or a token map of bare token names " +
          "to CSS string values, always strings ('6px', not 6). When the " +
          "user refers to a theme by name ('use nord dark'), pass the NAME " +
          "— their saved themes live server-side and are the source of " +
          "truth; do NOT reconstruct the tokens from memory (your copy " +
          "drifts the moment they edit it). Inline maps are for one-off, " +
          "unsaved styling. Discover tokens, defaults, and presets with " +
          "list_theme_tokens; author extras as 'x-<name>' custom " +
          "variables. Applied to 'page' output and embedded in the widget " +
          "payload for native hosts on every format."
      }
    },
    required: ["widget", "data"],
    additionalProperties: false
  }
};
