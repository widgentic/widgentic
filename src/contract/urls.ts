/**
 * URL safety primitives shared by the template DSL and the catalog's image
 * rendering. They live in the contract layer — the zero-dependency base
 * both consumers sit on — so the strict and lenient layers can never drift
 * (`templates` imports from `catalog`, so `catalog` cannot import back).
 */

/** Schemes allowed in URL-bearing attributes (plus relative references). */
export const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * Strip control characters and whitespace before scheme inspection,
 * mirroring how browsers parse URLs (defeats `java\nscript:` obfuscation).
 */
function cleanUrl(value: string): string {
  return value.replace(/[\u0000-\u0020]+/g, "");
}

/**
 * True when a URL value is safe for a URL-bearing attribute: an allowed
 * scheme or a relative reference.
 */
export function isSafeUrl(value: string): boolean {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleanUrl(value));
  if (match === null) return true;
  const scheme = match[1];
  return scheme !== undefined && ALLOWED_SCHEMES.has(scheme.toLowerCase());
}

/**
 * True only for an EXPLICITLY-schemed allowed URL — unlike {@link isSafeUrl},
 * relative references do not qualify: as anchor targets they are dead
 * clicks inside the app frame and junk navigation on served pages.
 */
export function isLinkableUrl(value: string): boolean {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleanUrl(value));
  if (match === null) return false;
  const scheme = match[1];
  return scheme !== undefined && ALLOWED_SCHEMES.has(scheme.toLowerCase());
}

/** `data:image/<subtype>;base64,<payload>` — the only `data:` form images accept. */
const DATA_IMAGE = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]*$/i;

/** Absolute http(s) — image sources are fetched, so relative refs are useless. */
const HTTP_URL = /^https?:\/\//i;

/**
 * True when a value is acceptable as an image source: an absolute http(s)
 * URL or a base64 `data:image/*` URI. Broader `data:` stays banned here and
 * everywhere else — data-URI navigation is an XSS vector; data-URI images
 * are not.
 */
export function isSafeImageSrc(value: string): boolean {
  const cleaned = cleanUrl(value);
  return DATA_IMAGE.test(cleaned) || HTTP_URL.test(cleaned);
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * Auto-detection predicate for the built-in renderers: a safe image source
 * that self-identifies as an image — `data:image/*`, or an http(s) URL
 * whose pathname ends in an image extension (query strings tolerated).
 * Extensionless image URLs need a `hints.images` entry instead.
 */
export function looksLikeImageUrl(value: string): boolean {
  const cleaned = cleanUrl(value);
  if (!isSafeImageSrc(cleaned)) return false;
  if (cleaned.toLowerCase().startsWith("data:image/")) return true;
  try {
    return IMAGE_EXTENSION.test(new URL(cleaned).pathname);
  } catch {
    return false;
  }
}
