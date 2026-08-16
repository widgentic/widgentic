# Design — closing the verification findings

## D1. Chained defaults, not "drop the default"

The `surface` regression has two obvious fixes and only one of them keeps
both promises.

*Omit `surface` from the `:root` block* restores the fallback chain but
breaks "Every token is defined for custom styles" — a custom widget's bare
`var(--wg-surface)` would collapse again, which is the bug the defaults
block exists to prevent.

*Emit `--wg-surface: var(--wg-bg, #ffffff);`* keeps the token defined
(bare `var(--wg-surface)` resolves) **and** makes it track `bg` when a
theme sets only `bg`. Both requirements hold simultaneously.

So `TOKEN_SPECS` gains an optional `fallback` field naming the token a
default should chain through. Only `surface → bg` uses it today; the
mechanism is declared in the token metadata rather than special-cased in
the stylesheet builder, because the stylesheet already reads every other
token fact from `TOKEN_SPECS` and a hand-written exception there would be
the same "prose duplicating a constant" problem this change is closing.

**The test must resolve a computed value, not match CSS text.** The
existing test regex-matched `background: var\(--wg-surface, var\(--wg-bg,`
and passed throughout the regression. Text assertions cannot see cascade
semantics.

## D2. Reserved theme names refuse at the door

`checkStoredWidget` already refuses built-in kinds with `RESERVED_KIND`.
Themes get the symmetric `RESERVED_THEME` against the built-in registry
names, so the failure surfaces as a 422 at save time instead of a
diagnostic swallowed during compose.

Reading the reserved names from `createThemeRegistry().list()` keeps the
fact derived rather than duplicated — the same discipline the authoring
guide follows.

## D3. Preview: validate what you were handed

The freeze path is correct *once a good render exists*. The hole is the
first render, reachable because `createDesigner` applies `initialWidget`
without validating it. Rather than teach the preview to synthesize a
placeholder (which would contradict "never a stale-placeholder state"),
the preview renders an explicit empty-state node when it has nothing
valid to freeze on. The banner already carries the structured error; the
pane stops being blank.

## D4. Theme diagnostics belong to the theme panel

`deriveDiagnostics` already computes `diagnostics.theme`. The theme panel
owns the offending value, so it gains the diagnostic line, wired through
the same `applyDiagnostics` fan-out that serves kind/example/sample/styles.

## D5. Read-only means "cannot edit", not "cannot look"

Export produces a copy of what is already on screen; inerting it stops a
viewer from doing the one thing read-only mode is for. The Export section
is excluded from the inert set by class, the same way the theme panel
already is.

## D6. Docs: state the contract where the damage happens

The README's deploy recipe is not merely incomplete — every omitted
parameter has a Bicep default that mutates live state. The fix is to show
the standing parameter set and point at the redeploy contract, not to add
a caveat under a command that still reads as copy-pasteable.

## Risks

- **Chained defaults change generated CSS for every consumer.** Mitigated
  by the computed-value test plus the existing page/app-template tests.
- **`RESERVED_THEME` is a new rejection.** A principal who already saved a
  theme named `light`/`dark` will see it refused on next write; it was
  never usable, so this converts silent loss into a visible error.
- **Excluding export from read-only widens what a viewer can do.** Export
  reveals nothing the preview and panels do not already show.
