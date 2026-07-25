/**
 * The runnable Widgentic MCP server: wires the dependency-free tool
 * definitions and handlers onto the official SDK over stdio.
 *
 * Run with: npm run mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createCatalog } from "widgentic/catalog";
import { registerTemplate } from "widgentic/templates";
import {
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  handleListWidgets,
  handleRenderWidget
} from "widgentic/mcp-server";

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
      { tag: "h2", children: [{ bind: "$meta.title" }] },
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
  RENDER_WIDGET_TOOL.name,
  {
    description: RENDER_WIDGET_TOOL.description,
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
      meta: z.record(z.string(), z.unknown()).optional()
    }
  },
  (args) => handleRenderWidget(catalog, args) as CallToolResult
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("widgentic MCP server ready on stdio (tools: list_widgets, render_widget)");
