import type { McpCapabilities } from "./types.js";
import { WIDGENTIC_CAPABILITY, WIDGENTIC_VERSION } from "./types.js";

/** Same plain-object definition as the contract validator. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Host side: return a new capabilities object advertising widgentic support
 * under MCP `experimental`. Existing keys are preserved; the input is not
 * mutated.
 */
export function declareWidgetCapability(
  capabilities: McpCapabilities = {}
): McpCapabilities {
  const experimental = isPlainObject(capabilities.experimental)
    ? capabilities.experimental
    : {};
  return {
    ...capabilities,
    experimental: {
      ...experimental,
      [WIDGENTIC_CAPABILITY]: { version: WIDGENTIC_VERSION }
    }
  };
}

/**
 * Tool side: whether the host advertised widgentic support. Total — any
 * malformed capabilities object means "no support", never an exception.
 */
export function hostSupportsWidgets(capabilities: unknown): boolean {
  if (!isPlainObject(capabilities)) return false;
  const experimental = capabilities.experimental;
  if (!isPlainObject(experimental)) return false;
  return Boolean(experimental[WIDGENTIC_CAPABILITY]);
}
