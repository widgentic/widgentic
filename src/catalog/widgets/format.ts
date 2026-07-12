/** Shared helpers for the built-in renderers. */

/** Same plain-object definition as the contract validator. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Render any value as display text. Strings pass through; primitives
 * stringify; structured values fall back to compact JSON. Never throws.
 */
export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
