import type { WidgetCatalog } from "../catalog/index.js";
import { renderToHtml } from "../catalog/index.js";
import type { WidgetContractError } from "../contract/index.js";
import type { McpToolResult } from "../mcp/index.js";
import { WIDGENTIC_MIME_TYPE, WIDGENTIC_URI } from "../mcp/index.js";

/** Same plain-object definition as the contract validator. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Undo client-side marshalling: some clients JSON-serialize the `data`
 * argument into a string — occasionally more than once (double encoding).
 * String layers are peeled (bounded) and the result is committed ONLY when
 * it reaches a structured object/array; otherwise the original string
 * passes through verbatim as legitimate literal data, never half-unwrapped.
 */
function coerceData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  let candidate: unknown = data;
  for (let depth = 0; depth < 3 && typeof candidate === "string"; depth++) {
    const trimmed = candidate.trim();
    const first = trimmed.charAt(0);
    if (first !== "{" && first !== "[" && first !== '"') break;
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return typeof candidate === "object" && candidate !== null ? candidate : data;
}

/** Structured, agent-correctable failure using the contract vocabulary. */
function errorResult(error: WidgetContractError): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(error) }]
  };
}

/**
 * `list_widgets`: the catalog's descriptors as JSON, so agents can discover
 * kinds, purposes, expected data shapes, and examples.
 */
export function handleListWidgets(catalog: WidgetCatalog): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(catalog.list(), null, 2) }]
  };
}

/**
 * `render_widget`: validate `{ widget, data, hints?, meta? }` against the
 * catalog and the contract, render, and return the HTML plus the widgentic
 * payload block. Total — any input shape produces a result, never a throw.
 */
export function handleRenderWidget(
  catalog: WidgetCatalog,
  input: unknown
): McpToolResult {
  if (!isPlainObject(input)) {
    return errorResult({
      code: "INVALID_TYPE",
      path: "",
      message: "Input must be an object with 'widget' and 'data'."
    });
  }
  const widget = input.widget;
  if (typeof widget !== "string" || widget.length === 0) {
    return errorResult({
      code: "MISSING_FIELD",
      path: "widget",
      message: "'widget' must be a non-empty widget kind id (see list_widgets)."
    });
  }
  if (!("data" in input) || input.data === undefined) {
    return errorResult({
      code: "MISSING_FIELD",
      path: "data",
      message: "'data' is required (see the kind's dataShape in list_widgets)."
    });
  }

  const payload: Record<string, unknown> = {
    kind: widget,
    data: coerceData(input.data)
  };
  if ("hints" in input && input.hints !== undefined) payload.hints = input.hints;
  if ("meta" in input && input.meta !== undefined) payload.meta = input.meta;

  // Contract validation (kind membership, hints/meta shape) + rendering.
  const rendered = catalog.render(payload);
  if (!rendered.ok) {
    // Translate payload vocabulary to tool-input vocabulary ('widget', not
    // 'kind') and make unknown-widget errors self-sufficient — recovery
    // should not require a second round trip to list_widgets.
    if (rendered.error.code === "UNKNOWN_KIND") {
      return errorResult({
        code: "UNKNOWN_KIND",
        path: "widget",
        message: `Unknown widget '${widget}'. Available widgets: ${catalog
          .kinds()
          .sort()
          .join(", ")}.`
      });
    }
    return errorResult(rendered.error);
  }

  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    return errorResult({
      code: "INVALID_TYPE",
      path: "data",
      message: "'data' must be JSON-serializable."
    });
  }

  return {
    content: [
      { type: "text", text: renderToHtml(rendered.node) },
      {
        type: "resource",
        resource: {
          uri: WIDGENTIC_URI,
          mimeType: WIDGENTIC_MIME_TYPE,
          text: json
        }
      }
    ]
  };
}
