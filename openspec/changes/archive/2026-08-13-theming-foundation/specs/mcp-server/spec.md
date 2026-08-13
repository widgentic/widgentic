# mcp-server — Delta: named themes over the wire

## MODIFIED Requirements

### Requirement: Themed page output
`render_widget` SHALL accept `theme?: <token map> | <registered theme name>` — an object validated by the theming capability's rules, or a string resolved against the server's theme registry. An unknown theme name SHALL return `UNKNOWN_THEME` at `path: "theme"` with a message listing the available names, so recovery needs no second round trip. With `format: "page"`, the resolved theme SHALL be applied to the document via generated `--wg-*` declarations; invalid theme objects SHALL return `INVALID_TYPE` at `path: "theme.<token>"` naming the offending token. A resolved `theme` SHALL also be embedded as a top-level `theme` field in the widgentic payload block regardless of format — riding the contract's unknown-field passthrough — so natively mounting hosts can honor it (advisory; hosts own their scope); the payload SHALL carry the resolved token map, not the name.

#### Scenario: Dark-themed page
- **WHEN** `render_widget` runs with `format: "page"` and `theme: { bg: "#0f131c" }`
- **THEN** the document SHALL contain `--wg-bg: #0f131c`

#### Scenario: Theme travels in the payload for native hosts
- **WHEN** `render_widget` runs with a valid `theme` and any format
- **THEN** the extracted payload SHALL carry that `theme` as a top-level field
- **AND** contract validation of the payload SHALL still succeed (unknown-field passthrough)

#### Scenario: Unsafe theme values are structured errors
- **WHEN** `theme` contains `{ bg: "url(https://evil.example)" }`
- **THEN** the result SHALL be `isError: true` with `error.path: "theme.bg"`

#### Scenario: A registered name resolves to its tokens
- **WHEN** `render_widget` runs with `theme: "dark"` and `format: "page"`
- **THEN** the document SHALL contain the dark preset's `--wg-bg` value
- **AND** the payload's `theme` field SHALL be the resolved token map

#### Scenario: Unknown theme names are self-sufficient errors
- **WHEN** `render_widget` runs with `theme: "midnight"` and no such entry is registered
- **THEN** the result SHALL be `isError: true` with `error.code: "UNKNOWN_THEME"`, `error.path: "theme"`, and a message listing the registered names

### Requirement: Theme discovery tool
The server SHALL expose `list_theme_tokens` (no input): a discovery tool returning the theming vocabulary as JSON — every token with its light default, its value `type` (`color`, `dimension`, `number`, `font-family`, `font-weight`, `shadow`) and a one-line `use`, ready-made presets (at least `dark`), the value rules (CSS strings only; unsafe values rejected), and the custom-variable rule (`x-*` keys are accepted and emitted as `--wg-x-*`) — so remote agents can construct valid themes without reading source. `handleListThemeTokens()` SHALL be a pure, catalog-free handler.

#### Scenario: Tokens, defaults, and presets are discoverable
- **WHEN** `handleListThemeTokens()` runs
- **THEN** the parsed result SHALL list every registry token with its default value, declared `type`, and `use`
- **AND** SHALL include a `dark` preset that passes theme validation
- **AND** SHALL state the value rules

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools and calls `list_theme_tokens`
- **THEN** the tool SHALL appear alongside `list_widgets` and `render_widget`
- **AND** the delivered result SHALL parse to the token listing

#### Scenario: The custom-variable rule is documented
- **WHEN** `handleListThemeTokens()` runs
- **THEN** the rules text SHALL explain that `x-*` keys are accepted as custom variables

## ADDED Requirements

### Requirement: Named theme listing tool
The server SHALL expose `list_themes` (no input): a discovery tool returning every registered theme as `{ name, label?, description?, extends?, tokens }` so an agent can pick a theme by name instead of composing tokens. `handleListThemes(registry)` SHALL be a pure handler taking the registry explicitly, mirroring `handleListWidgets(catalog)`.

#### Scenario: Registered themes are listed with their tokens
- **WHEN** `handleListThemes(registry)` runs on a registry holding `light`, `dark`, and a registered `brand`
- **THEN** the parsed result SHALL contain all three entries with their token maps
- **AND** each listed name SHALL be usable as `render_widget`'s `theme` input

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools
- **THEN** `list_themes` SHALL appear alongside `list_widgets`, `list_theme_tokens`, and `render_widget`
