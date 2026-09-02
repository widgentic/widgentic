/**
 * @widgentic/webmcp (beta) — the mounted widgentic designers as WebMCP tools.
 * `exposeDesigners(sources)` builds tool descriptors over the designer
 * handles a host supplies (as getters, resolved per call) and registers them
 * on the page's model context; in a browser without one it is a reported
 * no-op. Agents read and edit the working copies; the person saves — no tool
 * here persists anything. Browser-safe, no network I/O.
 */
export { designerTools, DEFAULT_PREFIX } from "./tools.js";
export { exposeDesigners, registerTools, resolveModelContext } from "./register.js";
export { okResult, failResult } from "./result.js";
export type { FailureCode } from "./result.js";
export type {
  DesignerSources,
  ExposeOptions,
  ExposeResult,
  ModelContextLike,
  RegisterFailure,
  RegisterOptions,
  RegisterResult,
  ToolsOptions,
  WebMcpExecuteOptions,
  WebMcpTextContent,
  WebMcpTool,
  WebMcpToolAnnotations,
  WebMcpToolResult
} from "./types.js";
