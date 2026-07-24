## Why

The built-in widgets emit stable `wg-*` classes — spec'd as the styling contract — but ship no styles, so every host renders unstyled markup and invents its own CSS. The product goals include predefined stylesheets and customer-defined themes; consistent with the rest of widgentic, a theme should be *data* (a token map a theme designer can produce and validate), not hand-written CSS.

## What Changes

- Add `src/theming/` exported as `./theming`:
  - **Token registry**: a documented set of `--wg-*` CSS custom-property tokens (`bg`, `fg`, `muted`, `accent`, `border`, `radius`, `spacing`, `font-family`, `font-size`, `shadow`) exported as `THEME_TOKENS`; a `WidgetTheme` is a plain map of token names to values.
  - **Predefined stylesheet**: `baseStylesheet` — a CSS string styling every `wg-*` class (card, table, tree, custom, template wrapper) exclusively through `var(--wg-*, fallback)`, so untouched output looks good and every visual knob is themeable; `injectBaseStyles(doc)` idempotently adds it as a `<style>` element.
  - **Themes as data**: `validateTheme(input)` (structured `ThemeError`s — unknown tokens, unsafe values), `applyTheme(container, theme)` (scoped: sets `--wg-*` properties inline on the container, replacing previously applied ones), and `themeToCss(theme, selector?)` for hosts that prefer generated stylesheets.
  - **Presets**: `darkTheme` (and the implicit light defaults via stylesheet fallbacks) as ready-made `WidgetTheme` data.
- Safety for designer/customer-authored themes: token names must come from the registry; values are rejected if they could escape a declaration or fetch resources (`;`, `{`, `}`, `<`, `>`, `url(`). `applyTheme` uses `style.setProperty` (no CSS parsing); `themeToCss` only emits validated tokens.
- Update `openspec/config.yaml` project context: the foundation-phase non-goal "no theming system beyond minimal density hints" is superseded by this capability.
- Vitest coverage: stylesheet content, validation (including injection attempts), scoped apply/replace semantics (happy-dom), preset validity, and an integration test of a themed, mounted widget.
- Zero new dependencies; no changes to renderer output (classes stay the only hook).

Out of scope: a theme designer UI, per-widget style overrides beyond tokens, CSS shipping as separate `.css` files (the string export is the single source of truth; hosts can emit files from it), dark-mode auto-detection.

## Capabilities

### New Capabilities
- `widget-theming`: Token registry, predefined base stylesheet over `var(--wg-*)`, theme validation with structured errors, scoped theme application, CSS generation, and presets.

### Modified Capabilities
<!-- None. widget-catalog's "Stable class names" requirement is the hook this builds on; renderer behavior is unchanged. -->

## Impact

- New code: `src/theming/` with `index.ts`, `tokens.ts`, `stylesheet.ts`, `apply.ts`, and `__tests__/`.
- New package entry: `./theming` in `package.json` `exports`.
- Config: `openspec/config.yaml` non-goals updated (theming graduates from the foundation phase).
- Depends on: nothing beyond DOM types; composes with catalog/reactive output via the `wg-*` classes. No new dependencies.
- Downstream: a theme designer produces `WidgetTheme` JSON validated by `validateTheme`; hosts get styled widgets by injecting one stylesheet and optionally applying themes per container.
