/**
 * Registered widget styles: custom kinds ship their look as data alongside
 * their template/renderer, and themes ship shared classes the same way.
 * Same trust model as theme tokens — designer-authored — so selectors,
 * properties, and values are all guarded, and unsafe entries are skipped
 * rather than emitted.
 */
import { isPlainObject } from "../shared/plain-object.js";
import { indexOfTopLevel, isBalanced, pseudoArguments, splitTopLevel, topLevelText } from "../shared/css-scan.js";

export type WidgetStyles = Record<string, Record<string, string>>;

/** Substrings that disqualify a selector, property or value. Exported
 * so the authoring guide derives the rule instead of restating it. */
export const UNSAFE = /[;{}<>@\\]/;
/** The property-name allowlist: not merely "no banned characters". */
export const PROPERTY_NAME = /^-?[a-zA-Z][a-zA-Z-]*$/;

/**
 * The shape both widget and theme styles must have: selectors mapping to
 * property/value strings. Shape only — unsafe entries pass here and are
 * dropped by the generator, so one rule decides what reaches CSS.
 */
export function isStyleMap(value: unknown): value is WidgetStyles {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(
    (declarations) =>
      isPlainObject(declarations) &&
      Object.values(declarations).every((v) => typeof v === "string")
  );
}

/**
 * CSS functions that fetch or execute, refused in values wherever they
 * appear — `image-set()` and `src()` carry URLs without spelling `url(`.
 * Exported so the guides derive the rule instead of restating it.
 */
export const UNSAFE_FUNCTIONS: readonly string[] = ["url(", "expression(", "image-set(", "src("];

/** A comment opener or closer: one can swallow every rule after it. */
const COMMENT = /\/\*|\*\//;

function callsUnsafeFunction(text: string): boolean {
  return UNSAFE_FUNCTIONS.some((call) => new RegExp(`${call.slice(0, -1)}\\s*\\(`, "i").test(text));
}

/**
 * Pseudo-classes that pass their argument's matches through: `:is(.wg-a,
 * .wg-b)` matches only what its arguments match. `:not()` and `:has()` do
 * not — `body:not(.wg-x)` and `body:has(.wg-x)` match `body`.
 */
const FORWARDING_PSEUDOS = ["is", "where", "matches", "-webkit-any", "-moz-any"] as const;

/** Combinators between compounds, read outside brackets and strings. */
const COMBINATOR = (char: string) => /[\s>+~]/.test(char);

/**
 * A selector list every one of whose parts is held to `.wg-` classes: some
 * compound of each part names a `.wg-` class at its own level, or forwards
 * through `:is()`/`:where()` to a list that does. A `.wg-` hidden in
 * `:not()`, `:has()`, an attribute test or a string constrains nothing.
 */
function isConstrainedList(selector: string, depth: number): boolean {
  const parts = splitTopLevel(selector, (char) => char === ",");
  return parts.length > 0 && parts.every((part) => isConstrainedPart(part, depth));
}

/**
 * How deep `:is()`/`:where()` may nest before a selector is refused: the
 * check recurses per level, and a generator that runs on every render must
 * never throw. Real selectors nest two or three levels.
 */
const MAX_FORWARDING_DEPTH = 16;

function isConstrainedPart(part: string, depth = 0): boolean {
  if (depth > MAX_FORWARDING_DEPTH) return false;
  return splitTopLevel(part, COMBINATOR).some(
    (compound) =>
      topLevelText(compound).includes(".wg-") ||
      pseudoArguments(compound, FORWARDING_PSEUDOS).some((argument) => isConstrainedList(argument, depth + 1))
  );
}

/**
 * Every top-level selector part must be held to `.wg-` classes, and no
 * part may open with a combinator (`~ .wg-b` is invalid alone and would
 * only become valid once scoped). Brackets and strings must close, and
 * no comments: either would run on and swallow the rules after it.
 */
function isSafeSelector(selector: string): boolean {
  if (UNSAFE.test(selector) || COMMENT.test(selector) || !isBalanced(selector)) return false;
  const parts = splitTopLevel(selector, (char) => char === ",");
  return parts.length > 0 && parts.every((part) => !/^[>+~]/.test(part) && isConstrainedPart(part));
}

function isSafeValue(value: string): boolean {
  return !UNSAFE.test(value) && !COMMENT.test(value) && isBalanced(value) && !callsUnsafeFunction(value);
}

/**
 * One part under a scope that targets the root element. A part already
 * anchored at the root (`:root[data-theme="dark"] .wg-x`, `html .wg-x`)
 * takes the scope as an extra condition on that root compound — prefixing
 * would demand a root inside the root and never match; any other part is
 * prefixed with `:where(<scope>) `.
 */
function scopePart(part: string, scope: string): string {
  if (!/^(:root|html)(?![\w-])/i.test(part)) return `:where(${scope}) ${part}`;
  const found = indexOfTopLevel(part, COMBINATOR);
  const end = found === -1 ? part.length : found;
  return `${part.slice(0, end)}:where(${scope})${part.slice(end)}`;
}

/**
 * Generate CSS from a styles map, emitting only guarded entries. Values may
 * reference theme tokens via `var(--wg-*)`. Never throws.
 */
export function widgetStylesToCss(styles: WidgetStyles): string {
  return guardedStylesToCss(styles, undefined);
}

/**
 * The one generator behind widget and theme styles. A `scope` (always a
 * caller constant, never style data) prefixes every selector part with
 * `:where(<scope>) `, so the rule applies inside the scope at the weight
 * its author wrote.
 */
export function guardedStylesToCss(styles: WidgetStyles, scope: string | undefined): string {
  const rules: string[] = [];
  for (const [selector, declarations] of Object.entries(styles)) {
    if (!isSafeSelector(selector)) continue;
    if (typeof declarations !== "object" || declarations === null) continue;
    const lines: string[] = [];
    for (const [property, value] of Object.entries(declarations)) {
      if (!PROPERTY_NAME.test(property)) continue;
      if (typeof value !== "string" || !isSafeValue(value)) continue;
      lines.push(`  ${property}: ${value};`);
    }
    if (lines.length > 0) {
      const scoped = scope === undefined
        ? selector
        : splitTopLevel(selector, (char) => char === ",").map((part) => scopePart(part, scope)).join(", ");
      rules.push(`${scoped} {\n${lines.join("\n")}\n}`);
    }
  }
  return rules.join("\n");
}
