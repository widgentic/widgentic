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
    "decide which widget fits your data, then call render_widget. ALWAYS " +
    "call it again when the user asks what widgets are available or says " +
    "they saved/imported something in the designer — catalogs are served " +
    "per API key and change between calls; never answer from an earlier " +
    "listing.",
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

export const LIST_SCHEMAS_TOOL: McpToolDefinition = {
  name: "list_schemas",
  description:
    "List the user's saved shared data schemas — name, label, description, " +
    "and the schema object itself. Call this when the user asks for a " +
    "widget built on one of their schemas ('use my person schema'): bind " +
    "the schema's actual properties and set the widget's " +
    "descriptor.dataSchemaRef to the schema's NAME instead of copying the " +
    "schema inline — an inline copy forks the moment the user edits the " +
    "shared one. Served per API key, like list_widgets; anonymous keys " +
    "see an empty list.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

export const LIST_ACTIONS_TOOL: McpToolDefinition = {
  name: "list_actions",
  description:
    "List the user's saved shared actions — name, label, description, kind, " +
    "and for http actions the method and the input/output schemas. Call " +
    "this when the user wants a widget to DO something ('add a refresh " +
    "button using my weather action'): bind a listed action by name with " +
    "\"action\": { \"ref\": \"<name>\" }, mapping an http action's input " +
    "from the widget's data (a prompt action takes no input mapping — its " +
    "binds list the data paths its text needs). The listing is the " +
    "action's contract, not its transport — the " +
    "URL, headers and query stay on the server. If nothing listed fits, " +
    "DESCRIBE the action the user should create in the designer; never " +
    "draft an inline definition with a URL or credentials you cannot know. " +
    "Served per API key, like list_widgets; anonymous keys see an empty list.",
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
    "to correct. To show several widgets at once, render ONE 'group' " +
    "(items of mixed kinds, layout hints) instead of calling repeatedly.",
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

/**
 * Called by the mounted widget (app-only visibility), never by agents: a
 * bound element's http action, or the widget's `load`, executed
 * server-side against the principal's stored definition.
 */
export const EXECUTE_ACTION_TOOL: McpToolDefinition = {
  name: "execute_action",
  description:
    "Called by widgentic widgets, not by agents: runs a widget's bound " +
    "http action (a stored, author-declared request) server-side and " +
    "returns the re-rendered widget. Requires a key with the 'execute' " +
    "scope. Agents should call render_widget instead.",
  inputSchema: {
    type: "object",
    properties: {
      widget: { type: "string", description: "The rendered widget's kind." },
      action: {
        type: "string",
        description: "Binding identifier: the element's dotted template path, or \"load\"."
      },
      args: {
        type: "object",
        description: "Arguments as resolved in the element's descriptor.",
        additionalProperties: true
      },
      payload: {
        type: "object",
        description: "The widget's current payload { kind, data, hints?, meta? }.",
        additionalProperties: true
      },
      at: {
        type: "string",
        description: "Inside a group: dotted path of the item payload within 'payload' (e.g. data.items.2)."
      },
      item: { type: "string", description: "Inside a group: the item's kind." }
    },
    required: ["widget", "action", "payload"],
    additionalProperties: false
  }
};
