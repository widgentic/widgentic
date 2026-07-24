import type { WidgetPayload } from "../contract/types.js";
import type { McpToolResult } from "./types.js";
import { WIDGENTIC_MIME_TYPE, WIDGENTIC_URI } from "./types.js";

export interface ToWidgetResultOptions {
  /** Resource URI override (default {@link WIDGENTIC_URI}). */
  uri?: string;
  /** Fallback text override (default: the `toTextResult` representation). */
  text?: string;
}

function stringifyPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Plain-text representation: `meta.title` line + pretty JSON of `data`. */
function fallbackText(payload: WidgetPayload): string {
  const title = payload.meta?.title;
  const body = stringifyPretty(payload.data);
  return typeof title === "string" && title.length > 0
    ? `${title}\n${body}`
    : body;
}

/**
 * Text-only tool result for hosts that did not advertise widgentic support.
 * Deliberately the plain-text sibling of the catalog's `custom` widget:
 * predictable, inspectable, never throws.
 */
export function toTextResult(payload: WidgetPayload): McpToolResult {
  return { content: [{ type: "text", text: fallbackText(payload) }] };
}

/**
 * Tool result carrying the payload as a widgentic resource block, preceded
 * by a text fallback block so unaware hosts still show something readable.
 * A payload whose JSON serialization fails (circular `data`) degrades to
 * the text-only shape.
 */
export function toWidgetResult(
  payload: WidgetPayload,
  options: ToWidgetResultOptions = {}
): McpToolResult {
  const text = options.text ?? fallbackText(payload);
  let json: string | undefined;
  try {
    json = JSON.stringify(payload);
  } catch {
    json = undefined;
  }
  if (json === undefined) {
    return { content: [{ type: "text", text }] };
  }
  return {
    content: [
      { type: "text", text },
      {
        type: "resource",
        resource: {
          uri: options.uri ?? WIDGENTIC_URI,
          mimeType: WIDGENTIC_MIME_TYPE,
          text: json
        }
      }
    ]
  };
}
