/**
 * Theme token registry. Tokens are the only theming surface: the base
 * stylesheet reads them via `var(--wg-<token>, <default>)` and themes are
 * plain maps of bare token names to values. The defaults table is the
 * single source of truth for the light look.
 */
export const TOKEN_DEFAULTS = {
  bg: "#ffffff",
  fg: "#1f2430",
  muted: "#6b7280",
  accent: "#2563eb",
  border: "#e2e8f0",
  radius: "6px",
  spacing: "8px",
  "font-family": "system-ui, -apple-system, 'Segoe UI', sans-serif",
  "font-size": "14px",
  shadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
  "avatar-size": "32px",
  "thumb-size": "48px"
} as const;

export type ThemeToken = keyof typeof TOKEN_DEFAULTS;

/** All theme token names, in defaults-table order. */
export const THEME_TOKENS: readonly ThemeToken[] = Object.keys(
  TOKEN_DEFAULTS
) as ThemeToken[];

/**
 * A theme: bare token names to CSS values. Bare keys make unknown-token
 * validation trivial and structurally prevent setting arbitrary custom
 * properties — the `--wg-` prefix is always applied by this module.
 */
export type WidgetTheme = Partial<Record<ThemeToken, string>>;

export type ThemeErrorCode =
  | "INVALID_THEME"
  | "UNKNOWN_TOKEN"
  | "INVALID_TOKEN_VALUE";

export interface ThemeError {
  code: ThemeErrorCode;
  message: string;
  /** Offending token name, when applicable. */
  token?: string;
}

/**
 * Value guard shared by validation (strict) and application (lenient
 * defense in depth). Rejects exfiltration and execution vectors — not
 * invalid CSS: declaration/HTML escapes, `url()` (resource fetching), and
 * `expression()` (legacy script execution in old embedded webviews).
 */
export function isSafeTokenValue(value: string): boolean {
  return (
    !/[;{}<>]/.test(value) &&
    !/url\s*\(/i.test(value) &&
    !/expression\s*\(/i.test(value)
  );
}
