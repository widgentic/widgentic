# Design — The widgentic palette as the designers' default chrome

## Context

See proposal.md — Why. The mechanics that constrain the approach:

- `CHROME_TOKENS` (`packages/designer/src/dom.ts`) is 28 tokens: 18 colours,
  5 typography, 4 shape, 1 elevation. `applyChrome` writes a host's partial map
  as **inline** custom properties on `.wgd-root`, which outranks every rule in
  the injected stylesheet — so a host override always wins regardless of what
  the defaults are.
- Defaults live in three blocks of that stylesheet: `.wgd-root` (light),
  `@media (prefers-color-scheme: dark) .wgd-root:not([data-wgd-theme="light"])`,
  and `.wgd-root[data-wgd-theme="dark"]`. The scheme mechanism already works
  and is not being touched — only the values in the blocks.
- The canonical brand values are in the private `apps/web/index.html` `:root`
  blocks. `examples/designer`'s brand toggle is a drifted copy (five tokens),
  and `apps/web/main.ts`'s `DESIGNER_CHROME` covers 17 of 28 — the five `hl-*`
  highlighting tokens are among the eleven it misses, which is why our own
  designers still highlight JSON in the stock palette.
- The accent is `#1E6F92`, not the logo's widget blue `#40A0C8`: the docs a11y
  pass measured widget blue at below 3:1 on the light background and the link
  blue at 5.61:1. Whatever this change ships has to be measured the same way.

## Goals / Non-Goals

**Goals:** one source of truth for the widgentic look; our app and every
example consistent with no configuration; the palette readable as data so a
host page can match without retyping it.

**Non-Goals:** new tokens; changing the scheme mechanism or `applyChrome`;
webfonts; theming widget previews (`--wg-*` belongs to widget-theming);
changing anything in `widgentic/apps` (it adopts later, and gets simpler when
it does).

## Decisions

**B1 — Re-value the default blocks; change no mechanism.** The three token
blocks get widgentic values; `applyChrome`, the `data-wgd-theme` override, the
attribute form and the precedence rules are untouched. Every existing host that
passes `chrome` is unaffected, because inline properties already win. The
change is therefore visible exactly to hosts that configured nothing — which is
the population it is aimed at.

**B2 — Colour and shape, not typography.** Radii move to 4/6/8 (what
`DESIGNER_CHROME` already asks for); `font`, `font-mono` and the three sizes
stay as they are. A library that defaults to "Source Sans 3" either fetches a
font the host never asked for or silently falls back, so the designers would
look different depending on whether the host happens to serve it. Brand
recognition lives in colour; widgentic.dev keeps one `chrome` line for its
typeface, which is the right place for it.

**B3 — Export the palette as data, and make the stylesheet derive from
it.** `CHROME_DEFAULTS = { light, dark }` is a pair of
`Record<ChromeToken, string>` maps in a new `chrome-defaults.ts`; the
injected stylesheet's blocks are generated from `CHROME_DEFAULTS` rather
than written beside it. That is the difference between an export that documents
the default and an export that *is* the default — the spec's "the exported
palette is the applied palette" scenario is then a tautology the code
guarantees, not a promise a future edit can break.

**B4 — `chromeCss(palette, prefix)` so host pages stop copying.** Returns the
light and dark `:root` declaration blocks for a chosen prefix. The four hand
copies exist because there was nothing to import; this is that thing.
`examples/designer` and the private shell both become derived. It is a string
builder, not a CSS-in-JS layer — no runtime injection, no dependency.

**B5 — Contrast is a computed-value test, not a review note.** The repository
has been bitten by text-regex assertions over stylesheets passing regressions
through, so the check parses the token pairs and computes WCAG ratios: text on
`bg` and on `panel` at AA body text; `muted` at AA body text; each `hl-*` on
`panel` at AA body text; `accent` on `bg`/`panel` and `border`/`line` against
their surfaces at the 3:1 non-text threshold; the same in dark. The values
below were run through this gate and seven of them moved; the corrections are
tabulated in B6 and are what the app and landing page should adopt.

**B6 — Values derived from the logo, not picked by eye.** The mark
(`assets/brand/logo.svg`) is two colours: `#40a0c8` and `#0a0a0a`. Everything
here sits on that blue's hue, **197.6deg**. Surfaces, text and accents keep the
product's existing values (they already pass); the three boundary tokens are
*solved*, not chosen — each is the lightest value on the hue that still clears
3:1 against the surface it sits on, so the chrome is no heavier than
accessibility requires.

| | light | dark |
|---|---|---|
| bg / panel | `#f6fafc` / `#ffffff` | `#0b141b` / `#10202a` |
| text / muted | `#0b1b26` / `#56707f` | `#e6f0f5` / `#93a9b6` |
| accent / -bg | `#1e6f92` / `#e3f1f7` | `#8acbe6` / `#14303d` |
| danger / -bg | `#b42318` / `#fdf2f2` | `#f0a3a3` / `#2a1a1c` |
| line / hover (decorative) | `#e4ecf2` / `#eef5f9` | `#1b2f3d` / `#152a36` |
| **border** (solved, 3:1) | **`#6e95a6`** | **`#437082`** |
| **accent-line** (solved, 3:1) | **`#4b91ae`** | **`#3e7e98`** |
| **danger-line** (solved, 3:1) | **`#c97572`** | **`#a3524f`** |
| hl key/str/num/bool/punct | `#1e6f92` `#2e7d5b` **`#96620f`** `#7a4fbf` `#56707f` | `#8acbe6` `#6cc79a` `#e0b25a` `#bb9af7` `#93a9b6` |
| shadow | `0 8px 24px -12px rgba(11, 27, 38, 0.35)` | `0 8px 24px -12px rgba(0, 0, 0, 0.7)` |

**Corrections the gate forced** (B5 said a failing value moves; these are the
ones that moved, and they are the values the app and the landing page should
adopt):

| token | was (app/landing) | now | why |
|---|---|---|---|
| `hl-num` light | `#b7791f` | `#96620f` | 3.64 on white, below the 4.5 body-text threshold; now 5.18 |
| `border` light | `#d3e0e8` | `#6e95a6` | 1.28 against `bg`; an input's border is the only thing identifying it (1.4.11). Now 3.07 |
| `border` dark | `#22394a` | `#437082` | 1.39 against `panel`; now 3.07 |
| `accent-line` light | `#a9d3e6` | `#4b91ae` | 1.38 on `accent-bg`; it carries the tag focus ring. Now 3.05 |
| `accent-line` dark | `#2b5f78` | `#3e7e98` | 1.98; now 3.05 |
| `danger-line` light | `#f0b4b4` | `#c97572` | 1.61 on `danger-bg`; now 3.06 |
| `danger-line` dark | `#5c2b2b` | `#a3524f` | 1.45; now 3.07 |

**B6a — What the gate covers, and what it deliberately does not.** Gated at
4.5:1: every text pair, including the five `hl-*` on `panel`. Gated at 3:1 the
tokens WCAG 1.4.11 actually reaches — `border` (the sole identifier of
`.wgd-input`, `.wgd-select`, `.wgd-button`, `.wgd-icon`, `.wgd-swatch`, all
filled with the surface colour behind them), `accent-line` (the
`.wgd-tag:focus` ring) and `danger-line` (the banner outline). NOT gated, with
reason: `line`, which paints only tree indent guides and a grouping outline —
decorative, nothing is identified by it; and `hover`, a supplementary state
tint that no component depends on for identification and which at 3:1 would
become a slab. `NEUTRAL_CHROME` is not gated at all — its contract is to
reproduce the previous appearance exactly, so no value may move; its six light
and four dark shortfalls are pinned in the test instead, which is the plainest
argument for the product palette being the default: it is the accessible one.

**B7 — The old promise is narrowed, not renamed.** *"Nothing changes for hosts
that pass nothing"* cannot be dropped — `openspec validate` refuses a MODIFIED
requirement that omits an existing scenario title, and rightly, since a rename
reads as a deletion. It is instead narrowed to the half that stays true: a host
that passes nothing still configures nothing, and its typography and spacing
are untouched (B2). The colour and shape half moves to a new scenario beside
it. The two triggers are the same; the assertions are disjoint.

**B8 — Widget blue has no chrome token, and does not get one here.** `#40A0C8`
is the logo and the app's focus ring; the designers' focus treatment uses
`accent`. Adding a 29th token (`focus`) is an API addition with its own
stylesheet work, and it is not what makes the designers look like widgentic.
Backlog, not this change.

## Risks / Trade-offs

- [A visual change lands on hosts that never asked for one] → semver-visible in
  the changeset and the changelog, and the population is empty: 0.2.0 was
  published a day before this change (B9).
- [Opinionated default for third-party embedders] → intended: the point is that
  the designers are recognisable. `chrome` has always been the override, and
  `chromeCss` now renders a host's own palette for its page too.
- [A brand value fails contrast] → then it fails the build before it ships, and
  the corrected value is the one the app should have been using. Better found
  by a test here than by a reader with low vision later.
- [`hl-*` values have never been used anywhere but a demo toggle] → they are
  the least-proven part of the palette; the contrast gate covers legibility,
  and the visual review covers the rest.
- [Deriving the stylesheet from a constant could change output subtly] → the
  stylesheet snapshot and the "no stray literals" scenario both still apply,
  and the computed-token scenarios pin the result.

## Migration Plan

1. Land here; `@widgentic/designer` 0.2.0 → 0.3.0.
2. `self-host-example` then plans against the new default: it sets no `chrome`
   at all, and `examples/shared` drops its chrome map (its `host.css` becomes
   `chromeCss()` output).
3. `widgentic/apps`, its own change after the release: `DESIGNER_CHROME` shrinks
   to the typography line and the shell's `--host-*` block is derived from the
   export. Optional and unblocking nothing.

**B9 — One palette ships; the compatibility palette was built and dropped.**
`NEUTRAL_CHROME` was implemented, gated, and then removed on the user's call
once the numbers were in: `@widgentic/designer@0.2.0` published 2026-08-29,
one day before this change, and last week's 92 downloads are registry mirrors
and our own CI. The escape hatch therefore protected nobody, while putting a
palette in the public API that our own gate recorded as failing ten pairs.
Anyone wanting a different look writes their own values — which is what
`chrome` has always been for — and `chromeCss` renders them for the
surrounding page. The demo's toggle now shows exactly that, using **Dracula**
(Zeno Rocha, MIT) rather than a palette invented for the occasion: of the
well-known themes measured against our own thresholds it behaves best by a
distance (Dracula 2 failing pairs on the core set, Nord 6, Solarized 8 light /
10 dark), and its shortfalls are all its Comment and selection tones — an
editor theme optimises for reading code, not for UI chrome. The demo reports
that in its status line, which makes the point the spec now states normatively:
pass your own palette and the contrast is yours to own.

Rollback: revert the value blocks. The exports can stay — they are useful
regardless of which palette is the default.

## Open Questions

- Whether `gap` should follow the app's denser rhythm rather than staying 16px.
  It changes layout rather than colour, so it is left alone unless the visual
  review says otherwise — answerable after the first screenshot, without
  changing the spec or the task breakdown.
