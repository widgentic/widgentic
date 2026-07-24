export {
  WIDGENTIC_MIME_TYPE,
  WIDGENTIC_URI,
  WIDGENTIC_CAPABILITY,
  WIDGENTIC_VERSION
} from "./types.js";
export type {
  McpTextContent,
  McpResourceContent,
  McpContentBlock,
  McpToolResult,
  McpCapabilities
} from "./types.js";
export { toWidgetResult, toTextResult } from "./emit.js";
export type { ToWidgetResultOptions } from "./emit.js";
export { extractWidgetPayload, isWidgetResult } from "./extract.js";
export type { ExtractOptions, WidgetExtraction } from "./extract.js";
export { declareWidgetCapability, hostSupportsWidgets } from "./capability.js";
