## 1. The palettes as data

- [x] 1.1 `packages/designer/src/chrome-defaults.ts`: the module that owns the token list and the palette. A compatibility palette was built here and then dropped — one palette ships (design B9).
- [x] 1.2 Same file: `CHROME_DEFAULTS = { light, dark }` with the candidate widgentic values (design B6) — colours and radii 4/6/8 changed, typography tokens and gap carried over from the neutral palette unchanged (design B2).
- [x] 1.3 `chromeCss(palette, prefix = "--wgd")`: returns the light and dark declaration blocks as a string, so a host page's palette is derived rather than copied (design B4). Pure string building; no injection, no dependency.
- [x] 1.4 Export `CHROME_DEFAULTS` and `chromeCss` from `packages/designer/src/index.ts`. The `/browser` entry is registration-only (`export {}`), so the constants are not importable from it by design; the bundle carries the palette values because the stylesheet is generated from them, and a script-tag host overrides through the `chrome` attribute.

## 2. The stylesheet derives from the constant

- [x] 2.1 `packages/designer/src/dom.ts`: build the three token blocks in `injectDesignerStyles` from `CHROME_DEFAULTS` instead of literal declarations — light on `.wgd-root`, dark under both the media query and `[data-wgd-theme="dark"]`, exactly as the current structure does (design B1, B3).
- [x] 2.2 Leave `applyChrome`, the token list, the attribute form and the precedence rules untouched; a host's inline properties keep winning.
- [x] 2.3 Confirm the "no stray literals" guarantee still holds: no colour, typeface, font size, radius or shadow literal anywhere in the stylesheet outside the generated blocks.

## 3. Contrast gate

- [x] 3.1 `packages/designer/src/__tests__/chrome-contrast.test.ts`: parse both palettes and compute WCAG ratios over the pairs that matter — `text` on `bg` and on `panel`, `muted` on `panel`, each `hl-*` on `panel` (AA body text); `accent` on `bg` and `panel`, `border` and `line` against their surfaces (3:1 non-text); `danger` on `danger-bg`; both schemes (design B5).
- [x] 3.2 Move any candidate value that fails, and record the correction in the design doc so the same value goes back to the app.
- [x] 3.3 Computed-value checks that the defaults actually apply: a designer mounted with no `chrome` computes the exported palette for its scheme, and the exported palette equals the applied one token for token.

## 4. Behaviour tests

- [x] 4.1 Extend `packages/designer/src/__tests__/chrome.test.ts`: a host palette replaces every token; a partial host map still overrides the new defaults; unknown tokens and CSS-wide keywords are still ignored.
- [x] 4.2 `chromeCss` output: every token declared under the given prefix, both schemes, no value written by hand.
- [x] 4.3 `tools/exports.test.ts`: review the `@widgentic/designer` snapshot — two new names.

## 5. Examples and docs

- [x] 5.1 `examples/designer`: derive the page's `--host-*` block from `chromeCss(CHROME_DEFAULTS, { prefix: "--host" })`, pass no `chrome` by default, and re-point the toggle so it demonstrates a host writing its OWN palette (Dracula, MIT). The toggle, seeds, localStorage and tab behaviour stay as they are.
- [x] 5.2 `docs/develop/embed-the-designers.mdx`: the default is now the widgentic palette; how to match a host page with `chromeCss`; how to bring your own palette; typography stays the host's business.
- [x] 5.3 `packages/designer/README.md` and the root `README.md` designer section: same three points, briefly.
- [x] 5.4 Changeset: minor for `@widgentic/designer`, calling the visual change out plainly.

## 6. Gate

- [x] 6.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check`, `npm run docs:check` green.
- [x] 6.2 `npm run designer` and a screenshot of both schemes reviewed before release — the one part a test cannot judge (design, Open Questions: `gap`).
- [x] 6.3 `openspec validate --strict designer-brand-chrome` and `openspec validate --specs` green.
- [x] 6.4 Record in `TESTING.md` that the designer chrome default changed, with the opt-out, so a later regression report is read correctly.
