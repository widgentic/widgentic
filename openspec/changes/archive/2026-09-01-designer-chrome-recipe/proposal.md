## Why

Two hosts now hand-write the same map to make mounted designers follow their page's
palette: widgentic.dev generates `token → var(--host-<token>)` over `CHROME_TOKENS`
(its theme switcher reaches four mounted designers through it), and the designer demo
hand-rolls a partial version for its Dracula toggle. The pattern is exactly what the
`chrome` option's contract invites ("values MAY be `var()` references to the host's own
custom properties") — but every host must rediscover it, and the theme-switcher change's
task 6.5 proposed solving the same need with new package machinery (`appearanceFrom`
stylesheet options or a `setAppearance()` handle API). Both were reviewed and rejected:
the stylesheet route needs host-aware media-guard rewrites plus a 9-state precedence
table and document-global first-mount-wins config, and the setter route creates two code
paths a host must keep agreeing (a change event AND a remount option). What developers
actually need most is CUSTOM CHROME; scheme-following is a special case of it, and the
`chrome` option already carries both.

## What Changes

- **`@widgentic/designer` exports `chromeReferences(prefix = "--host")`**: the full
  `chrome` map of `var()` references over `CHROME_TOKENS` — derived by iteration, never
  written by hand. Hosts spread-override individual entries (real font stacks, a brand
  accent). With the existing `chromeCss()` painting the page under the same prefix, the
  designers match the page BY CONSTRUCTION — including an explicit host scheme toggle
  via `darkSelector`, with no remount, no event, and no new designer API.
- **The custom-chrome recipe becomes documentation**, in the designer README and the
  hand-written docs page that covers the `chrome` option: (a) partial overrides —
  unmapped tokens keep the product defaults; (b) the full takeover — `chromeCss` for the
  page + `chromeReferences` for the designers; (c) the one gotcha, stated plainly: a
  reference to a property the page never defines is invalid at computed-value time and
  does NOT fall back to the package defaults, so the full-reference map is always paired
  with the derived page palette.
- No new scheme mechanism: `appearance` stays mount-time, the stylesheet keeps its
  options-free once-per-document injection, `DesignerHandle` grows nothing.

Not breaking: one additive export and documentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-designer`: the "Designer chrome is themeable by the host" requirement gains
  the reference-map helper and its documented no-fallback caveat.

## Impact

- `packages/designer/src/chrome-defaults.ts` — `chromeReferences()` beside `chromeCss()`;
  the package barrel; `packages/designer/README.md`.
- `tools/exports.test.ts` snapshot (+1 designer export); a unit test for the helper;
  a test pinning the documented caveat.
- The hand-written docs page documenting `chrome` (recipe section); no generated pages
  change (the helper is host-side wiring, not guide content).
- Changeset: minor for `@widgentic/designer`.
- Downstream (not in this change): `widgentic/apps` replaces its generated map in
  `apps/web/designer-chrome.ts` with `{ ...chromeReferences(), font, "font-mono" }` on
  its next bump, reverting the theme-switcher change's amendment to "the app passes
  typography and nothing more". The designer demo keeps its PARTIAL Dracula map — it
  demonstrates the other half of the recipe (partial override with default fallthrough).
