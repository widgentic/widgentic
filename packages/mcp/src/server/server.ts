/**
 * Widgentic MCP server assembly: wires the dependency-free tool
 * definitions and handlers onto the official SDK, with the formal MCP
 * Apps declaration. Transport-agnostic — hosts connect it to stdio,
 * Streamable HTTP, or in-memory pipes.
 *
 * This module ships from its own entry (`@widgentic/mcp/sdk`); the
 * MCP SDK packages are optional peer dependencies installed only by
 * hosts that import it. The base `@widgentic/mcp` entry stays
 * SDK-free.
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
import { createCatalog } from "@widgentic/core";
import type { WidgetCatalog } from "@widgentic/core";
import {
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  LIST_THEME_TOKENS_TOOL,
  LIST_THEMES_TOOL,
  LIST_SCHEMAS_TOOL,
  GET_AUTHORING_GUIDE_TOOL,
  EXECUTE_ACTION_TOOL,
  WIDGENTIC_UI_URI_PREFIX,
  WIDGENTIC_APP_TEMPLATE_URI
} from "./definitions.js";
import {
  handleListWidgets,
  handleRenderWidget,
  handleListThemeTokens,
  handleListThemes,
  handleListSchemas
} from "./handlers.js";
import type { RenderActionOptions, StoredSchemaEntry } from "./handlers.js";
import { handleExecuteAction } from "./actions.js";
import type { ActionSourceLike } from "./actions.js";
import type { GuardedFetchDeps } from "./guarded-fetch.js";
import { inlineRenderResultImages } from "./inline-images.js";
import { buildAppTemplate } from "./app-template.js";
import { handleGetAuthoringGuide } from "./guide.js";
import { createThemeRegistry } from "@widgentic/core";
import type { ThemeRegistry } from "@widgentic/core";

export interface WidgenticServerOptions {
  /**
   * The caller's composed catalog and themes. The transport edge reads the
   * API key, resolves the principal, and composes — so the trust decision
   * lives where the key is read, not inside the server. Omitted: exactly
   * the built-in kinds and themes.
   */
  catalog?: WidgetCatalog;
  themes?: ThemeRegistry;
  /**
   * Lazy source for the principal's saved shared schemas — read only when
   * `list_schemas` is CALLED, so renders never pay for it. Omitted: the
   * tool serves an empty list (anonymous callers, storeless deployments).
   */
  schemas?: () => Promise<StoredSchemaEntry[]>;
  /**
   * Hostnames the OPERATOR trusts the app frame to load assets from:
   * declared as `_meta.ui.resourceDomains` on the app resource, and image
   * sources on these hosts skip server-side inlining. Deployment
   * configuration only — stored widgets and render inputs can never
   * extend it. Empty/absent keeps the inline-everything default.
   */
  resourceDomains?: string[];
  /**
   * Composition's action source for the caller's catalog (bindings by
   * template path, `load` per kind, shared definitions). Omitted: no widget
   * binds anything and `execute_action` answers UNKNOWN_ACTION.
   */
  actions?: ActionSourceLike;
  /** The caller's scopes (from the resolved key). `execute` gates actions. */
  scopes?: readonly string[];
  /** Execution-time secret resolution for the caller's principal. */
  secrets?: (name: string) => Promise<string | undefined>;
  /** Per-principal rate-limit gate for `execute_action` (`false` = limited). */
  rateLimit?: () => boolean;
  /** Injectable transport for tests. */
  fetchDeps?: GuardedFetchDeps;
}

export function createWidgenticServer(
  options: WidgenticServerOptions = {}
): McpServer {
  // The library assumes nothing: no options means exactly the built-in
  // kinds and themes. Compiled-in extras are the HOST's explicit choice,
  // passed as a composed catalog (see examples/mcp-server for the shape).
  const catalog = options.catalog ?? createCatalog();
  // Named themes: agents can pass `theme: "dark"` instead of a token map.
  const themes = options.themes ?? createThemeRegistry();
  // Model-context slimming signal: session-negotiated UI capability wins in
  // either direction; the env assumption (WIDGENTIC_ASSUME_UI, read per
  // construction) covers un-negotiated instances — on stateless HTTP the
  // tools/call POST builds a fresh server that never saw initialize.
  let slim = ["1", "true"].includes(
    (process.env.WIDGENTIC_ASSUME_UI ?? "").toLowerCase()
  );
  // Read per construction, exactly like WIDGENTIC_ASSUME_UI: every env
  // knob in the assembly behaves the same way, and the disable path is
  // testable in-process.
  const inlineImages = !["0", "false"].includes(
    (process.env.WIDGENTIC_INLINE_IMAGES ?? "").toLowerCase()
  );
  const resourceDomains = (options.resourceDomains ?? [])
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
  const skipHosts = new Set(resourceDomains);
  const executeAllowed = (options.scopes ?? []).includes("execute");
  const renderActions: RenderActionOptions | undefined =
    options.actions === undefined
      ? undefined
      : {
          load: options.actions.load,
          resolve: options.actions.resolve,
          executeAllowed
        };

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

  server.registerTool(
    LIST_THEMES_TOOL.name,
    { description: LIST_THEMES_TOOL.description },
    () => handleListThemes(themes) as CallToolResult
  );

  server.registerTool(
    LIST_SCHEMAS_TOOL.name,
    { description: LIST_SCHEMAS_TOOL.description },
    async () => (await handleListSchemas(options.schemas)) as CallToolResult
  );

  server.registerTool(
    GET_AUTHORING_GUIDE_TOOL.name,
    { description: GET_AUTHORING_GUIDE_TOOL.description },
    () => handleGetAuthoringGuide() as CallToolResult
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
      // shapes). Field DESCRIPTIONS come from definitions.ts — the wire
      // schema is what agents actually read, and an undescribed field is
      // steering nobody (observed live: agents inlined token maps for
      // saved themes because the wire never carried the name preference).
      inputSchema: (() => {
        const docs = RENDER_WIDGET_TOOL.inputSchema.properties as Record<
          string,
          { description?: string }
        >;
        const doc = (field: string) => docs[field]?.description ?? "";
        return {
          widget: z.string().describe(doc("widget")),
          // Typed union (mirrors RENDER_WIDGET_TOOL.inputSchema) so the wire
          // schema tells clients to send structured JSON, not a string.
          data: z
            .union([
              z.array(z.unknown()),
              z.record(z.string(), z.unknown()),
              z.string(),
              z.number(),
              z.boolean(),
              z.null()
            ])
            .describe(doc("data")),
          hints: z.record(z.string(), z.unknown()).optional().describe(doc("hints")),
          meta: z.record(z.string(), z.unknown()).optional().describe(doc("meta")),
          format: z
            .enum(["both", "html", "widget", "page", "app"])
            .optional()
            .describe(doc("format")),
          theme: z
            .union([z.string(), z.record(z.string(), z.string())])
            .optional()
            .describe(doc("theme"))
        };
      })()
    },
    async (args) => {
      const result = handleRenderWidget(catalog, args, {
        slim,
        themes,
        actions: renderActions
      }) as CallToolResult;
      // Apps-host sandboxes block external img-src but allow data:, so the
      // iframe-facing surfaces get image bytes inlined as data URIs
      // (SSRF-guarded; see src/mcp-server/inline-images.ts). Disable with
      // WIDGENTIC_INLINE_IMAGES=0.
      if (inlineImages) await inlineRenderResultImages(result, { skipHosts });
      return result;
    }
  );

  // The widget's own tool: app-only visibility hides it from the model on
  // Apps hosts (non-Apps clients still list it — the description says what
  // it is). The binding is resolved from the caller's composed catalog;
  // the request never supplies a definition.
  registerAppTool(
    server,
    EXECUTE_ACTION_TOOL.name,
    {
      description: EXECUTE_ACTION_TOOL.description,
      _meta: {
        ui: { resourceUri: WIDGENTIC_APP_TEMPLATE_URI, visibility: ["app"] }
      },
      // Descriptions come from definitions.ts, exactly as render_widget's do,
      // so the wire schema cannot drift from the documented one.
      inputSchema: (() => {
        const docs = EXECUTE_ACTION_TOOL.inputSchema.properties as Record<string, { description?: string }>;
        const doc = (field: string) => docs[field]?.description ?? "";
        return {
          widget: z.string().describe(doc("widget")),
          action: z.string().describe(doc("action")),
          args: z.record(z.string(), z.unknown()).optional().describe(doc("args")),
          payload: z.record(z.string(), z.unknown()).describe(doc("payload")),
          at: z.string().optional().describe(doc("at")),
          item: z.string().optional().describe(doc("item"))
        };
      })()
    },
    async (args) => {
      const result = (await handleExecuteAction(catalog, args, {
        actions: options.actions,
        scopes: options.scopes,
        secrets: options.secrets,
        rateLimit: options.rateLimit,
        themes,
        fetchDeps: options.fetchDeps
      })) as CallToolResult;
      if (inlineImages) await inlineRenderResultImages(result, { skipHosts });
      return result;
    }
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
        "Widgentic app template — renders render_widget results inline.",
      // Operator-declared CSP domains: hosts the frame may load assets
      // from directly (images on them skip inlining). Absent when empty.
      ...(resourceDomains.length > 0
        ? { _meta: { ui: { csp: { resourceDomains } } } }
        : {})
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
    // Negotiation is authoritative for this session, overriding ASSUME_UI
    // in both directions.
    slim = ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false;
    console.error(
      slim
        ? "MCP Apps: host advertises UI support — render_widget mounts in the declared template (slim model output)."
        : "MCP Apps: host lacks the UI capability — text/page/widget outputs remain the fallback."
    );
  };

  return server;
}
