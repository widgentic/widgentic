# widget-theming Specification

## Purpose
Predefined styles and data-driven themes for the stable `wg-*` widget classes. A token registry (`--wg-*` custom properties) backs a generated base stylesheet with light defaults; a theme is a validated JSON token map applied per container (scoped, replace semantics) or emitted as CSS. Theme values from untrusted authors cannot escape declarations or fetch resources.
## Requirements
### Requirement: Theming programmatic surface
The package SHALL export from a `./theming` entry: `THEME_TOKENS` (the token registry), `TOKEN_SPECS` (each token's default, value `type`, and documented `use`), `TOKEN_DEFAULTS` (derived from the specs), the `WidgetTheme`, `WidgetThemeInput`, `TokenType`, `TokenSpec` and `ThemeError` types, `baseStylesheet` (string), `injectBaseStyles(doc: Document): void`, `validateTheme(input: unknown)`, `applyTheme(container: Element, theme: WidgetTheme): void`, `themeToCss(theme: WidgetTheme, selector?: string): string`, the `darkTheme` preset, and the named-theme registry surface (`createThemeRegistry`, `DuplicateThemeError`, the `ThemeEntry` type). Themes SHALL be plain JSON-serializable maps of bare token names to string values, additionally accepting author-defined `x-*` custom variables. The `darkTheme` preset SHALL set `surface` to a value distinct from its `bg`.

#### Scenario: Token registry is exported
- **WHEN** `THEME_TOKENS` is imported
- **THEN** it SHALL contain `"bg"`, `"surface"`, `"fg"`, `"muted"`, `"accent"`, `"accent-fg"`, `"border"`, `"border-width"`, `"radius"`, `"radius-sm"`, `"radius-lg"`, `"spacing"`, `"spacing-sm"`, `"spacing-lg"`, `"font-family"`, `"font-mono"`, `"font-size"`, `"font-size-sm"`, `"font-size-lg"`, `"font-weight-bold"`, `"line-height"`, `"shadow"`, and the status families `"danger"`/`"danger-fg"`, `"success"`/`"success-fg"`, `"warning"`/`"warning-fg"`, `"info"`/`"info-fg"`, plus `"avatar-size"` and `"thumb-size"`

#### Scenario: Dark preset is valid theme data
- **WHEN** `validateTheme(darkTheme)` is called
- **THEN** the result SHALL be `{ ok: true, theme: darkTheme }`

#### Scenario: Every token has a default
- **WHEN** each entry of `THEME_TOKENS` is looked up in the defaults table
- **THEN** each SHALL have a non-empty string default, so themes that omit it are unchanged from today

#### Scenario: Every token declares its type and purpose
- **WHEN** `TOKEN_SPECS` is inspected
- **THEN** each token SHALL declare a `type` of `"color" | "dimension" | "number" | "font-family" | "font-weight" | "shadow"` and a non-empty `use` describing what it controls
- **AND** every `color`-typed token's default SHALL be a hex color, so tooling can trust the declared type instead of inferring it from the value

### Requirement: Predefined base stylesheet
`baseStylesheet` SHALL begin with a generated `:root` block **defining every registry token with its default value**, so custom widget styles may reference bare `var(--wg-<token>)` and always resolve — an applied theme overrides these definitions rather than being the only source of them (before this, any token the active theme did not set was undefined, silently invalidating custom-style declarations on every surface). `baseStylesheet` SHALL style the documented `wg-*` classes (`wg-card`, `wg-table`, `wg-tree`, `wg-custom`, `wg-template`, `wg-img` with its shape modifiers `wg-img-avatar`, `wg-img-thumb`, `wg-img-hero`, and their sub-element classes) using only `var(--wg-<token>, <fallback>)` references to registry tokens, with light-theme fallback values. Widget surface backgrounds (`wg-card`, `wg-table`, `wg-custom`) SHALL read `var(--wg-surface, var(--wg-bg, <light default>))` so that themes without a `surface` value inherit `bg` exactly as before, while themes may set the two independently. Text SHALL derive its density from the `line-height` token, its emphasis from `font-weight-bold`, and monospace content (`wg-custom`) from `font-mono`; hairlines SHALL derive their thickness from `border-width`. The stylesheet SHALL additionally define status utility classes (`wg-status` with `wg-status-danger|success|warning|info|accent`) pairing each status color with its `-fg` text color, so status tokens are consumed rather than decorative. EVERY registry token SHALL be referenced by the stylesheet — a token that nothing consumes SHALL NOT be added. Image rules SHALL size `wg-img-avatar` from the `avatar-size` token (circular crop), `wg-img-thumb` from the `thumb-size` token (rounded rectangle), and render `wg-img-hero` as a block spanning available width; all three SHALL use `object-fit: cover` or equivalent so mis-proportioned sources stay presentable. `injectBaseStyles(doc)` SHALL append the stylesheet as a marked `<style>` element exactly once per document (idempotent).

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

#### Scenario: No token is decorative
- **WHEN** every `--wg-*` reference in `baseStylesheet` is collected and compared against `THEME_TOKENS`
- **THEN** the set of tokens referenced by nothing SHALL be empty

#### Scenario: Status utilities pair fill and text colors
- **WHEN** the stylesheet is inspected
- **THEN** `.wg-status-danger`, `.wg-status-success`, `.wg-status-warning`, `.wg-status-info`, and `.wg-status-accent` SHALL each set a background from their status token and a color from the matching `-fg` token

#### Scenario: Every token is defined for custom styles
- **WHEN** the stylesheet's leading `:root` block is inspected
- **THEN** it SHALL declare `--wg-<token>: <default>` for every token in `THEME_TOKENS`
- **AND** a custom widget style referencing a bare `var(--wg-spacing-lg)` under an applied theme that does not set `spacing-lg` SHALL resolve to the registry default rather than collapse

### Requirement: Theme validation
`validateTheme(input)` SHALL return `{ ok: true, theme } | { ok: false, error: ThemeError }` where `ThemeError` has `code` (`"INVALID_THEME" | "UNKNOWN_TOKEN" | "INVALID_TOKEN_VALUE"`), `message`, and the offending `token` name when applicable. Non-object input SHALL fail with `INVALID_THEME`; keys outside `THEME_TOKENS` SHALL fail with `UNKNOWN_TOKEN` **unless** they match the custom-variable pattern `^x-[a-z0-9][a-z0-9-]*$`, which SHALL be accepted; values that are not strings or that contain `;`, `{`, `}`, `<`, `>`, `url(`, or `expression(` (case-insensitive, whitespace-tolerant before the parenthesis) SHALL fail with `INVALID_TOKEN_VALUE` — custom variables included. The guard rejects exfiltration and execution vectors, not invalid CSS — inert nonsense values pass.

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

#### Scenario: Custom variables are accepted
- **WHEN** `validateTheme({ "x-card-media-radius": "12px" })` is called
- **THEN** the result SHALL be ok

#### Scenario: Malformed custom names and unsafe custom values are rejected
- **WHEN** the key is `"x-"`, `"x-Bad_Name"`, or `"xcustom"`
- **THEN** the result SHALL have `error.code: "UNKNOWN_TOKEN"`
- **AND WHEN** `{ "x-ok": "url(https://evil.example/x)" }` is validated
- **THEN** the result SHALL have `error.code: "INVALID_TOKEN_VALUE"`

### Requirement: Scoped theme application
`applyTheme(container, theme)` SHALL set each valid token as a `--wg-<token>` inline custom property on the container via the CSSOM (no stylesheet parsing), custom variables as `--wg-x-<name>`, and SHALL first remove all `--wg-*` properties from a previous application (replace semantics). Invalid entries SHALL be skipped, never thrown. Two containers SHALL be able to carry different themes simultaneously.

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

#### Scenario: Custom variables are applied under the x- prefix
- **WHEN** `applyTheme(container, { "x-badge-gap": "4px" })` is called
- **THEN** the container SHALL have `--wg-x-badge-gap: 4px`
- **AND** a subsequent application without it SHALL remove it

### Requirement: Theme CSS generation
`themeToCss(theme, selector = ":root")` SHALL return a CSS rule assigning the theme's valid tokens as `--wg-*` declarations (custom variables as `--wg-x-*`) under the given selector, emitting only entries that pass validation.

#### Scenario: Generated CSS contains declarations
- **WHEN** `themeToCss({ bg: "#111" }, ".dashboard")` is called
- **THEN** the result SHALL be a `.dashboard { ... }` rule containing `--wg-bg: #111;`

#### Scenario: Unsafe entries never reach the output
- **WHEN** the theme contains a value with `}` or `url(`
- **THEN** the generated CSS SHALL NOT contain that value

#### Scenario: Custom variables are emitted
- **WHEN** `themeToCss({ "x-gap": "4px" })` is called
- **THEN** the output SHALL contain `--wg-x-gap: 4px;`

### Requirement: Named theme registry
The package SHALL export `createThemeRegistry()` returning a registry of named themes with `register(entry)`, `get(name)`, `list()`, and `names()`. An entry SHALL be `{ name, label?, description?, tokens, extends? }` where `tokens` is a validated `WidgetTheme`. Registering a name twice SHALL throw `DuplicateThemeError` (matching the catalog's duplicate-kind ergonomics). `extends: <name>` SHALL be resolved **at registration** by merging the base entry's tokens under the new entry's own tokens, storing the flat result — no runtime cascade and no cycles; the `extends` name SHALL be retained on the entry for display. Registering an entry whose tokens fail validation SHALL throw with the validator's structured error. A fresh registry SHALL contain the built-in `light` (empty token map — the defaults) and `dark` (the `darkTheme` preset) entries.

#### Scenario: Registry ships light and dark
- **WHEN** `createThemeRegistry().names()` is called
- **THEN** it SHALL contain `"light"` and `"dark"`

#### Scenario: Registered themes are retrievable
- **WHEN** an entry `{ name: "brand", tokens: { accent: "#ff5a1f" } }` is registered
- **THEN** `get("brand")` SHALL return it and `list()` SHALL include it

#### Scenario: extends merges at registration
- **WHEN** `{ name: "brand-dark", extends: "dark", tokens: { accent: "#ff5a1f" } }` is registered
- **THEN** `get("brand-dark").tokens` SHALL contain the dark preset's `bg` and the overriding `accent`
- **AND** the entry SHALL still report `extends: "dark"`

#### Scenario: Duplicate names and invalid tokens are refused
- **WHEN** a name already in the registry is registered again
- **THEN** `DuplicateThemeError` SHALL be thrown
- **AND WHEN** an entry's tokens contain `{ sneaky: "red" }`
- **THEN** registration SHALL throw carrying `UNKNOWN_TOKEN`
