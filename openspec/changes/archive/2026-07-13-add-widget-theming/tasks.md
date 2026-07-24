## 1. Module scaffolding

- [x] 1.1 Create `src/theming/` with `index.ts` (public exports), `tokens.ts` (`THEME_TOKENS`, token defaults table, `WidgetTheme`, `ThemeError`, value-safety guard), `stylesheet.ts` (`baseStylesheet`, `injectBaseStyles`), and `apply.ts` (`validateTheme`, `applyTheme`, `themeToCss`, `darkTheme`)
- [x] 1.2 Add `./theming` entry to `package.json` `exports`
- [x] 1.3 Update `openspec/config.yaml` project context: replace the "no theming system beyond minimal density hints" non-goal (superseded by this capability)

## 2. Tokens and stylesheet

- [x] 2.1 Define the token registry with light-theme defaults (`bg`, `fg`, `muted`, `accent`, `border`, `radius`, `spacing`, `font-family`, `font-size`, `shadow`)
- [x] 2.2 Generate `baseStylesheet` from the defaults table: rules for `wg-card*`, `wg-table*`, `wg-tree*`, `wg-custom`, `wg-template`, every declaration through `var(--wg-<token>, <fallback>)`
- [x] 2.3 Implement `injectBaseStyles(doc)`: `<style data-widgentic>` appended to `head`, idempotent

## 3. Themes as data

- [x] 3.1 Implement `validateTheme`: `INVALID_THEME` for non-objects, `UNKNOWN_TOKEN` against the registry, `INVALID_TOKEN_VALUE` for non-strings and unsafe values (`; { } < >` and case-insensitive `url(`)
- [x] 3.2 Implement `applyTheme`: remove previous `--wg-*` inline properties, `style.setProperty` each valid token, skip invalid entries silently
- [x] 3.3 Implement `themeToCss(theme, selector?)`: emit only validated entries under the selector
- [x] 3.4 Define the `darkTheme` preset as plain theme data

## 4. Tests

- [x] 4.1 Registry/stylesheet tests: token list, `wg-*` class coverage, every `--wg-*` reference in the stylesheet is a registry token with a fallback
- [x] 4.2 Validation tests: valid themes (colors, font stacks), `UNKNOWN_TOKEN` with token name, injection attempts (`; } body {`, `url(`, `<`) rejected, `darkTheme` passes
- [x] 4.3 Apply tests (happy-dom): tokens as inline custom properties, replace semantics, empty-theme reset, invalid entries skipped, two containers with different themes
- [x] 4.4 Stylesheet/injection tests (happy-dom): `injectBaseStyles` idempotent, marked style element in `head`
- [x] 4.5 `themeToCss` tests: selector rule with declarations, unsafe values never emitted
- [x] 4.6 Type tests (`types.test-d.ts`): `WidgetTheme` shape, `validateTheme` narrowing, `ThemeError` codes
- [x] 4.7 Integration test (happy-dom, package entries): inject base styles, mount a widget via `widgentic/reactive`, apply `darkTheme` to the container, assert custom properties are readable on the widget subtree

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Confirm `widgentic/theming` resolves via package exports (import through the package entry in a test)
