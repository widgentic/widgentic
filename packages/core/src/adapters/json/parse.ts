import type { AdapterError } from "../errors.js";

export type ParseJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: AdapterError };

/**
 * Parse JSON text, or pass through an already-parsed value.
 *
 * - String input is fed to `JSON.parse` inside a try/catch.
 * - Non-string input (objects, arrays, primitives) is returned unchanged.
 */
export function parseJson(input: unknown): ParseJsonResult {
  if (typeof input !== "string") {
    return { ok: true, value: input };
  }

  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const position = extractPosition(message);
    return {
      ok: false,
      error: position === undefined
        ? { code: "INVALID_JSON", message }
        : { code: "INVALID_JSON", message, position }
    };
  }
}

function extractPosition(message: string): number | undefined {
  // Node 22+ : "Expected ... at position 1 (line 1 column 2)"
  // Older runtimes / engines may use "at position N" or "line X column Y".
  const posMatch = /position[\s:]+(\d+)/i.exec(message);
  if (posMatch?.[1] !== undefined) {
    const n = Number.parseInt(posMatch[1], 10);
    if (Number.isFinite(n)) return n;
  }
  // Fallback: line/column without an explicit position offset is not
  // convertible without the source, so we omit `position` rather than guess.
  return undefined;
}
