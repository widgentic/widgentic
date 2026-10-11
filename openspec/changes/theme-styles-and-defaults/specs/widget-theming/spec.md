## MODIFIED Requirements

### Requirement: Theming programmatic surface
The package SHALL export from a `./theming` entry: `THEME_TOKENS` (the token registry), `TOKEN_SPECS` (each token's default, value `type`, and documented `use`), `TOKEN_DEFAULTS` (derived from the specs), the `WidgetTheme`, `WidgetThemeInput`, `TokenType`, `TokenSpec` and `ThemeError` types, `baseStylesheet` (string), `injectBaseStyles(doc: Document): void`, `validateTheme(input: unknown)`, `applyTheme(container: Element, theme: WidgetTheme): void`, `themeToCss(theme: WidgetTheme, selector?: string): string`, `themeStylesToCss(styles: WidgetStyles, scope?: string): string`, the `darkTheme` preset, and the named-theme registry surface (`createThemeRegistry`, `DuplicateThemeError`, the `ThemeEntry` and `ThemeMode` types — `ThemeMode` being `"light" | "dark"`). Themes SHALL be plain JSON-serializable maps of bare token names to string values, additionally accepting author-defined `x-*` custom variables. The `darkTheme` preset SHALL set `surface` to a value distinct from its `bg`.

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

#### Scenario: Theme styles and modes are part of the surface
- **WHEN** the `./theming` entry is imported
- **THEN** `themeStylesToCss` SHALL be exported as a function, and a `ThemeEntry` carrying `styles` and a `ThemeMode` value SHALL type-check against the exported types

### Requirement: Named theme registry
The package SHALL export `createThemeRegistry()` returning a registry of named themes with `register(entry)`, `get(name)`, `list()`, and `names()`. An entry SHALL be `{ name, label?, description?, tokens, styles?, extends? }` where `tokens` is a validated `WidgetTheme` and `styles`, when present, is a style map in the shape a widget descriptor's `styles` takes — a plain object of selectors to plain objects of property/value strings; any other `styles` value SHALL make registration throw carrying `INVALID_THEME`. Unsafe style entries inside a well-shaped map SHALL be accepted and dropped when CSS is generated, exactly as a widget's are. Registering a name twice SHALL throw `DuplicateThemeError` (matching the catalog's duplicate-kind ergonomics). `extends: <name>` SHALL be resolved **at registration** by merging the base entry's tokens under the new entry's own tokens, and the base entry's styles under the new entry's own styles (per selector, then per property: a selector both define keeps the base's other properties and takes the new entry's values), storing the flat result — no runtime cascade and no cycles; the `extends` name SHALL be retained on the entry for display. Registering an entry whose tokens fail validation SHALL throw with the validator's structured error. A fresh registry SHALL contain the built-in `light` (empty token map — the defaults) and `dark` (the `darkTheme` preset) entries. The registry SHALL hold one default entry per `ThemeMode`: `getDefault(mode)` SHALL return the `light` built-in for `"light"` and the `dark` built-in for `"dark"` until `setDefault(mode, name)` names another registered entry, and `defaults()` SHALL return `{ light, dark }` with the effective entries' names. `setDefault` SHALL throw for a name the registry does not hold, SHALL replace the previous default of that mode, and SHALL accept the same entry for both modes.

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

#### Scenario: Defaults start as the built-ins
- **WHEN** `createThemeRegistry().defaults()` is called
- **THEN** it SHALL return `{ light: "light", dark: "dark" }`

#### Scenario: One default per mode
- **WHEN** entries `a` and `b` are registered, `setDefault("light", "a")` and then `setDefault("light", "b")` are called
- **THEN** `getDefault("light").name` SHALL be `"b"` and `getDefault("dark").name` SHALL still be `"dark"`
- **AND** `setDefault("dark", "b")` SHALL be accepted, making `b` the default for both modes

#### Scenario: Only registered entries can be defaults
- **WHEN** `setDefault("dark", "missing")` is called on a registry that holds no `missing`
- **THEN** it SHALL throw and the dark default SHALL be unchanged

#### Scenario: Styles travel with the entry and merge through extends
- **WHEN** `{ name: "base", tokens: {}, styles: { ".wg-btn": { padding: "4px", color: "red" } } }` is registered, then `{ name: "child", extends: "base", tokens: {}, styles: { ".wg-btn": { color: "blue" }, ".wg-badge": { "font-weight": "700" } } }`
- **THEN** `get("child").styles` SHALL be `{ ".wg-btn": { padding: "4px", color: "blue" }, ".wg-badge": { "font-weight": "700" } }`
- **AND** registering an entry whose `styles` is an array, or maps a selector to a string, SHALL throw carrying `INVALID_THEME`

## ADDED Requirements

### Requirement: Theme styles generate scoped CSS
`themeStylesToCss(styles, scope?)` SHALL generate CSS from a theme's style map under exactly the guards and output format of the registered-widget-styles generator — every selector part targeting a `.wg-` class, the same banned constructs and property-name rule, unsafe entries dropped and safe siblings kept, never throwing. Without `scope` its output SHALL equal that generator's for the same map. With `scope` (a selector supplied by the caller, never by theme data), every comma-separated part of every emitted selector SHALL be prefixed by `:where(<scope>) `, so a scoped rule applies only inside the scope and gains no specificity from it.

#### Scenario: Unscoped theme styles match widget styles
- **WHEN** `themeStylesToCss({ ".wg-btn": { padding: "4px 8px" } })` is called
- **THEN** the result SHALL equal the widget-styles generator's output for the same map

#### Scenario: A scope prefixes every selector part
- **WHEN** `themeStylesToCss({ ".wg-btn, .wg-link": { color: "var(--wg-accent)" } }, ':root[data-theme="dark"]')` is called
- **THEN** the rule's selector SHALL be `:where(:root[data-theme="dark"]) .wg-btn, :where(:root[data-theme="dark"]) .wg-link`

#### Scenario: A scoped rule applies only inside its scope and keeps its own weight
- **WHEN** a document whose root carries `data-theme="dark"` holds the CSS of `themeStylesToCss({ ".wg-btn": { color: "rgb(1, 2, 3)" } }, ':root[data-theme="dark"]')` followed by a widget rule `.wg-btn { color: rgb(4, 5, 6) }`
- **THEN** a `.wg-btn` element's computed color SHALL be `rgb(4, 5, 6)`, since the two selectors weigh the same and the widget rule comes later
- **AND** with the root's `data-theme` removed and the widget rule absent, the element SHALL NOT take `rgb(1, 2, 3)`

#### Scenario: Unsafe theme style entries never reach the output
- **WHEN** the map holds a `body` selector, a value with `url(`, and a safe `.wg-btn` rule
- **THEN** the output SHALL contain only the `.wg-btn` rule
