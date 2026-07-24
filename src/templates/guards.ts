/**
 * Safety constants shared by validation (strict) and interpretation
 * (lenient defense in depth). Both layers MUST consult these — keeping them
 * in one module is what prevents the two from drifting.
 */

/** Event-handler attributes are code execution in a browser. */
export const FORBIDDEN_ATTR = /^on/i;

/** Attributes whose values are URLs and can smuggle script schemes. */
export const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href"
]);

/** Schemes allowed in URL-bearing attributes (plus relative references). */
export const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** Maximum template nesting depth accepted by validation. */
export const MAX_TEMPLATE_DEPTH = 64;

/**
 * True when a URL value is safe: an allowed scheme or a relative reference.
 * Control characters and whitespace are stripped first, mirroring how
 * browsers parse URLs (defeats `java\nscript:` obfuscation).
 */
export function isSafeUrl(value: string): boolean {
  const cleaned = value.replace(/[\u0000-\u0020]+/g, "");
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (match === null) return true;
  const scheme = match[1];
  return scheme !== undefined && ALLOWED_SCHEMES.has(scheme.toLowerCase());
}
