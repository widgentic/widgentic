# Tasks — Verification fixes

## 1. CRITICAL — `surface` no longer inherits `bg` (live in production)

- [x] 1.1 `TOKEN_SPECS` gains an optional `fallback` token field; `surface` declares `fallback: "bg"`
- [x] 1.2 Fallbacks resolve at THEME-APPLICATION time (`withFallbacks` in apply.ts), not in the `:root` block — a `:root` chain substitutes against `:root`'s own `--wg-bg` and inherits that resolved value, so a descendant override never reaches it (proved in Chrome before and after)
- [x] 1.3 Computed-value test (real cascade, not CSS text): a `bg`-only theme colors `.wg-card`/`.wg-custom` with that bg, AND a bare `var(--wg-surface)` still resolves
- [x] 1.4 Verify the page/app-template surfaces are unaffected; full gate

## 2. CRITICAL — reserved theme names accepted then dropped

- [x] 2.1 `checkStoredTheme`: refuse built-in registry names with `RESERVED_THEME` (names read from `createThemeRegistry()`, not restated)
- [x] 2.2 API maps it to 422 like `RESERVED_KIND`
- [x] 2.3 Tests: write refused; a store already holding `dark` skips it on compose with a diagnostic; `dark` still resolves to the built-in

## 3. CRITICAL — the preview can render blank

- [x] 3.1 `preview.ts`: when there is nothing to freeze on, render an explicit empty state instead of returning with an empty pane
- [x] 3.2 Tests: invalid `initialWidget` and reserved-kind `initialWidget` both leave a non-empty pane plus the banner

## 4. CRITICAL — theme validation errors never surface

- [x] 4.1 `theme-panel.ts` gains a diagnostic line; `panels.ts` wires `diagnostics.theme` into the fan-out
- [x] 4.2 Test: an unsafe token value in the selected theme shows the validator's error

## 5. CRITICAL — the README deploy recipe damages production

- [x] 5.1 Replace the two-parameter recipe with the standing parameter set + a pointer to the redeploy contract

## 6. Warnings

- [x] 6.1 `tsconfig.build.json`: add `rootDir` so `npm run build` works again (TS5011)
- [x] 6.2 Read-only leaves the Export section operable
- [x] 6.3 Theme designer splits Import / Export into two sections, import first
- [x] 6.4 Guide derives the custom-variable pattern, style ban list, property allowlist and pattern cap from their constants

## 7. Docs

- [ ] 7.1 README: 5 tools; `render_widget` input incl. `format`/`theme` (+ the name-over-map steering); `widgentic-change` attributed to the elements, `subscribe` to the factories; twelve capabilities; test count; designer surface (readOnly/setReadOnly/widgets/handles) and the reworked UI; token-defaults note
- [ ] 7.2 TESTING: `npm run designer` row; `get_authoring_guide` + wire-description smoke checks; current deployed version; the v19/v20/v22 live findings in the verification log

## 8. Ship

- [ ] 8.1 Full gate + strict validation
- [ ] 8.2 Rig check on the affected surfaces
- [ ] 8.3 Build and deploy; verify the surface fix live
- [ ] 8.4 Commit and push
