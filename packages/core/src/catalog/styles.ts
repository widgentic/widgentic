/**
 * Registered widget styles: custom kinds ship their look as data alongside
 * their template/renderer. Same trust model as themes — designer-authored,
 * so selectors, properties, and values are all guarded, and unsafe entries
 * are skipped rather than emitted.
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

/** Every comma-separated selector part must target a .wg- class. */
function isSafeSelector(selector: string): boolean {
  if (UNSAFE.test(selector)) return false;
  const parts = selector.split(",").map((part) => part.trim());
  return parts.length > 0 && parts.every((part) => part.includes(".wg-"));
}

function isSafeValue(value: string): boolean {
  return (
    !UNSAFE.test(value) &&
    !/url\s*\(/i.test(value) &&
    !/expression\s*\(/i.test(value)
  );
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
        : selector.split(",").map((part) => `:where(${scope}) ${part.trim()}`).join(", ");
      rules.push(`${scoped} {\n${lines.join("\n")}\n}`);
    }
  }
  return rules.join("\n");
}
