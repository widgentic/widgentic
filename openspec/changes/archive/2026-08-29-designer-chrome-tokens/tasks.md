## 1. Tokens and stylesheet

- [x] 1.1 `dom.ts`: `CHROME_TOKENS` tuple (28 names), `ChromeToken`, `ChromeOptions`; `applyChrome(root, chrome)` (filter to known tokens, string values, no CSS-wide keywords, `setProperty`); `parseChromeAttribute(value)` (JSON → `ChromeOptions | undefined`)
- [x] 1.2 `dom.ts`: add `--wgd-font`, `--wgd-font-mono`, `--wgd-font-size`, `--wgd-font-size-sm`, `--wgd-font-size-xs`, `--wgd-radius-sm`, `--wgd-radius`, `--wgd-radius-lg`, `--wgd-gap`, `--wgd-shadow` defaults to the `.wgd-root` block; replace every `font-family`, `font-size`, `font:` shorthand, `border-radius` (3/4/6 px) and the menu `box-shadow` literal with the tokens (10 px glyphs via `calc(var(--wgd-font-size-xs) - 1px)`); root `gap` via token; delete the five `var(--wgd-…, #hex)` and the preview's two `var(--wg-…, #hex)` dead fallbacks

## 2. Option and attribute

- [x] 2.1 `shell.ts`, `theme-designer.ts`, `schema-designer.ts`, `action-designer.ts`: `chrome?: ChromeOptions` in options, applied to the root after `appearance`
- [x] 2.2 `element.ts`: read the `chrome` attribute through `parseChromeAttribute` for all four elements; invalid → ignored
- [x] 2.3 `index.ts`: export `CHROME_TOKENS`, `ChromeToken`, `ChromeOptions`; update `tools/exports.test.ts` snapshot

## 3. Tests and docs

- [x] 3.1 Designer tests (`chrome.test.ts`): inline properties for a host map (incl. `var()` values) on all four factories, unknown keys / non-strings / CSS-wide keywords ignored, element attribute (valid, invalid JSON, non-object), no-`chrome` defaults (token block declares the documented values), preview `--wg-*` unaffected
- [x] 3.2 Stylesheet audit test: outside the token blocks no colour / typeface / `px` font-size / `px` border-radius / shadow literals, and no `var()` fallbacks
- [x] 3.3 `packages/designer/README.md`: "Theming the chrome" (token table, option, attribute, `var()` pattern, the keyword rule); `examples/designer`: a chrome preset toggle to eyeball it; `TESTING.md` entry with the headless-Chrome computed check (before/after defaults, host map applied) — check driven by the new dependency-free `tools/probe-computed.mjs` (CDP over Node's fetch + WebSocket; the devtools MCP is headful and this VM has no X server)
- [x] 3.4 Changeset (`@widgentic/designer`: minor); `npm run typecheck && npm test && npm run build && npm run pack:check && openspec validate --strict designer-chrome-tokens` green

## 4. Downstream (after release, in widgentic/apps — not part of this change's gate)

- 4.1 Bump `@widgentic/designer` to `^0.2.0`, declare `--host-font`, replace the `#app-view .wgd-root` override with `chrome: {…}` on the four mounts, deploy `vNN`, verify computed chrome in both schemes, RUNBOOK entry
