import { parseJson } from "@widgentic/core";
import type { AdapterError } from "@widgentic/core";
import { validateWidgetPayload } from "@widgentic/core";
import type { WidgetContractError } from "@widgentic/core";
import type { WidgetPayload } from "@widgentic/core";
import { WIDGENTIC_MIME_TYPE } from "./types.js";

export interface ExtractOptions {
  /**
   * When provided, payloads whose `kind` is not in the set fail with
   * `UNKNOWN_KIND` (pass a catalog's `kinds()` here).
   */
  knownKinds?: ReadonlySet<string>;
}

/**
 * Three-state extraction result. `{ found: false }` means the result carries
 * no widgentic content and the host should leave it alone — distinct from a
 * present-but-malformed widgentic block, which is a structured error.
 */
export type WidgetExtraction =
  | { found: false }
  | { found: true; ok: true; payload: WidgetPayload }
  | { found: true; ok: false; error: AdapterError | WidgetContractError };

/** Same plain-object definition as the contract validator. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First content block carrying the widgentic mime type, if any. */
function widgenticBlock(result: unknown): { text: unknown } | undefined {
  if (!isPlainObject(result) || !Array.isArray(result.content)) {
    return undefined;
  }
  for (const block of result.content) {
    if (
      isPlainObject(block) &&
      block.type === "resource" &&
      isPlainObject(block.resource) &&
      block.resource.mimeType === WIDGENTIC_MIME_TYPE
    ) {
      return { text: block.resource.text };
    }
  }
  return undefined;
}

/** Whether a tool result carries a widgentic block (regardless of validity). */
export function isWidgetResult(result: unknown): boolean {
  return widgenticBlock(result) !== undefined;
}

/**
 * Read a widget payload out of an MCP tool result. Never throws: results
 * without widgentic content (including garbage input) are `{ found: false }`;
 * malformed blocks surface the adapter/contract error.
 */
export function extractWidgetPayload(
  result: unknown,
  options: ExtractOptions = {}
): WidgetExtraction {
  const block = widgenticBlock(result);
  if (block === undefined) return { found: false };

  const parsed = parseJson(block.text);
  if (!parsed.ok) return { found: true, ok: false, error: parsed.error };

  const validated = validateWidgetPayload(
    parsed.value,
    options.knownKinds ? { knownKinds: options.knownKinds } : {}
  );
  if (!validated.ok) return { found: true, ok: false, error: validated.error };

  return { found: true, ok: true, payload: validated.payload };
}
