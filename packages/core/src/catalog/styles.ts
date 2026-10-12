/**
 * Registered widget styles: custom kinds ship their look as data alongside
 * their template/renderer, and themes ship shared classes the same way.
 * Same trust model as theme tokens — designer-authored — so selectors,
 * properties, and values are all guarded, and unsafe entries are skipped
 * rather than emitted.
 */
import { isPlainObject } from "../shared/plain-object.js";

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
 * A selector's top-level structure: the text outside every (…) argument and
 * […] attribute test, scanned with depth so nesting is respected. A `.wg-`
 * class only counts when it is part of the selector itself, not hidden in
 * `:not(.wg-x)` or `[data-a=".wg-"]`.
 */
function outsideArguments(part: string): string {
  let depth = 0;
  let out = "";
  for (const char of part) {
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += char;
  }
  return out;
}

/**
 * Every top-level selector part must name a .wg- class in its own
 * structure, and no part may open with a combinator (`~ .wg-b` is invalid
 * alone and would only become valid once scoped). No comments.
 */
function isSafeSelector(selector: string): boolean {
  if (UNSAFE.test(selector) || COMMENT.test(selector)) return false;
  const parts = topLevelParts(selector);
  return (
    parts.length > 0 &&
    parts.every((part) => !/^[>+~]/.test(part) && outsideArguments(part).includes(".wg-"))
  );
}

function isSafeValue(value: string): boolean {
  return !UNSAFE.test(value) && !COMMENT.test(value) && !callsUnsafeFunction(value);
}

/**
 * A selector list's parts, split on TOP-LEVEL commas only: the commas
 * inside :is(), :not(), :has() or :where() belong to their argument, so
 * `.wg-row:has(.wg-ok, .wg-warn)` stays one part.
 */
function topLevelParts(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter((part) => part.length > 0);
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
  let depth = 0;
  let end = part.length;
  for (let i = 0; i < part.length; i++) {
    const char = part[i] ?? "";
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[\s>+~]/.test(char)) {
      end = i;
      break;
    }
  }
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
        : topLevelParts(selector).map((part) => scopePart(part, scope)).join(", ");
      rules.push(`${scoped} {\n${lines.join("\n")}\n}`);
    }
  }
  return rules.join("\n");
}
