## 1. The helper

- [x] 1.1 `packages/designer/src/chrome-defaults.ts`: `chromeReferences(prefix = "--host"): ChromeOptions` — every `CHROME_TOKENS` entry mapped to `var(<prefix>-<token>)` by iteration (design A1, A2), with a doc comment carrying the no-fallback caveat and the `chromeCss` pairing (design A3). Export through the package barrel.
- [x] 1.2 Unit tests beside the chrome tests: the default and a custom prefix each yield an entry for every documented token and no value literal; the returned object is fresh per call; the result passes `applyChrome` untouched (every entry lands inline).
- [x] 1.3 The mounted-toggle scenario as a test: a page styled by `chromeCss(CHROME_DEFAULTS, { prefix: "--host", selector: ":root", darkSelector: ':root[data-theme="dark"]' })`, a designer mounted with `chromeReferences()` as `chrome`, flip the attribute — computed chrome colours follow with no remount (happy-dom computed values; mark any jsdom/happy-dom limitation honestly and fall back to asserting the inline references plus the stylesheet blocks if computed `var()` resolution is not faithful there).

## 2. The recipe in the docs

- [x] 2.1 `packages/designer/README.md` chrome section: partial override (defaults fall through), full takeover (`chromeCss` + `chromeReferences`, explicit toggle via `darkSelector`), the caveat — three short blocks (design A4).
- [x] 2.2 `docs/develop/embed-the-designers.mdx`: the same recipe where the chrome tokens are documented; state the caveat in the page's own words.
- [x] 2.3 A test pinning the documented caveat where the repo's doc tests live (the README/docs mention the no-fallback behavior and the pairing).

## 3. Surface bookkeeping

- [x] 3.1 `tools/exports.test.ts` snapshot: `chromeReferences` appears in the `@widgentic/designer` block and nowhere else.
- [x] 3.2 Changeset: minor for `@widgentic/designer`.
- [x] 3.3 README capability row check: the designer row enumerates the three designers, not helpers — no edit needed.

## 3a. Examples (deviation — design A5)

- [x] 3a.1 `examples/designer/main.ts`: the demo's hand-written 20-reference Dracula map becomes `{ ...chromeReferences(), <its eight deliberate overrides> }`; `examples/shared` and the docker example stay chrome-less on purpose (package default = product palette).

## 4. Gate

- [x] 4.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check` all green.
- [x] 4.2 `openspec validate --strict designer-chrome-recipe` and `openspec validate --specs`.

## 5. Downstream note (apps repo, after release — not this change's tasks)

`widgentic/apps` on its next bump: `apps/web/designer-chrome.ts` → `{ ...chromeReferences(), font, "font-mono" }`; revert the theme-switcher amendment sentence; deploy and verify the switcher still repaints all four designers.
