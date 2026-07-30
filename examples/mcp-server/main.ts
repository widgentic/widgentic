/**
 * Stdio entry for the Widgentic MCP server. Run with: npm run mcp
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWidgenticServer } from "./server.js";

const server = createWidgenticServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("widgentic MCP server ready on stdio (tools: list_widgets, list_theme_tokens, render_widget)");
