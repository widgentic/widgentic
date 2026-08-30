/**
 * The default palettes are legible (widget-designer spec, "Every default pair
 * meets contrast"). Colours reach people through their eyes, not through a
 * review, so every foreground/background pair among the defaults is measured
 * here in both schemes and the build fails on a regression — the same reason
 * the documentation site gates `mint a11y`.
 *
 * Thresholds are WCAG 2.2 contrast ratios: 4.5:1 for body text, 3:1 for large
 * text and for the non-text boundaries a control is recognised by.
 */
import { describe, expect, it } from "vitest";
import { CHROME_DEFAULTS } from "../index.js";
import type { ChromeScheme, ChromeToken } from "../index.js";

const TEXT = 4.5;
const NON_TEXT = 3;

function channel(hex: string, from: number): number {
  const value = Number.parseInt(hex.slice(from, from + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG; the palettes are opaque 6-digit hex throughout. */
function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not an opaque hex colour: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The pairs that decide whether a person can read and operate the chrome. */
const PAIRS: ReadonlyArray<{ fg: ChromeToken; bg: ChromeToken; min: number }> = [
  { fg: "text", bg: "bg", min: TEXT },
  { fg: "text", bg: "panel", min: TEXT },
  { fg: "muted", bg: "bg", min: TEXT },
  { fg: "muted", bg: "panel", min: TEXT },
  { fg: "accent", bg: "bg", min: TEXT },
  { fg: "accent", bg: "panel", min: TEXT },
  { fg: "accent", bg: "accent-bg", min: TEXT },
  { fg: "danger", bg: "bg", min: TEXT },
  { fg: "danger", bg: "panel", min: TEXT },
  { fg: "danger", bg: "danger-bg", min: TEXT },
  { fg: "text", bg: "hover", min: TEXT },
  // JSON highlighting is body text on the panel it is printed on.
  { fg: "hl-key", bg: "panel", min: TEXT },
  { fg: "hl-str", bg: "panel", min: TEXT },
  { fg: "hl-num", bg: "panel", min: TEXT },
  { fg: "hl-bool", bg: "panel", min: TEXT },
  { fg: "hl-punct", bg: "panel", min: TEXT },
  { fg: "muted", bg: "hover", min: TEXT },
  // WCAG 1.4.11: the visual information required to identify a component or
  // its state. `border` is the ONLY thing distinguishing an input, select,
  // button, icon or swatch from the surface behind it; `accent-line` carries
  // the tag's focus ring; `danger-line` outlines the banner. Deliberately NOT
  // here: `line` (tree indent guides and a grouping outline — decorative,
  // nothing is identified by it) and `hover` (a supplementary state tint; the
  // control is identifiable without it, and 3:1 would make hover a slab).
  { fg: "border", bg: "bg", min: NON_TEXT },
  { fg: "border", bg: "panel", min: NON_TEXT },
  { fg: "accent-line", bg: "accent-bg", min: NON_TEXT },
  { fg: "danger-line", bg: "danger-bg", min: NON_TEXT }
];

function report(scheme: ChromeScheme): Array<{ pair: string; got: number; min: number }> {
  return PAIRS.map(({ fg, bg, min }) => ({
    pair: `${fg} on ${bg}`,
    got: Math.round(ratio(scheme[fg], scheme[bg]) * 100) / 100,
    min
  })).filter((row) => row.got < row.min);
}

describe("the default chrome palette is legible", () => {
  for (const scheme of ["light", "dark"] as const) {
    it(`${scheme}: every pair meets its threshold`, () => {
      expect(report(CHROME_DEFAULTS[scheme])).toEqual([]);
    });
  }
  // There is one default palette and it is gated. A host that wants another
  // look writes its own and owns its own contrast; nothing ships from here
  // that we have not measured.

  it("measures opaque colours only, so a ratio is never guessed", () => {
    for (const scheme of [CHROME_DEFAULTS.light, CHROME_DEFAULTS.dark]) {
      for (const { fg, bg } of PAIRS) {
        expect(() => ratio(scheme[fg], scheme[bg])).not.toThrow();
      }
    }
  });
});
