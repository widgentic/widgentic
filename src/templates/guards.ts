/**
 * Safety constants shared by validation (strict) and interpretation
 * (lenient defense in depth). Both layers MUST consult these — keeping them
 * in one module is what prevents the two from drifting. URL safety itself
 * lives in the contract layer (`contract/urls.ts`) so the catalog's image
 * rendering shares the exact same rules; re-exported here to keep this
 * module the single import point for template safety.
 */
export {
  ALLOWED_SCHEMES,
  isSafeUrl,
  isSafeImageSrc
} from "../contract/urls.js";

/**
 * Attributes that are code or embedded documents: event handlers (`on*`)
 * and `srcdoc`, which smuggles a whole document past the tag policy.
 */
export const FORBIDDEN_ATTR = /^(?:on.*|srcdoc)$/i;

/**
 * Tags that introduce active or foreign content into the frame. A template
 * is data, never a program: these fail validation and render as nothing
 * when validation was bypassed — the same two-layer stance as `on*`.
 */
export const FORBIDDEN_TAGS: ReadonlySet<string> = new Set([
  "script", "iframe", "frame", "frameset", "object", "embed", "style",
  "link", "meta", "base", "template", "noscript"
]);

/**
 * Renderer-owned attributes (`data-wg-*`): action descriptors and render
 * markers. Authors cannot write them — only a validated `action` binding
 * produces one — so a hand-written descriptor never reaches a tree.
 */
export const RESERVED_ATTR = /^data-wg-/i;

/** Attributes whose values are URLs and can smuggle script schemes. */
export const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "ping"
]);

/** Maximum template nesting depth accepted by validation. */
export const MAX_TEMPLATE_DEPTH = 64;
