/**
 * Theme token registry. Tokens are the only theming surface: the base
 * stylesheet reads them via `var(--wg-<token>, <default>)` and themes are
 * plain maps of bare token names to values. The defaults table is the
 * single source of truth for the light look.
 */
/**
 * The token table: every token's default, its VALUE TYPE, and what it is
 * for. Type metadata is not decoration — tooling reads it (the theme
 * designer picks a color picker vs a text field from `type`, never by
 * guessing at the default's shape) and `list_theme_tokens` tells agents
 * what kind of value each token expects. `use` doubles as the
 * documentation that earns a token its place when the base stylesheet
 * cannot consume it.
 */
export type TokenType =
  | "color"
  | "dimension"
  | "number"
  | "font-family"
  | "font-weight"
  | "shadow";

export interface TokenSpec {
  default: string;
  type: TokenType;
  use: string;
}

export const TOKEN_SPECS = {
  bg: { default: "#ffffff", type: "color", use: "Page background behind widgets." },
  surface: {
    default: "#ffffff",
    type: "color",
    use: "Widget panel background (cards, tables); falls back to bg when unset."
  },
  fg: { default: "#1f2430", type: "color", use: "Primary text." },
  muted: { default: "#6b7280", type: "color", use: "Secondary text: labels, captions, keys." },
  accent: { default: "#2563eb", type: "color", use: "Emphasis: titles, links, filled badges." },
  "accent-fg": {
    default: "#ffffff",
    type: "color",
    use: "Text drawn on an accent fill (filled badges and buttons)."
  },
  border: { default: "#e2e8f0", type: "color", use: "Hairlines: panel edges, row rules." },
  "border-width": { default: "1px", type: "dimension", use: "Width of those hairlines." },
  radius: { default: "6px", type: "dimension", use: "Default corner rounding." },
  "radius-sm": { default: "3px", type: "dimension", use: "Tight rounding: pills, chips, inline marks." },
  "radius-lg": { default: "12px", type: "dimension", use: "Generous rounding: hero media, large panels." },
  spacing: { default: "8px", type: "dimension", use: "Base spacing step." },
  "spacing-sm": { default: "4px", type: "dimension", use: "Half step: inline gaps inside a row." },
  "spacing-lg": { default: "16px", type: "dimension", use: "Double step: section separation." },
  "font-family": {
    default: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    type: "font-family",
    use: "Body text family."
  },
  "font-mono": {
    default: "ui-monospace, SFMono-Regular, Menlo, monospace",
    type: "font-family",
    use: "Monospace family for code and raw JSON (the custom kind)."
  },
  "font-size": { default: "14px", type: "dimension", use: "Body text size." },
  "font-size-sm": { default: "12px", type: "dimension", use: "Small text: captions, stats, pills." },
  "font-size-lg": { default: "18px", type: "dimension", use: "Large text: widget titles." },
  "font-weight-bold": {
    default: "600",
    type: "font-weight",
    use: "Weight for titles and emphasized labels."
  },
  "line-height": { default: "1.45", type: "number", use: "Text density." },
  shadow: {
    default: "0 1px 3px rgba(0, 0, 0, 0.12)",
    type: "shadow",
    use: "Panel elevation."
  },
  danger: { default: "#b91c1c", type: "color", use: "Error status: fills and text (see .wg-status-danger)." },
  "danger-fg": { default: "#ffffff", type: "color", use: "Text on a danger fill." },
  success: { default: "#15803d", type: "color", use: "Success status (see .wg-status-success)." },
  "success-fg": { default: "#ffffff", type: "color", use: "Text on a success fill." },
  warning: { default: "#b45309", type: "color", use: "Warning status (see .wg-status-warning)." },
  "warning-fg": { default: "#ffffff", type: "color", use: "Text on a warning fill." },
  info: { default: "#0369a1", type: "color", use: "Informational status (see .wg-status-info)." },
  "info-fg": { default: "#ffffff", type: "color", use: "Text on an info fill." },
  "avatar-size": { default: "32px", type: "dimension", use: "Box of .wg-img-avatar images." },
  "thumb-size": { default: "48px", type: "dimension", use: "Box of .wg-img-thumb images." }
} as const satisfies Record<string, TokenSpec>;

/** Default value per token — derived, so the table stays the one source. */
export const TOKEN_DEFAULTS = Object.fromEntries(
  Object.entries(TOKEN_SPECS).map(([name, spec]) => [name, spec.default])
) as { [K in keyof typeof TOKEN_SPECS]: (typeof TOKEN_SPECS)[K]["default"] };

export type ThemeToken = keyof typeof TOKEN_SPECS;

/** All theme token names, in defaults-table order. */
export const THEME_TOKENS: readonly ThemeToken[] = Object.keys(
  TOKEN_SPECS
) as ThemeToken[];

/**
 * A theme: bare token names to CSS values. Bare keys make unknown-token
 * validation trivial and structurally prevent setting arbitrary custom
 * properties — the `--wg-` prefix is always applied by this module.
 */
export type WidgetTheme = Partial<Record<ThemeToken, string>>;

/**
 * A theme plus author-defined `x-*` variables (emitted as `--wg-x-<name>`).
 * Kept as a separate type on purpose: `WidgetTheme` has only optional
 * properties, which is what makes TypeScript reject `{ sneaky: "red" }` via
 * weak-type detection — an index signature here would silently disable that
 * protection for every consumer. Functions accept this wider input; the
 * runtime validator is the authority on which keys are legal.
 */
export type WidgetThemeInput = WidgetTheme &
  Partial<Record<`x-${string}`, string>>;

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
