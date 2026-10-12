## MODIFIED Requirements

### Requirement: Named theme listing tool
The server SHALL expose `list_themes` (no input): a discovery tool returning every registered theme as `{ name, label?, description?, tokens, styles? }` so an agent can pick a theme by name instead of composing tokens and can use the classes a theme's styles define, plus `defaults: { light, dark }` naming the theme each mode uses when a render names none — a built-in name when the caller's settings choose none. Its description SHALL tell agents that leaving `render_widget`'s `theme` out uses those defaults and that a passed theme replaces them, and `render_widget`'s `theme` description SHALL say the same. `handleListThemes(registry)` SHALL be a pure handler taking the registry explicitly, mirroring `handleListWidgets(catalog)`.

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

### Requirement: Runtime-neutral host bundle
The package SHALL export from a `./host` entry `createWidgenticHost(config: string)`. Its default import condition SHALL resolve to ONE self-contained ES module with no `import` statements. Evaluating it SHALL require nothing beyond ECMAScript 2022 and ECMA-402 (`Intl`): no `node:` module, no `process`, no `Buffer`, no `require`, and no web API, so any embedded JavaScript engine with `Intl` can host widgentic.

`config` is a JSON string carrying optional `widgets` (designer-exported widget definitions `{ kind, template, descriptor, load? }`), `themes` (theme entries `{ name, label?, description?, tokens, styles? }`) and `schemas` (shared schema entries `{ name, label?, description?, schema }`). Every entry SHALL be validated with the same checks and structured codes the store applies on write, and built-in kinds and the `light`/`dark` theme names stay reserved. An invalid entry SHALL be skipped and reported, never served and never thrown.

The returned host SHALL take and return strings only, apart from the boolean `slim` flag of `call`:
- `version()`: the `@widgentic/mcp` version the bundle was built from, taken from its manifest at build time.
- `problems()`: a JSON array of `{ section, index, code, message }`, one per refused entry.
- `definitions()`: the JSON of the tool definitions this host serves, taken from the same exported definitions as the Node assembly, with name, description and JSON-Schema `inputSchema`. The tools are `list_widgets`, `render_widget`, `list_theme_tokens`, `list_themes`, `list_schemas` and `get_authoring_guide`, plus the template's own `preview_widget`, which is marked `visibility: ["app"]` as the Node assembly registers it.
- `call(name, argsJson, slim)`: the MCP tool result JSON of that tool's handler, with the slim flag passed through to `render_widget`. `preview_widget` SHALL be answered by the same handler as in the Node assembly, through the host's composed catalog and themes, with no rate gate: rate-limiting previews belongs to the embedding server's transport. An unknown tool name SHALL return an `isError` result, never throw.
- `resources()`: the JSON of the served documents (the app template and the preview-page template) with name, URI or URI template, MIME type and description, taken from the same constants the Node assembly registers them with.
- `appTemplate()`: exactly `buildAppTemplate()`.
- `widgetPage(kind)`: the preview page the Node assembly serves for `ui://widgentic/page/{kind}`.

The host SHALL be render-only. Templates SHALL be compiled with http actions disabled for the `unresolved` reason. No `structuredContent.load` or `structuredContent.loads` SHALL be emitted. `execute_action` and `list_actions` SHALL NOT be served. Prompt action descriptors SHALL be unchanged. The bundle SHALL perform no network access, so server-side image inlining is not part of it.

Inside the bundle, `URL` SHALL resolve to the platform's implementation when the global exists, and otherwise to a bundled, spec-compliant WHATWG URL implementation. Evaluating the bundle SHALL NOT create or modify any global binding, and the host SHALL keep no data from one call to the next.

The repository SHALL keep a generated conformance corpus: render inputs paired with the exact Node-path outputs. It SHALL cover every served tool, `preview_widget` included, plus the built-in kinds, a group, named and inline themes (a named theme with styles included, as a render, a page and a preview), contract errors, hint diagnostics, number and currency formats including non-English locales, URL edge cases, and the example template widgets (with and without actions). The default gate SHALL fail when the committed corpus differs from the current Node output, or when the bundle evaluated in a bare realm (no globals beyond ECMAScript and `Intl`) produces any output that differs from the corpus.

#### Scenario: The bundle evaluates in a bare realm
- **WHEN** the built `./host` bundle is evaluated in a JavaScript context that exposes only ECMAScript built-ins and `Intl` (no `URL`, `process`, `Buffer` or `require`)
- **THEN** evaluation SHALL succeed, `createWidgenticHost("{}")` SHALL return a host, and its `problems()` SHALL be `[]`

#### Scenario: Bare-realm output equals the Node path
- **WHEN** every corpus input is run through the bundle in a bare realm
- **THEN** each output string SHALL be byte-identical to the corpus output recorded from the Node path

#### Scenario: The corpus cannot go stale
- **WHEN** a change alters any handler output for a corpus input without regenerating the corpus
- **THEN** the default gate SHALL fail naming the input

#### Scenario: Template http actions need URL and get it
- **WHEN** a bare-realm host is created with the example weather widget, whose template binds an http action to an absolute https URL
- **THEN** `problems()` SHALL be `[]` and the widget SHALL be listed by `list_widgets`

#### Scenario: Http actions render disabled; prompt actions do not
- **WHEN** a host renders a widget whose template binds one http action and one prompt action
- **THEN** the http action's descriptor SHALL carry `disabled: "unresolved"`, the prompt action's descriptor SHALL carry no `disabled` key, and `structuredContent` SHALL have no `load` or `loads` key

#### Scenario: Invalid entries are refused at the door
- **WHEN** the config carries a widget whose template uses a forbidden tag, a widget whose kind is `card`, and a theme named `dark`
- **THEN** none of the three SHALL be served, and `problems()` SHALL list three entries naming their section, index and structured code

#### Scenario: Definitions are the exported ones
- **WHEN** `definitions()` is parsed
- **THEN** each tool's `name`, `description` and `inputSchema` SHALL deep-equal the corresponding exported tool definition, `preview_widget` alone SHALL carry `visibility: ["app"]`, and the list SHALL contain no `execute_action` and no `list_actions`

#### Scenario: The preview tool is the Node assembly's
- **WHEN** a host configured with the example invoice widget calls `preview_widget` with `{ widget: "invoice", data: { customer: "Ada" } }`
- **THEN** the result SHALL equal `handlePreviewWidget` over the same composed catalog and themes: `structuredContent` carrying only `tree` (rendering `Ada`) and `css`, with no payload, no diagnostics and no `load`

#### Scenario: Unknown tools are results
- **WHEN** `call("execute_action", "{}", false)` runs
- **THEN** it SHALL return an `isError` result with a structured `UNKNOWN_TOOL` code and SHALL NOT throw

#### Scenario: No global is touched
- **WHEN** the names of the global object's own properties are recorded before evaluating the bundle in a bare realm and again after creating a host and rendering every corpus input
- **THEN** the two lists SHALL be identical, and `URL` SHALL still be undefined after a render that parsed URLs

#### Scenario: Calls carry no state
- **WHEN** a host renders payload A and then payload B
- **THEN** B's output SHALL be byte-identical to B rendered by a freshly created host, and SHALL contain no string that appears only in A

## ADDED Requirements

### Requirement: Theme styles reach every styled output
When a render resolves a theme that carries `styles` — a registered theme named by the `theme` input, or a default theme from the caller's settings — every output that carries the theme's tokens SHALL carry its styles too, generated under the theme-style guards: the template channel's `structuredContent.css`, the `format: "page"` and `format: "app"` documents, the `ui://widgentic/page/{kind}` page, `preview_widget`'s `css`, and every `execute_action` re-render of the widget — a named theme carrying styles SHALL also ride the payload by name (`themeName`), so a re-render resolves the same entry from the caller's registry, falling back to the held token map when the name no longer resolves. Theme styles SHALL come before the rendered kinds' registered styles, so a widget's own rule wins a tie, and the theme's token declarations SHALL follow both. An inline token map carries no styles. A theme without styles SHALL produce exactly today's output.

#### Scenario: A named theme's styles reach the template channel
- **WHEN** `render_widget` runs with `theme: "brand"`, whose styles define `.wg-btn`, for a kind whose registered styles define `.wg-invoice`
- **THEN** `structuredContent.css` SHALL contain the `.wg-btn` rule, then the `.wg-invoice` rule, then the theme's `--wg-*` declarations

#### Scenario: Documents carry theme styles
- **WHEN** the same render runs with `format: "page"`
- **THEN** the document's style element SHALL contain the `.wg-btn` rule before the `.wg-invoice` rule

#### Scenario: Action re-renders keep the theme's styles
- **WHEN** a widget rendered with `theme: "brand"` (styles `.wg-btn`) runs an http action through `execute_action`
- **THEN** the re-render's `css` SHALL equal the first render's, `.wg-btn` rule included
- **AND** a render under a theme without styles SHALL carry no `themeName`

#### Scenario: Previews match the result
- **WHEN** `preview_widget` runs with `theme: "brand"`
- **THEN** its `css` SHALL contain the `.wg-btn` rule exactly as the render's does

#### Scenario: Unsafe theme style entries never reach any output
- **WHEN** a stored theme's styles hold a `body` rule beside a safe `.wg-btn` rule
- **THEN** no output SHALL contain the `body` rule and every styled output SHALL contain the `.wg-btn` rule

### Requirement: Default themes from settings stand in for the built-ins
When a `render_widget` or `preview_widget` input names no `theme`, the output SHALL use the caller's registry defaults. For the template channel's `structuredContent.css`: a light default other than the built-in `light` SHALL contribute its token declarations under `:root:not([data-theme="dark"])`, and a dark default other than the built-in `dark` its declarations under `:root[data-theme="dark"]`; when both defaults carry styles each one's styles SHALL be scoped to its mode, and otherwise the styles of the one default that carries them SHALL apply in both modes, since they are layout a widget relies on and read the active mode's tokens; one theme that is the default for both modes SHALL be emitted as an explicitly named theme is, applying in both modes. A mode whose default is the built-in SHALL contribute no token declarations, keeping today's token behavior for that mode — the host's bridged values and, on dark hosts, the template's dark overrides. The `format: "page"` and `format: "app"` documents and the `ui://widgentic/page/{kind}` page, which carry no host theme, SHALL use the light default's tokens and styles unscoped and SHALL ignore the dark default. A `preview_widget` input whose `theme` does not resolve (a name still streaming) SHALL preview with no theme at all, not with the defaults. An explicit `theme` input SHALL replace the defaults in every mode. With both defaults built-in, every output SHALL be byte-identical to a render made before default themes existed.

#### Scenario: The light default dresses light hosts only
- **WHEN** a caller's light default is `brand` (`accent: "#ff5a1f"`) and its dark default is the built-in, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `--wg-accent: #ff5a1f` under `:root:not([data-theme="dark"])` and nothing under `:root[data-theme="dark"]`
- **AND** in the app template on a host whose theme is dark, the widget's computed accent SHALL equal the built-in dark behavior's (a render with no defaults), and on a light host it SHALL be `#ff5a1f`

#### Scenario: The dark default dresses dark hosts only
- **WHEN** a caller's dark default is `brand-dark` with styles defining `.wg-btn`, its light default the built-in, and `render_widget` runs with no `theme`
- **THEN** `structuredContent.css` SHALL declare `brand-dark`'s tokens under `:root[data-theme="dark"]` only, and its `.wg-btn` rule unscoped

#### Scenario: A default's styles serve both modes when the other default has none
- **WHEN** the light default is `brand` (styles defining `.wg-btn`) and the dark default is `night`, a theme without styles, or the built-in
- **THEN** `brand`'s `.wg-btn` rule SHALL be unscoped, so dark hosts keep the layout

#### Scenario: Two different defaults each scope their styles
- **WHEN** the light default is `brand` and the dark default `brand-dark`, both defining `.wg-btn`
- **THEN** `brand`'s rule SHALL be under `:where(:root:not([data-theme="dark"])) .wg-btn` and `brand-dark`'s under `:where(:root[data-theme="dark"]) .wg-btn`, and in the app template a `.wg-btn` SHALL take each theme's padding on hosts of its mode

#### Scenario: A theme still streaming previews with none
- **WHEN** `preview_widget` runs with `theme: "bra"` for a caller whose light default is `brand`
- **THEN** its `css` SHALL carry none of `brand`'s declarations

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
