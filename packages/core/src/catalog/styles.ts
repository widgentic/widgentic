/**
 * Registered widget styles: custom kinds ship their look as data alongside
 * their template/renderer. Same trust model as themes — designer-authored,
 * so selectors, properties, and values are all guarded, and unsafe entries
 * are skipped rather than emitted.
 */
export type WidgetStyles = Record<string, Record<string, string>>;

/** Substrings that disqualify a selector, property or value. Exported
 * so the authoring guide derives the rule instead of restating it. */
export const UNSAFE = /[;{}<>@\\]/;
/** The property-name allowlist: not merely "no banned characters". */
export const PROPERTY_NAME = /^-?[a-zA-Z][a-zA-Z-]*$/;

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
      rules.push(`${selector} {\n${lines.join("\n")}\n}`);
    }
  }
  return rules.join("\n");
}
