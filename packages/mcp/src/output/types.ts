/**
 * Structural MCP shapes and widgentic convention constants.
 *
 * The interfaces are deliberately local and minimal, with index signatures —
 * any MCP SDK's real objects satisfy them, and objects emitted here satisfy
 * SDK parameter types. MCP integration is a convention, not a dependency.
 */

/** Mime type identifying a widgentic payload inside MCP content. */
export const WIDGENTIC_MIME_TYPE = "application/vnd.widgentic+json";

/** Default resource URI for emitted widget payloads. */
export const WIDGENTIC_URI = "ui://widgentic/widget";

/** Capability key under MCP `experimental` capabilities. */
export const WIDGENTIC_CAPABILITY = "widgentic";

/** Current convention version advertised by hosts. */
export const WIDGENTIC_VERSION = 1;

export interface McpTextContent {
  type: "text";
  text: string;
  [key: string]: unknown;
}

export interface McpResourceContent {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Any MCP content block; the union stays open for forward compatibility. */
export type McpContentBlock =
  | McpTextContent
  | McpResourceContent
  | { type: string; [key: string]: unknown };

/** An MCP-shaped tool result. */
export interface McpToolResult {
  content: McpContentBlock[];
  isError?: boolean;
  /** Presentation data for app templates; not added to model context. */
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

/** MCP capabilities object (client or server side). */
export interface McpCapabilities {
  experimental?: Record<string, unknown>;
  [key: string]: unknown;
}
