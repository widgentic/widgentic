## Context

The catalog spec guarantees stable `wg-*` classes as the styling contract, and the template module established the pattern for user-authored data artifacts (strict validation with structured errors, lenient-and-safe runtime). Theming applies both: predefined styles must work with zero setup, and customer themes must be data a designer can produce, validate, and store. Threat model matches templates — theme authors are untrusted; CSS is an injection surface (declaration escape, `url()` exfiltration).

## Goals / Non-Goals

**Goals:**
- Good-looking defaults from one stylesheet injection; every visual knob a token.
- Themes as validated JSON token maps; per-container (scoped) application so one page can host differently themed widgets.
- Same module conventions as the rest of the repo: zero dependencies, structured errors, totality at runtime, `container.ownerDocument` discipline.

**Non-Goals:**
- No theme designer UI; no per-widget-kind style overrides (tokens are global to a scope); no CSS-in-JS runtime; no automatic `prefers-color-scheme` switching (hosts can apply `darkTheme` themselves); no `.css` file packaging.

## Decisions

### Decision 1: The stylesheet is a TS string constant, not a shipped `.css` file
`baseStylesheet` is an exported string; `injectBaseStyles(doc)` adds it once (idempotent via a `data-widgentic` marker on the `<style>` element). A `.css` file in `exports` would be a second source of truth, needs bundler cooperation, and can't be generated from the token registry. A host that wants a file writes the string to one at build time.

### Decision 2: Every declaration goes through `var(--wg-<token>, <fallback>)`
The stylesheet references only registry tokens with light-theme fallbacks baked in. Consequences: untouched output is the light theme; a theme never needs to be "complete" (unset tokens fall back); and the registry is enforceable — a token used in the stylesheet but missing from `THEME_TOKENS` is a bug tests can catch by scanning the string.

### Decision 3: Theme keys are bare token names; prefixing is ours
`WidgetTheme = { bg?: "#0b0e14", accent?: "...", ... }` — keys without `--wg-`. The module owns the mapping to `--wg-bg` etc. This makes unknown-token validation trivial, keeps theme JSON clean for designers, and structurally prevents themes from setting arbitrary CSS custom properties (`--anything-else` is unrepresentable).

### Decision 4: Scoped application via inline custom properties
`applyTheme(container, theme)` sets `--wg-*` with `style.setProperty` on the container and first removes any `--wg-*` properties it previously set (replace semantics — re-theming never accumulates stale tokens). Inline custom properties inherit down the subtree, so scoping is free and two containers can carry different themes. `setProperty` assigns a value into the CSSOM without parsing a stylesheet, so declaration-escape injection is structurally impossible on this path.

*Alternative considered*: generated `<style>` with a scope class — needed for pseudo-elements/media queries someday, but heavier (style element lifecycle) and reintroduces string-building on the hot path. `themeToCss(theme, selector = ":root")` covers the stylesheet-preferring host explicitly instead.

### Decision 5: Validation strict, application total — and both share the guards
`validateTheme` rejects non-object input (`INVALID_THEME`), keys outside `THEME_TOKENS` (`UNKNOWN_TOKEN`), and non-string or unsafe values (`INVALID_TOKEN_VALUE`): values containing `;`, `{`, `}`, `<`, `>`, or `url(` (case-insensitive) are refused — they cover declaration escape, HTML-context leakage, and resource fetching. `applyTheme`/`themeToCss` skip anything invalid at runtime (defense in depth, same two-layer pattern as templates). Legitimate values — colors, lengths, font stacks with commas/quotes, `rgb()/hsl()` — pass untouched.

### Decision 6: Presets are ordinary theme data
`darkTheme` is exported as a `WidgetTheme` literal that passes `validateTheme` (asserted by a test). No special casing: presets prove the format is sufficient and serve as designer starting points. The light look intentionally has no preset object — it is the fallback state, so "reset to light" is `applyTheme(container, {})`.

## Risks / Trade-offs

- [Value guard may reject exotic-but-legit CSS (e.g. gradients with `url()`, custom `@font-face` needs)] → tokens are colors/lengths/fonts by design; gradients minus `url()` still pass. Extending the registry is a spec-level change, which is the right friction.
- [Inline custom properties have high specificity; host stylesheets can't override them without `!important`] → that is the intended contract: themes win over host CSS within their scope; hosts wanting CSS control simply don't call `applyTheme`.
- [Baked-in fallbacks duplicate the light values across declarations] → the stylesheet is generated from one token-default table in `tokens.ts` at module load, so values exist exactly once in source.
- [happy-dom CSSOM fidelity for custom properties] → `setProperty`/`getPropertyValue` round-trips are exactly what the tests assert; catalog/reactive suites already established happy-dom's reliability for the operations we use.
- [Stale non-goal in project context confuses future artifact generation] → updating `openspec/config.yaml` is an explicit task in this change.
