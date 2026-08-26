/**
 * The one `isPlainObject`. Every entry imports it relatively, so the
 * zero-dependency entries stay zero-dependency and the source-scan tests
 * keep passing.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
