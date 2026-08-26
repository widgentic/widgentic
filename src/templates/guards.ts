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

/** Event-handler attributes are code execution in a browser. */
export const FORBIDDEN_ATTR = /^on/i;

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
  "xlink:href"
]);

/** Maximum template nesting depth accepted by validation. */
export const MAX_TEMPLATE_DEPTH = 64;
