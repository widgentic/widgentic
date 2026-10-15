/**
 * Widgentic MCP server assembly: wires the dependency-free tool
 * definitions and handlers onto the official MCP TypeScript SDK 2.x, with
 * the formal MCP Apps declaration. Transport-agnostic: hosts serve it
 * through the SDK's entries (`createMcpHandler` over HTTP, `serveStdio`
 * over stdio), which speak both the 2025-era revisions and 2026-07-28, or
 * connect it to a transport directly (in-memory pipes, 2025 era). Every
 * tool is registered with its exported definition's input schema, and its
 * handler validates the arguments.
 *
 * This module ships from its own entry (`@widgentic/mcp/sdk`); the
 * MCP SDK packages are optional peer dependencies installed only by
 * hosts that import it. The base `@widgentic/mcp` entry stays
 * SDK-free.
 */
import { CLIENT_CAPABILITIES_META_KEY, McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import type {
  CallToolResult,
  ClientCapabilities,
  ServerContext,
  StandardSchemaWithJSON
} from "@modelcontextprotocol/server";
import {
  registerAppTool,
  registerAppResource,
  getUiCapability,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { createCatalog, isPlainObject, parseResourceDomains, parseResources, resourceCovered } from "@widgentic/core";
import type { StoredAction, WidgetCatalog } from "@widgentic/core";
import {
  LIST_WIDGETS_TOOL,
  RENDER_WIDGET_TOOL,
  LIST_THEME_TOKENS_TOOL,
  LIST_THEMES_TOOL,
  LIST_SCHEMAS_TOOL,
  LIST_ACTIONS_TOOL,
  GET_AUTHORING_GUIDE_TOOL,
  EXECUTE_ACTION_TOOL,
  PREVIEW_WIDGET_TOOL,
  APP_ONLY_VISIBILITY,
  WIDGENTIC_APP_TEMPLATE_URI,
  APP_TEMPLATE_RESOURCE,
  WIDGET_PAGE_RESOURCE
} from "./definitions.js";
import type { McpToolDefinition } from "./definitions.js";
import {
  handleListWidgets,
  handleRenderWidget,
  handleListThemeTokens,
  handleListThemes,
  handleListSchemas,
  handleListActions,
  renderWidgetPage,
  handlePreviewWidget
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
   * Lazy source for the principal's saved shared actions, yielding the
   * STORED entries — the handler reduces each to its contract, so no host
   * can leak a URL or a header by wiring this wrong. Read only when
   * `list_actions` is CALLED. Omitted: the tool serves an empty list.
   * Distinct from `actions` below, which resolves BINDINGS for execution.
   */
  sharedActions?: () => Promise<StoredAction[]>;
  /**
   * Domains the app frame may load assets from directly: the operator's
   * configuration and the caller's `resourceDomains` setting, which the
   * transport edge unions. Read by the core resource-domain rule — refused
   * entries are dropped — and declared as canonical `https://` origins in
   * `_meta.ui.csp.resourceDomains` on the app resource. Image sources on
   * them are inlined only with the room undeclared sources leave; one left
   * external keeps its URL, which a host honoring the declaration loads.
   * Stored widgets and render inputs can never extend it. Empty/absent
   * declares nothing.
   */
  resourceDomains?: string[];
  /**
   * The caller's stylesheets (the store's `resources` shape, typically from
   * `composeResources`), linked by every frame and page document their
   * renders produce. Read by the core resource rule; an entry it refuses,
   * or whose host the declared `resourceDomains` do not cover, is dropped —
   * the frame policy would block it anyway. Absent/empty links nothing and
   * leaves every output as it was.
   */
  resources?: readonly unknown[];
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
  /** Per-principal rate-limit gate for `preview_widget` (`false` = limited). */
  previewRateLimit?: () => boolean;
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
  // The slimming fallback for calls that reveal no client capabilities:
  // stateless 2025-era HTTP builds a fresh instance per request that never
  // saw initialize. Read per construction, like every env knob here.
  const assumeUi = ["1", "true"].includes(
    (process.env.WIDGENTIC_ASSUME_UI ?? "").toLowerCase()
  );
  // Read per construction, exactly like WIDGENTIC_ASSUME_UI: every env
  // knob in the assembly behaves the same way, and the disable path is
  // testable in-process.
  const inlineImages = !["0", "false"].includes(
    (process.env.WIDGENTIC_INLINE_IMAGES ?? "").toLowerCase()
  );
  // One rule for every door: refused entries are neither declared nor
  // ranked as declared, and the rest are declared in canonical form.
  const declaredDomains = parseResourceDomains(options.resourceDomains ?? []).domains;
  const resourceDomains = declaredDomains.map((domain) => domain.origin);
  const resources = parseResources(options.resources ?? []).resources.filter((resource) =>
    resourceCovered(resource.href, resourceDomains)
  );
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

  // Slim exactly when the caller's client advertises the Apps UI with the app
  // MIME type, in either direction. A 2025-era session negotiated its
  // capabilities at initialize; a 2026-07-28 request never initializes and
  // carries them in its own _meta envelope. A call revealing neither follows
  // WIDGENTIC_ASSUME_UI.
  const slimFor = (ctx: ServerContext): boolean => {
    const capabilities = server.server.getClientCapabilities() ?? requestCapabilities(ctx);
    if (capabilities === undefined) return assumeUi;
    return getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false;
  };

  server.registerTool(
    LIST_WIDGETS_TOOL.name,
    toolConfig(LIST_WIDGETS_TOOL),
    // Handler results use widgentic's structural MCP types; they are shaped
    // as CallToolResult content, asserted at this wiring boundary.
    () => handleListWidgets(catalog) as CallToolResult
  );

  server.registerTool(
    LIST_THEME_TOKENS_TOOL.name,
    toolConfig(LIST_THEME_TOKENS_TOOL),
    () => handleListThemeTokens() as CallToolResult
  );

  server.registerTool(
    LIST_THEMES_TOOL.name,
    toolConfig(LIST_THEMES_TOOL),
    () => handleListThemes(themes, resources) as CallToolResult
  );

  server.registerTool(
    LIST_SCHEMAS_TOOL.name,
    toolConfig(LIST_SCHEMAS_TOOL),
    async () => (await handleListSchemas(options.schemas)) as CallToolResult
  );

  server.registerTool(
    LIST_ACTIONS_TOOL.name,
    toolConfig(LIST_ACTIONS_TOOL),
    async () => (await handleListActions(options.sharedActions)) as CallToolResult
  );

  server.registerTool(
    GET_AUTHORING_GUIDE_TOOL.name,
    toolConfig(GET_AUTHORING_GUIDE_TOOL),
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
      ...toolConfig(RENDER_WIDGET_TOOL),
      _meta: { ui: { resourceUri: WIDGENTIC_APP_TEMPLATE_URI } }
    },
    async (args, ctx) => {
      const result = handleRenderWidget(catalog, args, {
        slim: slimFor(ctx),
        themes,
        resources,
        actions: renderActions
      }) as CallToolResult;
      // Apps-host sandboxes block external img-src but allow data:, so the
      // iframe-facing surfaces get image bytes inlined as data URIs
      // (SSRF-guarded; see src/mcp-server/inline-images.ts). Disable with
      // WIDGENTIC_INLINE_IMAGES=0.
      if (inlineImages) await inlineRenderResultImages(result, { declaredDomains });
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
      ...toolConfig(EXECUTE_ACTION_TOOL),
      _meta: {
        ui: { resourceUri: WIDGENTIC_APP_TEMPLATE_URI, visibility: [...APP_ONLY_VISIBILITY] }
      }
    },
    async (args) => {
      const result = (await handleExecuteAction(catalog, args, {
        actions: options.actions,
        scopes: options.scopes,
        secrets: options.secrets,
        rateLimit: options.rateLimit,
        themes,
        resources,
        fetchDeps: options.fetchDeps
      })) as CallToolResult;
      if (inlineImages) await inlineRenderResultImages(result, { declaredDomains });
      return result;
    }
  );

  // The template's own preview tool: while a render's input streams, the
  // frame asks for kinds it cannot build itself. App-only like
  // execute_action; renders the partial payload and never fetches.
  registerAppTool(
    server,
    PREVIEW_WIDGET_TOOL.name,
    {
      ...toolConfig(PREVIEW_WIDGET_TOOL),
      _meta: {
        ui: { resourceUri: WIDGENTIC_APP_TEMPLATE_URI, visibility: [...APP_ONLY_VISIBILITY] }
      }
    },
    (args) =>
      handlePreviewWidget(catalog, args, {
        themes,
        resources,
        rateLimit: options.previewRateLimit
      }) as CallToolResult
  );

  // The declared app template: Apps hosts fetch this once and mount it in a
  // sandboxed iframe; every render_widget result then streams into it via
  // ui/notifications/tool-result (structuredContent: { html, css, payload }).
  // Its `_meta.ui` rides on the declaration and on the read content alike:
  // the border preference, and the declared CSP domains — origins the frame
  // may load assets from directly — absent when none are declared.
  const appUi = {
    prefersBorder: APP_TEMPLATE_RESOURCE.prefersBorder,
    ...(resourceDomains.length > 0 ? { csp: { resourceDomains } } : {})
  };
  registerAppResource(
    server,
    APP_TEMPLATE_RESOURCE.name,
    APP_TEMPLATE_RESOURCE.uri,
    { description: APP_TEMPLATE_RESOURCE.description, _meta: { ui: appUi } },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: buildAppTemplate(), _meta: { ui: appUi } }
      ]
    })
  );

  // Per-kind preview pages (light theme, rendered from each descriptor's
  // dataExample) for hosts that browse ui://widgentic/page/{kind}.
  server.registerResource(
    WIDGET_PAGE_RESOURCE.name,
    new ResourceTemplate(WIDGET_PAGE_RESOURCE.uriTemplate, { list: undefined }),
    {
      title: WIDGET_PAGE_RESOURCE.title,
      description: WIDGET_PAGE_RESOURCE.description,
      mimeType: WIDGET_PAGE_RESOURCE.mimeType
    },
    async (uri, variables) => {
      const kind = String(variables.kind ?? "");
      return {
        contents: [{ uri: uri.href, mimeType: WIDGET_PAGE_RESOURCE.mimeType, text: renderWidgetPage(catalog, kind, themes, resources) }]
      };
    }
  );

  // 2025-era sessions negotiate once: tell the operator what this one gets.
  // Stateless HTTP hands the initialized notification to a fresh instance
  // that never saw initialize, so there is nothing true to report there.
  server.server.oninitialized = () => {
    const capabilities = server.server.getClientCapabilities();
    if (capabilities === undefined) return;
    const ui = getUiCapability(capabilities);
    console.error(
      ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false
        ? "MCP Apps: host advertises UI support — render_widget mounts in the declared template (slim model output)."
        : "MCP Apps: host lacks the UI capability — text/page/widget outputs remain the fallback."
    );
  };

  return server;
}

/**
 * The client capabilities a 2026-07-28 request carries in its `_meta`
 * envelope. The SDK lifts the reserved keys into `ctx.mcpReq.envelope`, but
 * its published declarations type that envelope as an empty object, so the
 * key is read through a plain-object narrowing.
 */
const requestCapabilities = (ctx: ServerContext): ClientCapabilities | undefined => {
  const envelope: unknown = ctx.mcpReq.envelope;
  if (!isPlainObject(envelope)) return undefined;
  const capabilities = envelope[CLIENT_CAPABILITIES_META_KEY];
  return isPlainObject(capabilities) ? capabilities : undefined;
};

/**
 * A tool's exported `inputSchema` as the Standard Schema the SDK registers:
 * advertised in `tools/list` exactly as exported (the schemas the `./host`
 * bundle serves), and validating nothing. The handlers validate every
 * argument themselves, with structured codes in the tool's own vocabulary,
 * so malformed calls get the same answer from every host.
 */
const fromDefinition = (tool: McpToolDefinition): StandardSchemaWithJSON => ({
  "~standard": {
    version: 1,
    vendor: "widgentic",
    jsonSchema: { input: () => tool.inputSchema, output: () => tool.inputSchema },
    validate: (value) => ({ value })
  }
});

/** A tool's registration config, from its exported definition: description, schema and annotations. */
const toolConfig = (tool: McpToolDefinition) => ({
  description: tool.description,
  inputSchema: fromDefinition(tool),
  ...(tool.annotations === undefined ? {} : { annotations: tool.annotations })
});
