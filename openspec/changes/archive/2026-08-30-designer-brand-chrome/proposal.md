# Why

The designers ship a neutral system palette and every host paints them itself,
so the widgentic look exists in three hand-written copies that have already
drifted apart. `apps/web/index.html` is canonical; `examples/designer`'s brand
toggle differs on five tokens (`line`, `hover`, `accent-line`, `danger-bg`,
`danger-line`); and the app's own `DESIGNER_CHROME` maps only **17 of the 28**
chrome tokens, so widgentic.dev's designers still render JSON in the stock
blue, green and orange. Our own product is half-branded, and a third host is
about to copy the same map a fourth time.

The values are also unreachable: the light and dark defaults live only inside
the injected stylesheet, so a host that wants its page to match the designers
has nothing to read — it has to retype the palette. That is what every copy is.

Making the widgentic palette the default fixes both: one source of truth, our
app and every example consistent without configuration, and a recognisable look
wherever the designers are embedded.

# What Changes

- **The designers' default chrome becomes the widgentic palette**, light and
  dark, replacing the neutral defaults in the injected stylesheet. Shape
  follows: radii `4 / 6 / 8` (what the app already asks for), replacing
  `3 / 4 / 6`.
- **Typography does not change.** `font` and `font-mono` stay system stacks and
  font sizes stay 13/12/11. A library must never default to a webfont it cannot
  serve; widgentic.dev keeps one `chrome` line for Source Sans 3.
- **The palettes become exports**: `CHROME_DEFAULTS = { light, dark }` — the
  values the stylesheet uses — so a host can paint its own page to match the
  designers instead of retyping them, which is what the copies exist for.
- **Exactly one palette ships.** A compatibility palette reproducing the old
  look was built and then dropped (decision B9): `@widgentic/designer@0.2.0`
  was one day old with no external adopters, so the escape hatch protected
  nobody while publishing a palette our own gate records as failing WCAG in ten
  places. A host that wants a different look writes its own values.
- **`chromeCss(prefix?)`** emits the `:root` light/dark declaration blocks for
  a chosen custom-property prefix, so a host page's palette is derived from the
  exported values rather than restated.
- **Contrast is gated**, not assumed: a computed-value test checks every
  foreground/background token pair in both schemes against WCAG thresholds. The
  documentation pass already found widget blue `#40A0C8` failing 3:1 on light —
  which is why the accent is `#1E6F92` — so the palette is verified, not
  eyeballed.
- **BREAKING (visually, not in API)**: a host that passes no `chrome` renders
  in the widgentic palette from this release. No signature changes, nothing
  stops compiling; a host that wants something else passes its own values.

# Capabilities

## Modified Capabilities

- `widget-designer`: the chrome requirement currently promises that "with no
  `chrome` given, the rendered chrome SHALL be identical to before". That
  promise is what this change spends. The requirement gains the widgentic
  palette as the specified default, the exported palettes, and the contrast
  obligation.

# Impact

- `packages/designer`: default token blocks in `src/dom.ts` re-valued; new
  `src/chrome-defaults.ts`; two new exports on the package root
  (`tools/exports.test.ts` snapshot for `@widgentic/designer` grows); a
  contrast test. No new dependency — the package stays browser-safe and
  zero-dependency.
- Changeset: minor for `@widgentic/designer` (0.2.0 → 0.3.0).
- `examples/designer`: its default state passes no `chrome` at all and derives
  the page's `--host-*` block from `chromeCss()`; the toggle becomes a
  demonstration of a host writing its OWN palette — Dracula (MIT), mapped from
  its official colours — rather than a second copy of the brand.
- `widgentic/apps` (later, its own change): `DESIGNER_CHROME` drops from 17
  entries to the one typography line, and the shell's `--host-*` block is
  derived from the export. Not a prerequisite here.
- Sequencing: this lands before `self-host-example`, which then sets no chrome
  at all and drops the shared chrome map from its plan.
