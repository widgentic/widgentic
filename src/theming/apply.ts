import type { ThemeError, WidgetTheme } from "./tokens.js";
import { THEME_TOKENS, isSafeTokenValue } from "./tokens.js";

export type ValidateThemeResult =
  | { ok: true; theme: WidgetTheme }
  | { ok: false; error: ThemeError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KNOWN_TOKENS: ReadonlySet<string> = new Set(THEME_TOKENS);

/** Validate an unknown value as a theme. Never throws. */
export function validateTheme(input: unknown): ValidateThemeResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      error: { code: "INVALID_THEME", message: "Theme must be a plain object." }
    };
  }
  for (const [token, value] of Object.entries(input)) {
    if (!KNOWN_TOKENS.has(token)) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_TOKEN",
          message: `Unknown theme token '${token}'.`,
          token
        }
      };
    }
    if (typeof value !== "string" || !isSafeTokenValue(value)) {
      return {
        ok: false,
        error: {
          code: "INVALID_TOKEN_VALUE",
          message: `Token '${token}' has an invalid or unsafe value.`,
          token
        }
      };
    }
  }
  return { ok: true, theme: input as WidgetTheme };
}

/**
 * Apply a theme to a container as inline `--wg-*` custom properties
 * (scoped: descendants inherit them; siblings are unaffected). Replace
 * semantics — previously applied tokens are removed first, so
 * `applyTheme(el, {})` resets to the stylesheet defaults. Invalid entries
 * are skipped; the CSSOM path (`setProperty`) parses no stylesheet text,
 * so declaration escape is structurally impossible here.
 */
export function applyTheme(container: Element, theme: WidgetTheme): void {
  const style = (container as Partial<ElementCSSInlineStyle>).style;
  if (!style) return;
  for (const token of THEME_TOKENS) {
    style.removeProperty(`--wg-${token}`);
  }
  for (const token of THEME_TOKENS) {
    const value = theme[token];
    if (typeof value === "string" && isSafeTokenValue(value)) {
      style.setProperty(`--wg-${token}`, value);
    }
  }
}

/**
 * Generate a CSS rule assigning the theme's tokens under `selector`
 * (default `:root`). Only entries passing the safety guard are emitted.
 */
export function themeToCss(theme: WidgetTheme, selector = ":root"): string {
  const declarations: string[] = [];
  for (const token of THEME_TOKENS) {
    const value = theme[token];
    if (typeof value === "string" && isSafeTokenValue(value)) {
      declarations.push(`  --wg-${token}: ${value};`);
    }
  }
  return `${selector} {\n${declarations.join("\n")}\n}`;
}

/** Dark preset — ordinary theme data, a starting point for custom themes. */
export const darkTheme: WidgetTheme = {
  bg: "#0f131c",
  fg: "#e5e9f0",
  muted: "#8b93a7",
  accent: "#7aa2f7",
  border: "#2a3140",
  shadow: "0 1px 3px rgba(0, 0, 0, 0.6)"
};
