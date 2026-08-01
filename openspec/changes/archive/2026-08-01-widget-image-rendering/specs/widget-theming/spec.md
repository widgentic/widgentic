# widget-theming — Delta: image tokens and classes

## MODIFIED Requirements

### Requirement: Theming programmatic surface
The package SHALL export from a `./theming` entry: `THEME_TOKENS` (the token registry), the `WidgetTheme` and `ThemeError` types, `baseStylesheet` (string), `injectBaseStyles(doc: Document): void`, `validateTheme(input: unknown)`, `applyTheme(container: Element, theme: WidgetTheme): void`, `themeToCss(theme: WidgetTheme, selector?: string): string`, and the `darkTheme` preset. Themes SHALL be plain JSON-serializable maps of bare token names to string values.

#### Scenario: Token registry is exported
- **WHEN** `THEME_TOKENS` is imported
- **THEN** it SHALL contain `"bg"`, `"fg"`, `"accent"`, `"border"`, `"radius"`, `"spacing"`, `"font-family"`, `"font-size"`, `"muted"`, `"shadow"`, `"avatar-size"`, and `"thumb-size"`

#### Scenario: Dark preset is valid theme data
- **WHEN** `validateTheme(darkTheme)` is called
- **THEN** the result SHALL be `{ ok: true, theme: darkTheme }`

### Requirement: Predefined base stylesheet
`baseStylesheet` SHALL style the documented `wg-*` classes (`wg-card`, `wg-table`, `wg-tree`, `wg-custom`, `wg-template`, `wg-img` with its shape modifiers `wg-img-avatar`, `wg-img-thumb`, `wg-img-hero`, and their sub-element classes) using only `var(--wg-<token>, <fallback>)` references to registry tokens, with light-theme fallback values. Image rules SHALL size `wg-img-avatar` from the `avatar-size` token (circular crop), `wg-img-thumb` from the `thumb-size` token (rounded rectangle), and render `wg-img-hero` as a block spanning available width; all three SHALL use `object-fit: cover` or equivalent so mis-proportioned sources stay presentable. `injectBaseStyles(doc)` SHALL append the stylesheet as a marked `<style>` element exactly once per document (idempotent).

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
