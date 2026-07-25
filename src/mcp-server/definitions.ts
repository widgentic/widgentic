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
      }
    },
    required: ["widget", "data"],
    additionalProperties: false
  }
};
