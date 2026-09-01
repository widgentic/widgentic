/**
 * The chrome tokens and the palettes painted through them.
 *
 * `CHROME_DEFAULTS` is not a description of the defaults — it IS them: the
 * injected stylesheet's token blocks are generated from this object, so a host
 * that paints its own surfaces from the export cannot drift from the
 * designers. There is deliberately no second palette to fall back to: a host
 * that wants a different look passes its own values through `chrome`, and
 * `chromeCss` renders whatever palette it hands back.
 *
 * Colours and shape carry the product's identity. Typography does not: a
 * library must never default to a webfont it cannot serve, so `font`,
 * `font-mono` and the three sizes stay system values in both palettes and a
 * host with its own typeface passes it through `chrome`.
 */

/**
 * The chrome tokens — every `--wgd-<token>` the stylesheet paints with.
 * Colours (18) differ between the schemes; typography, shape and shadow are
 * declared per scheme too so each palette stands alone. Public API: a rename
 * is a spec change.
 */
export const CHROME_TOKENS = [
  "bg", "panel", "border", "line", "text", "muted",
  "accent", "accent-bg", "accent-line",
  "danger", "danger-bg", "danger-line", "hover",
  "hl-key", "hl-str", "hl-num", "hl-bool", "hl-punct",
  "font", "font-mono", "font-size", "font-size-sm", "font-size-xs",
  "radius-sm", "radius", "radius-lg", "gap", "shadow"
] as const;

export type ChromeToken = (typeof CHROME_TOKENS)[number];

/** A host's partial chrome: token → CSS value (`var()` references welcome). */
export type ChromeOptions = Partial<Record<ChromeToken, string>>;

/** Every token valued — what a palette is. */
export type ChromeScheme = Record<ChromeToken, string>;

/** A complete palette: both schemes, every token. */
export interface ChromePalette {
  light: ChromeScheme;
  dark: ChromeScheme;
}

/** Shared by both palettes: see the module header on why typography is not branded. */
const TYPOGRAPHY = {
  font: "system-ui, sans-serif",
  "font-mono": "ui-monospace, monospace",
  "font-size": "13px",
  "font-size-sm": "12px",
  "font-size-xs": "11px"
} as const;

/**
 * The widgentic palette — what the designers render with when a host passes
 * no `chrome`, and what a host paints its own page with to match them.
 *
 * Every colour sits on the logo mark's own hue (197.6deg, from `#40a0c8`).
 * Surfaces, text and accents come from the product's existing palette;
 * `border`, `accent-line` and `danger-line` are DERIVED, not chosen: each is
 * the lightest value on that hue which still clears 3:1 against the surface
 * it sits on, because those edges are what identifies a control, a focused tag
 * and a banner. Minimum weight that complies, so nothing is heavier than
 * accessibility requires. See chrome-contrast.test.ts for the gate.
 */
export const CHROME_DEFAULTS: ChromePalette = {
  light: {
    bg: "#f6fafc", panel: "#ffffff", border: "#6e95a6",
    line: "#e4ecf2", text: "#0b1b26", muted: "#56707f",
    accent: "#1e6f92", "accent-bg": "#e3f1f7", "accent-line": "#4b91ae",
    danger: "#b42318", "danger-bg": "#fdf2f2", "danger-line": "#c97572",
    hover: "#eef5f9",
    "hl-key": "#1e6f92", "hl-str": "#2e7d5b", "hl-num": "#96620f",
    "hl-bool": "#7a4fbf", "hl-punct": "#56707f",
    ...TYPOGRAPHY,
    "radius-sm": "4px", radius: "6px", "radius-lg": "8px", gap: "16px",
    shadow: "0 8px 24px -12px rgba(11, 27, 38, 0.35)"
  },
  dark: {
    bg: "#0b141b", panel: "#10202a", border: "#437082",
    line: "#1b2f3d", text: "#e6f0f5", muted: "#93a9b6",
    accent: "#8acbe6", "accent-bg": "#14303d", "accent-line": "#3e7e98",
    danger: "#f0a3a3", "danger-bg": "#2a1a1c", "danger-line": "#a3524f",
    hover: "#152a36",
    "hl-key": "#8acbe6", "hl-str": "#6cc79a", "hl-num": "#e0b25a",
    "hl-bool": "#bb9af7", "hl-punct": "#93a9b6",
    ...TYPOGRAPHY,
    "radius-sm": "4px", radius: "6px", "radius-lg": "8px", gap: "16px",
    shadow: "0 8px 24px -12px rgba(0, 0, 0, 0.7)"
  }
};

export interface ChromeCssOptions {
  /** Custom-property prefix, dashes included. Default `--wgd`. */
  prefix?: string;
  /** Selector the light block is written under. Default `:root`. */
  selector?: string;
  /** Selector for the dark block inside `prefers-color-scheme: dark`; defaults to `selector`. */
  darkMediaSelector?: string;
  /** Optional selector for an unconditional dark block — an explicit host toggle. */
  darkSelector?: string;
}

function declarations(scheme: ChromeScheme, prefix: string, indent: string): string {
  return CHROME_TOKENS.map((token) => `${indent}${prefix}-${token}: ${scheme[token]};`).join("\n");
}

/**
 * Render a palette as CSS declaration blocks — the light values under
 * `selector`, the dark values under `prefers-color-scheme: dark`, and
 * optionally under an explicit selector a host toggles. Every token is
 * declared in every block, so nothing falls back to a browser value.
 *
 * A string builder, deliberately: no injection, no runtime, no dependency.
 * The designers' own stylesheet is built with it, and so is a host page that
 * wants its surfaces to match them.
 */
export function chromeCss(palette: ChromePalette, options: ChromeCssOptions = {}): string {
  const prefix = options.prefix ?? "--wgd";
  const selector = options.selector ?? ":root";
  const darkMediaSelector = options.darkMediaSelector ?? selector;
  const blocks = [
    `${selector} {\n${declarations(palette.light, prefix, "  ")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${darkMediaSelector} {\n${declarations(palette.dark, prefix, "    ")}\n  }\n}`
  ];
  if (options.darkSelector !== undefined) {
    blocks.push(`${options.darkSelector} {\n${declarations(palette.dark, prefix, "  ")}\n}`);
  }
  return blocks.join("\n");
}

/**
 * The full `chrome` map of `var()` references to a host page's own
 * properties under `prefix` — the other half of `chromeCss`: paint the page
 * with the derived palette, hand the designers these references, and the
 * two match by construction. Because inline `var()` resolves at the host,
 * the page's scheme handling (an explicit toggle included) reaches MOUNTED
 * designers through the cascade — no remount, no event, no API.
 *
 * A reference to a property the page never defines is invalid at
 * computed-value time; it does NOT fall back to the built-in defaults, so
 * always pair this map with `chromeCss` under the same prefix. Override
 * individual entries by spreading: `{ ...chromeReferences(), font: "..." }`.
 */
export function chromeReferences(prefix = "--host"): Record<ChromeToken, string> {
  return Object.fromEntries(
    CHROME_TOKENS.map((token) => [token, `var(${prefix}-${token})`])
  ) as Record<ChromeToken, string>;
}

