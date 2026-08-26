/**
 * Widgentic over stdio with YOUR OWN widgets compiled in — the template
 * for a custom deployment. Run with: npm run mcp
 *
 * The recipe, in full:
 *   1. author widgets in the designer and export them (Copy as
 *      TypeScript emits exactly the `widgets/` module shape),
 *   2. register them into a catalog,
 *   3. hand that catalog to the library's server assembly
 *      (`widgentic/mcp-server/sdk` — the MCP SDK packages are optional
 *      peer dependencies, installed by hosts like this one),
 *   4. connect whatever transport your host speaks.
 *
 * Everything imports public `widgentic/*` entries only: copy this folder,
 * swap the widgets, and you have your own deployment. The hosted server
 * (apps/mcp-server) is the same assembly fed from a per-principal store
 * instead of compiled-in modules.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWidgenticServer } from "widgentic/mcp-server/sdk";
import { createCatalog } from "widgentic/catalog";
import { findActionBinding, registerTemplate } from "widgentic/templates";
import { customWidgets } from "./widgets/index.js";

const catalog = createCatalog();
for (const widget of customWidgets) {
  registerTemplate(catalog, widget.kind, widget.template, widget.descriptor);
}

// Compiled-in widgets bind their actions INLINE (no store, no shared
// refs), so the action source is a walk over the same definitions. A
// stdio host is the operator's own machine: execution is allowed.
const byKind = new Map(customWidgets.map((widget) => [widget.kind, widget]));
const server = createWidgenticServer({
  catalog,
  actions: {
    bindingAt: (kind, id) => {
      const widget = byKind.get(kind);
      return widget === undefined ? undefined : findActionBinding(widget.template, id);
    },
    load: (kind) => byKind.get(kind)?.load,
    resolve: () => undefined
  },
  scopes: ["read", "execute"]
});
await server.connect(new StdioServerTransport());
console.error(
  "widgentic MCP server ready on stdio (tools: list_widgets, list_schemas, list_themes, list_theme_tokens, render_widget, get_authoring_guide, execute_action)"
);
