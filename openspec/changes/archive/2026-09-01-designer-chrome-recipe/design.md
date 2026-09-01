# Design — The custom-chrome recipe, packaged

## Context

See proposal.md — Why. What exists:

- `applyChrome` writes `--wgd-<token>` inline on the designer root for every valid
  `chrome` entry; inline outranks every block of the injected stylesheet, and an inline
  `var()` resolves against the document — that is the whole mechanism, already shipped
  and specified ("Host scheme switching flows through").
- `chromeCss(palette, { prefix, selector, darkMediaSelector, darkSelector })` renders the
  page-side properties, dark toggle included. widgentic.dev drives its theme switcher
  entirely through these two pieces; the demo's Dracula toggle is the same shape.
- The theme-switcher change's task 6.5 (apps repo, archived `2026-08-31-theme-switcher`)
  wrote out `appearanceFrom` and `setAppearance()` as candidate package APIs. The review
  found `appearanceFrom`'s sketch fixes pinned-dark but not pinned-light (a media block
  cannot be un-matched from an ancestor, so the host's light pin must be woven into the
  media guard), and a full version needs a 9-state precedence over host-attribute ×
  `appearance` plus document-global first-mount-wins configuration. `setAppearance()`
  needs an event for live mounts AND an `appearance` pass at every remount site — two
  paths a host must keep agreeing.

## Goals / Non-Goals

**Goals:** the pattern two hosts hand-roll becomes one exported call plus a documented
recipe; custom chrome — the thing developers actually reach for — is the headline, with
scheme-following presented as what it is: a special case of it.

**Non-Goals:** any new scheme mechanism (`appearanceFrom`, `setAppearance`, stylesheet
options, handle API growth); changing `appearance` semantics; touching the injected
stylesheet; altering the docker example and `examples/shared` (they deliberately pass
no `chrome` — the package default IS the product palette); restoring an independent designer fallback for full-reference hosts (see R1).

## Decisions

**A1 — A helper, not a mechanism.** `chromeReferences(prefix = "--host")` returns
`Object.fromEntries(CHROME_TOKENS.map((t) => [t, `var(${prefix}-${t})`]))` — nothing
more. One mechanism (`chrome`) keeps carrying both partial brand overrides and full
host-palette takeover; there is no second scheme system to document, no precedence
question, no document-global state. The rejected alternatives are recorded in the
theme-switcher change's design (task 6.5) and summarized in Context.

**A2 — The map is COMPLETE, including typography.** Filtering `font`/`font-mono` out (as
widgentic.dev's hand-rolled map does) would bake one host's preference into the API.
Spread-override is the idiom: `{ ...chromeReferences(), font: "...", "font-mono": "..." }`.
A host that leaves the font references in place and defines `--host-font` on the page is
equally correct.

**A3 — The caveat is documentation, not code.** A reference to an undefined page property
is guaranteed-invalid at computed-value time — no fallback to `CHROME_DEFAULTS`. Emitting
per-token fallbacks (`var(--host-bg, #f6fafc)`) is rejected: a fallback is one value, so
it would pin the light palette under a dark system — wrong rather than merely unstyled —
and it would restate 26 literals the "derived, not copied" rule exists to forbid. The
recipe therefore always pairs the map with `chromeCss` under the same prefix, and the
helper's doc says why.

**A5 — The demo adopts (deviation found during apply).** The plan assumed the demo's
Dracula map was partial and left it alone; reading it showed the opposite — all 28
tokens, 20 hand-written `var(--host-*)` references, page painted by `chromeCss` under
the same prefix. That is the helper's exact use case, so the demo now spreads
`chromeReferences()` and overrides its eight deliberate differences (typeface pair,
three sizes, two radii, gap) — the living example of the spread-override idiom.

**A4 — Recipe placement.** The designer README's chrome section and the hand-written docs
page that documents the `chrome` option gain the same three-part recipe: partial override
(defaults fall through), full takeover (`chromeCss` + `chromeReferences`, toggle included
via `darkSelector`), the caveat. Generated pages are untouched — this is host wiring, not
guide/validator content.

## Risks / Trade-offs

- [R1 — A full-reference host loses the designers' independent fallback when its page
  palette is missing] → same failure domain as the host's own shell (the page is equally
  unstyled), stated in the docs; the alternative (per-token fallbacks) is wrong under a
  dark system (A3).
- [R2 — Two sources for the same map while the apps repo has not adopted yet] → the apps
  map is generated from the same `CHROME_TOKENS` iteration, so they cannot diverge in
  content; the adoption is a two-line diff on the next bump.

## Migration Plan

Additive minor of `@widgentic/designer`. Downstream: `widgentic/apps` swaps its generated
map for the helper on its next bump (reverting the theme-switcher amendment to "the app
passes typography and nothing more"); nothing else changes anywhere.
