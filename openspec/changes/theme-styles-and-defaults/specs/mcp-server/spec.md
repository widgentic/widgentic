## MODIFIED Requirements

### Requirement: Named theme listing tool
The server SHALL expose `list_themes` (no input): a discovery tool returning every registered theme as `{ name, label?, description?, extends?, tokens, styles? }` so an agent can pick a theme by name instead of composing tokens and can use the classes a theme's styles define, plus `defaults: { light, dark }` naming the theme each mode uses when a render names none — a built-in name when the caller's settings choose none. `handleListThemes(registry)` SHALL be a pure handler taking the registry explicitly, mirroring `handleListWidgets(catalog)`.

#### Scenario: Registered themes are listed with their tokens
- **WHEN** `handleListThemes(registry)` runs on a registry holding `light`, `dark`, and a registered `brand`
- **THEN** the parsed result SHALL contain all three entries with their token maps, and `defaults` SHALL be `{ "light": "light", "dark": "dark" }`
- **AND** each listed name SHALL be usable as `render_widget`'s `theme` input

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools
- **THEN** `list_themes` SHALL appear alongside `list_widgets`, `list_theme_tokens`, and `render_widget`

#### Scenario: Styles and default themes are listed
- **WHEN** `handleListThemes(registry)` runs on a registry whose `brand` entry carries `styles` and whose light default is `brand`
- **THEN** the `brand` entry SHALL carry its `styles`, and `defaults` SHALL be `{ "light": "brand", "dark": "dark" }`

### Requirement: Authoring guide tool
The server SHALL expose a read-only `get_authoring_guide` tool whose result is a structured JSON guide containing everything an external agent needs to draft valid widget and theme JSON for its user: the `CustomWidget` shape (`{ kind, template, descriptor }` with the descriptor's fields, including `dataSchemaRef` — a saved shared schema referenced by name IN PLACE of an inline `dataSchema`, never both), the theme entry shape (`{ name, label?, description?, tokens, styles? }` — `styles` defining shared `.wg-` classes under the same rules as a widget's styles, which widgets rendered under the theme can use; which theme is a default is a principal setting the person chooses in the designer's Settings, not part of the entry), the shared-schema entry shape (`{ name, label?, description?, schema }` — what the user imports in the Data schemas section), the shared-ACTION entry shape (`{ name, label?, description?, definition }` — what the user imports in the Actions section, with both definition kinds and the action name pattern, which is stricter than the identifier charset used for widgets, themes and schemas), the template DSL's node forms (text, `bind`, `each`/`empty`, `when`/`else`, elements with attrs including `{ bind }` values and the attr transforms `{ bind, map, default? }` / `{ bind, prefix }` and the value transform `{ bind, format }` with its closed number/currency/date vocabulary, each taught with its motivating recipe — a status value selecting a `wg-status-*` class, `mailto:`/`tel:` links from bound addresses, and a numeric-string price formatted as a currency) and safety rules (no `on*` attributes, URL scheme allowlist, base64 `data:image/*` on `img src` only, depth and node bounds), the identifier charset and the reserved built-in kinds, the styles rules (`.wg-` selectors, banned constructs), the `dataSchema` subset including its `pattern` bounds, a data-modeling preference (bind only schema-declared properties; `$meta.*` is outside `dataSchema` validation and SHALL be discouraged rather than promoted), a shared-schema rule — when the user names a saved schema, reference it with `dataSchemaRef` and discover its shape with `list_schemas`; do NOT reconstruct it inline, since the copy forks the moment the user edits the shared one —, a shared-ACTION rule — an element binds one with `action: { "ref": "<name>", input?, output? }` and a widget loads one at first render with a `load` binding (http `GET` only); discover what exists with `list_actions` and reference it by name, and when nothing fits DESCRIBE the action the user should author and test in the designer rather than drafting an inline definition with a URL or credentials the agent cannot know —, the token registry with each token's type and use, the per-principal limits — including the caps on shared schemas and shared actions, so an agent can see the ceiling it drafts against —, and a `workflow` section stating that agents draft JSON while users import, validate, and save it in the authenticated designer — registration over MCP does not exist by design. Facts with a live source of truth SHALL be derived from it at call time — including the custom-variable name pattern, the banned style substrings, the style property allowlist, the schema `pattern` length cap, and the action name pattern, each read from its owning constant (reserved kinds from the catalog, limits from the store defaults, tokens from the token registry), never duplicated as prose.

#### Scenario: The guide is discoverable and structured
- **WHEN** an SDK client lists tools and calls `get_authoring_guide`
- **THEN** the tool SHALL appear in the listing with a description telling agents when to use it
- **AND** the result text SHALL parse as JSON containing `widget`, `theme`, `rules`, `limits`, and `workflow` sections

#### Scenario: Derived facts match their sources
- **WHEN** the guide is compared against the live system
- **THEN** its reserved kinds SHALL equal the catalog's built-in kinds, its limits SHALL equal the store's documented defaults, and its token list SHALL equal the token registry's names and types

#### Scenario: A draft built from the guide imports cleanly
- **WHEN** a widget and a theme are constructed following only the guide's shapes and rules
- **THEN** the widget SHALL pass the store's write validation and the designer's import, and the theme SHALL pass theme validation — with no corrections needed

#### Scenario: The guide teaches the write boundary
- **WHEN** the `workflow` section is read
- **THEN** it SHALL state that saving happens in the authenticated designer by the user and that no MCP registration tool exists

#### Scenario: The guide steers away from unvalidated meta binds
- **WHEN** the template rules are read
- **THEN** they SHALL prefer schema-declared properties and mark `$meta.*` as outside `dataSchema` validation, to be avoided or reserved for out-of-band display

#### Scenario: Theme-building tools point at the save path
- **WHEN** `list_theme_tokens` or `list_themes` rules are read
- **THEN** they SHALL tell agents that a theme the user wants to keep is delivered as the importable entry (`{ name, label?, description?, tokens, styles? }`) for the designer at widgentic.dev, referencing `get_authoring_guide` — the inline token map styles only one render

#### Scenario: Every stated rule is read from its constant
- **WHEN** the guide's custom-variable pattern, style ban list, style property rule, and pattern length cap are compared with the constants that enforce them
- **THEN** each SHALL equal its source rather than restate it, so a change to the validator cannot leave the guide lying

#### Scenario: The guide teaches shared-schema references
- **WHEN** the widget entry shape and template rules are read
- **THEN** they SHALL document `dataSchemaRef` as referencing a saved schema by name in place of an inline `dataSchema` (never both)
- **AND** they SHALL steer agents to `list_schemas` for the schema's shape and to the reference over an inline reconstruction when the user names a saved schema

#### Scenario: The guide teaches the schema entry shape and its import path
- **WHEN** the guide's shared-schema section is read
- **THEN** it SHALL document the entry shape (`{ name, label?, description?, schema }`) and state that the user imports it in the Data schemas section at widgentic.dev

#### Scenario: The guide teaches the attr transforms with their recipes
- **WHEN** the template rules are read
- **THEN** they SHALL document `{ bind, map, default? }` with a status→class example and `{ bind, prefix }` with a `mailto:`/`tel:` example
- **AND** a widget drafted from the guide using both transforms SHALL pass the store's write validation and the designer's import unchanged

#### Scenario: The guide teaches the format transform
- **WHEN** the template rules are read
- **THEN** they SHALL document `{ bind, format }` with its number, currency and date specs and a currency recipe, deriving the bounds and token vocabulary from the validator's constants
- **AND** a widget drafted from the guide using a currency and a date format SHALL pass the store's write validation unchanged

#### Scenario: The guide teaches the standalone action entry shape and its import path
- **WHEN** the guide's shared-action section is read
- **THEN** it SHALL document the entry shape (`{ name, label?, description?, definition }`) with both definition kinds, SHALL state the action name pattern read from the constant that enforces it, and SHALL state that the user imports the entry in the Actions section at widgentic.dev

#### Scenario: The guide teaches referencing a saved action over inventing one
- **WHEN** the template rules are read
- **THEN** they SHALL document the `action: { "ref": "<name>" }` binding and the widget-level `load` (http `GET` only), SHALL steer agents to `list_actions` for what the user already has, and SHALL state that an action the user has not saved is DESCRIBED for the designer rather than drafted with an invented URL or credential

#### Scenario: The published limits cover every entry an agent drafts
- **WHEN** the `limits` section is read
- **THEN** it SHALL carry the caps on shared schemas and shared actions beside the widget and theme caps, each equal to the store's documented default

#### Scenario: The guide teaches theme styles
- **WHEN** the guide's theme section is read
- **THEN** it SHALL document `styles` with the selector, banned-construct and property-name rules read from the same constants as the widget styles rules, and SHALL state that a theme's classes serve every widget rendered under it
- **AND** a theme drafted from the guide with a `.wg-btn` rule SHALL pass the store's write validation and the designer's import unchanged

## ADDED Requirements

### Requirement: Theme styles reach every styled output
When a render resolves a theme that carries `styles` — a registered theme named by the `theme` input, or a default theme from the caller's settings — every output that carries the theme's tokens SHALL carry its styles too, generated under the theme-style guards: the template channel's `structuredContent.css`, the `format: "page"` and `format: "app"` documents, and `preview_widget`'s `css`. Theme styles SHALL come before the rendered kinds' registered styles, so a widget's own rule wins a tie, and the theme's token declarations SHALL follow both. An inline token map carries no styles. A theme without styles SHALL produce exactly today's output.

#### Scenario: A named theme's styles reach the template channel
- **WHEN** `render_widget` runs with `theme: "brand"`, whose styles define `.wg-btn`, for a kind whose registered styles define `.wg-invoice`
- **THEN** `structuredContent.css` SHALL contain the `.wg-btn` rule, then the `.wg-invoice` rule, then the theme's `--wg-*` declarations

#### Scenario: Documents carry theme styles
- **WHEN** the same render runs with `format: "page"`
- **THEN** the document's style element SHALL contain the `.wg-btn` rule before the `.wg-invoice` rule

#### Scenario: Previews match the result
- **WHEN** `preview_widget` runs with `theme: "brand"`
- **THEN** its `css` SHALL contain the `.wg-btn` rule exactly as the render's does

#### Scenario: Unsafe theme style entries never reach any output
- **WHEN** a stored theme's styles hold a `body` rule beside a safe `.wg-btn` rule
- **THEN** no output SHALL contain the `body` rule and every styled output SHALL contain the `.wg-btn` rule

### Requirement: Default themes from settings stand in for the built-ins
When a `render_widget` or `preview_widget` input names no `theme`, the output SHALL use the caller's registry defaults. For the template channel's `structuredContent.css`: a light default other than the built-in `light` SHALL contribute its token declarations under `:root:not([data-theme="dark"])` and its styles scoped to that selector; a dark default other than the built-in `dark` SHALL contribute its declarations under `:root[data-theme="dark"]` and its styles scoped to that selector; one theme that is the default for both modes SHALL be emitted as an explicitly named theme is, applying in both modes. A mode whose default is the built-in SHALL contribute nothing, keeping today's behavior for that mode — the host's bridged values and, on dark hosts, the template's dark overrides. The `format: "page"` and `format: "app"` documents, which carry no host theme, SHALL use the light default's tokens and styles unscoped and SHALL ignore the dark default. An explicit `theme` input SHALL replace the defaults in every mode. With both defaults built-in, every output SHALL be byte-identical to a render made before default themes existed.

#### Scenario: The light default dresses light hosts only
- **WHEN** a caller's light default is `brand` (`accent: "#ff5a1f"`) and its dark default is the built-in, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `--wg-accent: #ff5a1f` under `:root:not([data-theme="dark"])` and nothing under `:root[data-theme="dark"]`
- **AND** in the app template on a host whose theme is dark, the widget's computed accent SHALL be the built-in dark behavior's, and on a light host it SHALL be `#ff5a1f`

#### Scenario: The dark default dresses dark hosts only
- **WHEN** a caller's dark default is `brand-dark` with styles defining `.wg-btn`, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `brand-dark`'s tokens under `:root[data-theme="dark"]` and its `.wg-btn` rule under `:where(:root[data-theme="dark"]) .wg-btn`

#### Scenario: An explicit theme replaces the defaults
- **WHEN** a caller with both defaults set renders with `theme: "dark"`
- **THEN** the output SHALL carry the built-in dark theme as an explicit render does today and none of the default themes' declarations or styles

#### Scenario: Documents use the light default
- **WHEN** a caller with both defaults set renders with `format: "page"` and no `theme`
- **THEN** the document SHALL carry the light default's tokens under `:root` and its styles unscoped, and none of the dark default's

#### Scenario: No defaults, no change
- **WHEN** a caller whose settings choose no default themes renders the same payload before and after this change, in every format
- **THEN** the outputs SHALL be byte-identical

#### Scenario: Previews follow the defaults
- **WHEN** `preview_widget` runs with no `theme` for a caller whose light default is `brand`
- **THEN** its `css` SHALL carry `brand`'s light-scoped declarations exactly as the render's does
