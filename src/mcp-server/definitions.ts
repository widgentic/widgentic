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
        enum: ["both", "html", "widget", "page"],
        description:
          "Output selection (default 'both'): 'html' fragment only (no " +
          "payload block — plain consumers only; strands widgentic-aware " +
          "hosts), 'widget' payload block only, 'page' a self-contained " +
          "styled HTML document (plus the payload block)."
      },
      theme: {
        type: "object",
        description:
          "Theme token map: bare token names to CSS string values — always " +
          "strings, e.g. '6px' not 6. Discover tokens, defaults, and " +
          "presets with list_theme_tokens. Applied to 'page' output and " +
          "embedded in the widget payload for native hosts on every format."
      }
    },
    required: ["widget", "data"],
    additionalProperties: false
  }
};
