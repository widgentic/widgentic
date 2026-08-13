import type { ThemeError, WidgetTheme, WidgetThemeInput } from "./tokens.js";
import { THEME_TOKENS, isSafeTokenValue } from "./tokens.js";

export type ValidateThemeResult =
  | { ok: true; theme: WidgetThemeInput }
  | { ok: false; error: ThemeError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KNOWN_TOKENS: ReadonlySet<string> = new Set(THEME_TOKENS);

/**
 * Author-defined variables: `x-<name>` keys are accepted alongside registry
 * tokens and emitted as `--wg-x-<name>`. This is the sanctioned escape
 * hatch for custom widgets that need their own knobs, so the registry does
 * not have to grow for every one-off. Names are lowercase/kebab so the
 * generated custom property is always a valid CSS identifier.
 */
const CUSTOM_VARIABLE = /^x-[a-z0-9][a-z0-9-]*$/;

/** Custom-variable keys carried by a theme, in declaration order. */
function customKeys(theme: WidgetThemeInput): string[] {
  return Object.keys(theme).filter((key) => CUSTOM_VARIABLE.test(key));
}

/** The `--wg-*` property name a theme key maps to. */
function propertyName(key: string): string {
  return `--wg-${key}`;
}

/** Validate an unknown value as a theme. Never throws. */
export function validateTheme(input: unknown): ValidateThemeResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      error: { code: "INVALID_THEME", message: "Theme must be a plain object." }
    };
  }
  for (const [token, value] of Object.entries(input)) {
    if (!KNOWN_TOKENS.has(token) && !CUSTOM_VARIABLE.test(token)) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_TOKEN",
          message:
            `Unknown theme token '${token}'. Use a registry token, or a ` +
            `custom variable named 'x-<lowercase-kebab>'.`,
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
  return { ok: true, theme: input as WidgetThemeInput };
}

/**
 * Apply a theme to a container as inline `--wg-*` custom properties
 * (scoped: descendants inherit them; siblings are unaffected). Replace
 * semantics — previously applied tokens are removed first, so
 * `applyTheme(el, {})` resets to the stylesheet defaults. Invalid entries
 * are skipped; the CSSOM path (`setProperty`) parses no stylesheet text,
 * so declaration escape is structurally impossible here.
 */
export function applyTheme(container: Element, theme: WidgetThemeInput): void {
  const style = (container as Partial<ElementCSSInlineStyle>).style;
  if (!style) return;
  // Replace semantics: clear every property this module could have set,
  // custom variables included (they are removed by name from the inline
  // style, which is the only place applyTheme writes).
  for (const token of THEME_TOKENS) {
    style.removeProperty(propertyName(token));
  }
  for (let i = style.length - 1; i >= 0; i--) {
    const property = style.item(i);
    if (property.startsWith("--wg-x-")) style.removeProperty(property);
  }
  const keys: string[] = [...THEME_TOKENS, ...customKeys(theme)];
  for (const key of keys) {
    const value = (theme as Record<string, unknown>)[key];
    if (typeof value === "string" && isSafeTokenValue(value)) {
      style.setProperty(propertyName(key), value);
    }
  }
}

/**
 * Generate a CSS rule assigning the theme's tokens under `selector`
 * (default `:root`). Only entries passing the safety guard are emitted.
 */
export function themeToCss(theme: WidgetThemeInput, selector = ":root"): string {
  const declarations: string[] = [];
  const keys: string[] = [...THEME_TOKENS, ...customKeys(theme)];
  for (const key of keys) {
    const value = (theme as Record<string, unknown>)[key];
    if (typeof value === "string" && isSafeTokenValue(value)) {
      declarations.push(`  ${propertyName(key)}: ${value};`);
    }
  }
  return `${selector} {\n${declarations.join("\n")}\n}`;
}

/** Dark preset — ordinary theme data, a starting point for custom themes. */
export const darkTheme: WidgetTheme = {
  bg: "#0f131c",
  surface: "#161b26",
  fg: "#e5e9f0",
  muted: "#8b93a7",
  accent: "#7aa2f7",
  "accent-fg": "#0f131c",
  border: "#2a3140",
  shadow: "0 1px 3px rgba(0, 0, 0, 0.6)",
  danger: "#f0a3a3",
  success: "#8fd19e",
  warning: "#e8b878",
  info: "#7cc4e8"
};
