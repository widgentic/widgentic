/**
 * Widgentic MCP server construction: wires the dependency-free tool
 * definitions and handlers onto the official SDK, with the formal MCP Apps
 * declaration. Transport-agnostic — entries: main.ts (stdio), http.ts.
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  registerAppTool,
  registerAppResource,
  getUiCapability,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { buildAppTemplate } from "./app-template.js";
import { createCatalog } from "widgentic/catalog";
import { registerTemplate } from "widgentic/templates";
import {
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  LIST_THEME_TOKENS_TOOL,
  WIDGENTIC_UI_URI_PREFIX,
  WIDGENTIC_APP_TEMPLATE_URI,
  handleListWidgets,
  handleRenderWidget,
  handleListThemeTokens
} from "widgentic/mcp-server";

export function createWidgenticServer(): McpServer {
  const catalog = createCatalog();

  // Custom template widget: shows that registered kinds surface in
  // list_widgets and render through render_widget automatically.
  registerTemplate(
    catalog,
    "invoice",
    {
      tag: "div",
      attrs: { class: "wg-invoice" },
      children: [
        {
          when: "$meta.title",
          template: { tag: "h2", children: [{ bind: "$meta.title" }] }
        },
        { tag: "p", children: ["Customer: ", { bind: "customer" }] },
        {
          tag: "ul",
          children: [
            {
              each: "lines",
              template: {
                tag: "li",
                children: [
                  { bind: "item" },
                  " × ",
                  { bind: "qty" },
                  " — ",
                  { bind: "lineTotal" }
                ]
              },
              empty: "No line items."
            }
          ]
        },
        {
          when: "total",
          template: { tag: "p", children: ["Total: ", { bind: "total" }] }
        }
      ]
    },
    {
      description:
        "Invoice with customer, priced line items, and an optional total.",
      dataShape:
        "{ customer: string, lines: { item: string, qty: number, lineTotal: " +
        "string }[], total?: string }. Pre-format money as display strings " +
        "(e.g. '$119.96') — templates render values verbatim, with no " +
        "arithmetic; compute line totals and the total caller-side, on a " +
        "consistent basis (line totals should sum to the total, or include a " +
        "discount line item explaining the difference). meta.title becomes " +
        "the heading.",
      dataExample: {
        customer: "Ada Lovelace",
        lines: [{ item: "widgets", qty: 4, lineTotal: "$119.96" }],
        total: "$119.96"
      },
      styles: {
        ".wg-invoice": {
          background: "var(--wg-bg, #ffffff)",
          border: "1px solid var(--wg-border, #e2e8f0)",
          "border-radius": "var(--wg-radius, 6px)",
          "box-shadow": "var(--wg-shadow, 0 1px 3px rgba(0, 0, 0, 0.12))",
          padding: "calc(var(--wg-spacing, 8px) * 2)",
          "max-width": "28rem"
        },
        ".wg-invoice h2": {
          color: "var(--wg-accent, #2563eb)",
          "margin-top": "0"
        },
        ".wg-invoice li": {
          padding: "calc(var(--wg-spacing, 8px) / 2) 0",
          "border-bottom": "1px solid var(--wg-border, #e2e8f0)"
        }
      },
      dataSchema: {
        type: "object",
        required: ["customer", "lines"],
        properties: {
          customer: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              required: ["item", "qty", "lineTotal"],
              properties: {
                item: { type: "string" },
                qty: { type: "number" },
                lineTotal: { type: "string" }
              }
            }
          },
          total: { type: "string" }
        }
      }
    }
  );

  const server = new McpServer({ name: "widgentic", version: "0.1.0" });

  server.registerTool(
    LIST_WIDGETS_TOOL.name,
    { description: LIST_WIDGETS_TOOL.description },
    // Handler results use widgentic's structural MCP types; they are shaped
    // as CallToolResult content, asserted at this wiring boundary.
    () => handleListWidgets(catalog) as CallToolResult
  );

  server.registerTool(
    LIST_THEME_TOKENS_TOOL.name,
    { description: LIST_THEME_TOKENS_TOOL.description },
    () => handleListThemeTokens() as CallToolResult
  );

  // Formal MCP Apps declaration (spec 2026-01-26, via the official ext-apps
  // helpers): render_widget is linked to the app template through
  // _meta.ui.resourceUri; Apps hosts mount the template and push each tool
  // result (with structuredContent) into it. Non-Apps hosts see a normal tool.
  registerAppTool(
    server,
    RENDER_WIDGET_TOOL.name,
    {
      description: RENDER_WIDGET_TOOL.description,
      _meta: { ui: { resourceUri: WIDGENTIC_APP_TEMPLATE_URI } },
      // zod flavor of RENDER_WIDGET_TOOL.inputSchema (the SDK requires zod
      // shapes; the JSON Schema in definitions.ts is the source of truth).
      inputSchema: {
        widget: z.string().describe("Widget kind id, as returned by list_widgets."),
        // Typed union (mirrors RENDER_WIDGET_TOOL.inputSchema) so the wire
        // schema tells clients to send structured JSON, not a serialized string.
        data: z
          .union([
            z.array(z.unknown()),
            z.record(z.string(), z.unknown()),
            z.string(),
            z.number(),
            z.boolean(),
            z.null()
          ])
          .describe("Widget data matching the kind's dataShape."),
        hints: z.record(z.string(), z.unknown()).optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
        format: z.enum(["both", "html", "widget", "page", "app"]).optional(),
        theme: z.record(z.string(), z.string()).optional()
      }
    },
    (args) => handleRenderWidget(catalog, args) as CallToolResult
  );

  // The declared app template: Apps hosts fetch this once and mount it in a
  // sandboxed iframe; every render_widget result then streams into it via
  // ui/notifications/tool-result (structuredContent: { html, css, payload }).
  registerAppResource(
    server,
    "Widgentic App",
    WIDGENTIC_APP_TEMPLATE_URI,
    {
      description:
        "Widgentic app template — renders render_widget results inline."
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: buildAppTemplate() }
      ]
    })
  );

  // Per-kind preview pages (light theme, rendered from each descriptor's
  // dataExample) for hosts that browse ui://widgentic/page/{kind}.
  server.registerResource(
    "widget-page",
    new ResourceTemplate(`${WIDGENTIC_UI_URI_PREFIX}{kind}`, { list: undefined }),
    {
      title: "Widgentic widget page",
      description:
        "Self-contained styled preview page for a widget kind, rendered from " +
        "its descriptor's dataExample. Live renders arrive embedded in " +
        "render_widget results with format: 'app'.",
      mimeType: "text/html"
    },
    async (uri, variables) => {
      const kind = String(variables.kind ?? "");
      const example = catalog.describe(kind)?.dataExample;
      const result = handleRenderWidget(catalog, {
        widget: kind,
        data: example ?? null,
        format: "page"
      });
      const page = result.content.find((block) => block.type === "text");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/html",
            text:
              !result.isError && typeof page?.text === "string"
                ? page.text
                : `<!doctype html><body>Unknown widget kind '${kind}'.</body>`
          }
        ]
      };
    }
  );

  server.server.oninitialized = () => {
    const capabilities = server.server.getClientCapabilities();
    // Normalized: getUiCapability only reads `extensions`, and the SDK type's
    // optional field clashes with exactOptionalPropertyTypes otherwise.
    const ui = getUiCapability({ extensions: capabilities?.extensions ?? {} });
    console.error(
      ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE)
        ? "MCP Apps: host advertises UI support — render_widget mounts in the declared template."
        : "MCP Apps: host lacks the UI capability — text/page/widget outputs remain the fallback."
    );
  };

  return server;
}
