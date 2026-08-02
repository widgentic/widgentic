# widget-theming Specification

## Purpose
Predefined styles and data-driven themes for the stable `wg-*` widget classes. A token registry (`--wg-*` custom properties) backs a generated base stylesheet with light defaults; a theme is a validated JSON token map applied per container (scoped, replace semantics) or emitted as CSS. Theme values from untrusted authors cannot escape declarations or fetch resources.
## Requirements
### Requirement: Theming programmatic surface
The package SHALL export from a `./theming` entry: `THEME_TOKENS` (the token registry), the `WidgetTheme` and `ThemeError` types, `baseStylesheet` (string), `injectBaseStyles(doc: Document): void`, `validateTheme(input: unknown)`, `applyTheme(container: Element, theme: WidgetTheme): void`, `themeToCss(theme: WidgetTheme, selector?: string): string`, and the `darkTheme` preset. Themes SHALL be plain JSON-serializable maps of bare token names to string values. The `darkTheme` preset SHALL set `surface` to a value distinct from its `bg`.

#### Scenario: Token registry is exported
- **WHEN** `THEME_TOKENS` is imported
- **THEN** it SHALL contain `"bg"`, `"fg"`, `"accent"`, `"border"`, `"radius"`, `"spacing"`, `"font-family"`, `"font-size"`, `"muted"`, `"shadow"`, `"avatar-size"`, `"thumb-size"`, and `"surface"`

#### Scenario: Dark preset is valid theme data
- **WHEN** `validateTheme(darkTheme)` is called
- **THEN** the result SHALL be `{ ok: true, theme: darkTheme }`

### Requirement: Predefined base stylesheet
`baseStylesheet` SHALL style the documented `wg-*` classes (`wg-card`, `wg-table`, `wg-tree`, `wg-custom`, `wg-template`, `wg-img` with its shape modifiers `wg-img-avatar`, `wg-img-thumb`, `wg-img-hero`, and their sub-element classes) using only `var(--wg-<token>, <fallback>)` references to registry tokens, with light-theme fallback values. Widget surface backgrounds (`wg-card`, `wg-table`, `wg-custom`) SHALL read `var(--wg-surface, var(--wg-bg, <light default>))` so that themes without a `surface` value inherit `bg` exactly as before, while themes may set the two independently. Image rules SHALL size `wg-img-avatar` from the `avatar-size` token (circular crop), `wg-img-thumb` from the `thumb-size` token (rounded rectangle), and render `wg-img-hero` as a block spanning available width; all three SHALL use `object-fit: cover` or equivalent so mis-proportioned sources stay presentable. `injectBaseStyles(doc)` SHALL append the stylesheet as a marked `<style>` element exactly once per document (idempotent).

#### Scenario: Stylesheet covers the built-in classes
- **WHEN** `baseStylesheet` is inspected
- **THEN** it SHALL contain rules for `.wg-card`, `.wg-table`, `.wg-tree`, `.wg-custom`, `.wg-img`, `.wg-img-avatar`, `.wg-img-thumb`, and `.wg-img-hero`

#### Scenario: All variables come from the registry
- **WHEN** every `--wg-*` reference in `baseStylesheet` is extracted
- **THEN** each SHALL correspond to a token in `THEME_TOKENS`
- **AND** each `var()` reference SHALL include a fallback value

#### Scenario: Injection is idempotent
- **WHEN** `injectBaseStyles(document)` is called twice
- **THEN** the document SHALL contain exactly one widgentic style element

#### Scenario: Avatar size is themeable
- **WHEN** a theme sets `"avatar-size": "48px"` and is applied to a container with an `.wg-img-avatar` image
- **THEN** the avatar SHALL derive its rendered box from the overridden token value

#### Scenario: Surface falls back to bg
- **WHEN** the surface rules are inspected
- **THEN** `.wg-card` background SHALL be `var(--wg-surface, var(--wg-bg, …))`
- **AND** a theme setting only `bg` SHALL color surfaces with that `bg` value, unchanged from prior behavior

### Requirement: Theme validation
`validateTheme(input)` SHALL return `{ ok: true, theme } | { ok: false, error: ThemeError }` where `ThemeError` has `code` (`"INVALID_THEME" | "UNKNOWN_TOKEN" | "INVALID_TOKEN_VALUE"`), `message`, and the offending `token` name when applicable. Non-object input SHALL fail with `INVALID_THEME`; keys outside `THEME_TOKENS` SHALL fail with `UNKNOWN_TOKEN`; values that are not strings or that contain `;`, `{`, `}`, `<`, `>`, `url(`, or `expression(` (case-insensitive, whitespace-tolerant before the parenthesis) SHALL fail with `INVALID_TOKEN_VALUE`. The guard rejects exfiltration and execution vectors, not invalid CSS — inert nonsense values pass.

#### Scenario: Valid theme passes
- **WHEN** `validateTheme({ bg: "#0b0e14", "font-family": "Inter, sans-serif" })` is called
- **THEN** the result SHALL be ok

#### Scenario: Unknown token is rejected
- **WHEN** `validateTheme({ sneaky: "red" })` is called
- **THEN** the result SHALL have `error.code: "UNKNOWN_TOKEN"` and `error.token: "sneaky"`

#### Scenario: Injection-shaped values are rejected
- **WHEN** a value contains `"red; } body { display:none"` or `"url(https://evil.example/x)"`
- **THEN** the result SHALL have `error.code: "INVALID_TOKEN_VALUE"`

#### Scenario: Legacy script vectors are rejected
- **WHEN** a value contains `"expression(alert(1))"` or `"EXPRESSION (alert(1))"`
- **THEN** the result SHALL have `error.code: "INVALID_TOKEN_VALUE"`

### Requirement: Scoped theme application
`applyTheme(container, theme)` SHALL set each valid token as a `--wg-<token>` inline custom property on the container via the CSSOM (no stylesheet parsing) and SHALL first remove all `--wg-*` properties from a previous application (replace semantics). Invalid entries SHALL be skipped, never thrown. Two containers SHALL be able to carry different themes simultaneously.

#### Scenario: Tokens land as custom properties
- **WHEN** `applyTheme(container, { bg: "#111", accent: "tomato" })` is called
- **THEN** the container's inline style SHALL have `--wg-bg: #111` and `--wg-accent: tomato`

#### Scenario: Re-application replaces, never accumulates
- **WHEN** `applyTheme(container, { bg: "#111", accent: "tomato" })` is followed by `applyTheme(container, { bg: "#222" })`
- **THEN** the container SHALL have `--wg-bg: #222` and no `--wg-accent`

#### Scenario: Empty theme resets to defaults
- **WHEN** `applyTheme(container, {})` is called after a previous application
- **THEN** the container SHALL have no `--wg-*` inline properties

#### Scenario: Invalid entries are skipped at runtime
- **WHEN** `applyTheme(container, { bg: "#111", sneaky: "x", accent: "u rl" } as WidgetTheme)` includes an unknown token
- **THEN** valid tokens SHALL be applied and the unknown one SHALL NOT appear

### Requirement: Theme CSS generation
`themeToCss(theme, selector = ":root")` SHALL return a CSS rule assigning the theme's valid tokens as `--wg-*` declarations under the given selector, emitting only entries that pass validation.

#### Scenario: Generated CSS contains declarations
- **WHEN** `themeToCss({ bg: "#111" }, ".dashboard")` is called
- **THEN** the result SHALL be a `.dashboard { ... }` rule containing `--wg-bg: #111;`

#### Scenario: Unsafe entries never reach the output
- **WHEN** the theme contains a value with `}` or `url(`
- **THEN** the generated CSS SHALL NOT contain that value
