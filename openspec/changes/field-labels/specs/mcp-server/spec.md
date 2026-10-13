## ADDED Requirements

### Requirement: Previews show field labels
The app template's client-built previews of `card` and `table` SHALL apply `hints.labels` as the renderers do. A labelled field or column SHALL preview with its label as soon as the streamed `hints` carry it, and a key without a label SHALL preview with the key. A preview therefore matches the result's labels, and the tool result's render stays the authority.

#### Scenario: A streamed table previews its labels
- **WHEN** partial input for `table` carries `hints: { labels: { first_name: "First Name" } }` before `data` rows of `{ first_name: "Ada" }`
- **THEN** the preview's header SHALL read `First Name` from the first previewed row

#### Scenario: A card previews its labels
- **WHEN** partial input for `card` carries `data: { fields: { order_total: 42 } }` and `hints: { labels: { order_total: "Order Total" } }`
- **THEN** the preview's field key SHALL read `Order Total`, as the tool result's render does

## MODIFIED Requirements

### Requirement: Widget rendering tool
`handleRenderWidget(catalog, input)` SHALL accept `{ widget, data, hints?, meta?, format?, theme? }`, validate the widget id against the catalog, the assembled payload against the contract, and `data` against the kind's `dataSchema` when present, render on success, and return content per the selected `format` — by default the rendered HTML as a text block **and** the validated payload as a widgentic resource block (extractable by `extractWidgetPayload`). The tool description SHALL steer callers who need several widgets in one response toward a single `group` render instead of repeated calls. It SHALL also ask callers to write `widget` first and any `hints` before `data`, so a host that streams the call can preview the widget with its labels, columns and image places from the first row.

#### Scenario: Valid request renders dual-format
- **WHEN** `handleRenderWidget(catalog, { widget: "table", data: [{ a: 1 }] })` runs
- **THEN** the result SHALL NOT be an error
- **AND** its text content SHALL contain `class="wg-table"`
- **AND** `extractWidgetPayload(result)` SHALL return the payload with `kind: "table"`

#### Scenario: Hints and meta pass through
- **WHEN** the input includes `hints: { columns: ["b"] }` and `meta: { title: "T" }`
- **THEN** the rendered HTML SHALL honor the hint
- **AND** the extracted payload SHALL carry the same `hints` and `meta`

#### Scenario: Registered template kinds render
- **WHEN** the catalog has a registered `invoice` template kind and `handleRenderWidget` is called with `widget: "invoice"` and matching data
- **THEN** the result SHALL contain the template's rendered HTML

#### Scenario: Schema violations surface as structured errors
- **WHEN** the demo `invoice` kind declares a `dataSchema` requiring `lines` and the input omits it
- **THEN** the result SHALL be `isError: true` with `code: "MISSING_FIELD"` and `path: "data.lines"`

#### Scenario: A group of mixed kinds renders in one call
- **WHEN** `handleRenderWidget` is called with `widget: "group"` and items of kinds `card` and a stored custom template kind
- **THEN** the result SHALL contain both items' markup in one response
- **AND** the tool description SHALL mention the group steering

#### Scenario: The description orders the arguments for streaming
- **WHEN** the `render_widget` description is read
- **THEN** it SHALL ask for `widget` first and for `hints` before `data`

### Requirement: Authoring guide tool
The server SHALL expose a read-only `get_authoring_guide` tool whose result is a structured JSON guide containing everything an external agent needs to draft valid widget and theme JSON for its user: the `CustomWidget` shape (`{ kind, template, descriptor }` with the descriptor's fields, including `dataSchemaRef` — a saved shared schema referenced by name IN PLACE of an inline `dataSchema`, never both), the theme entry shape (`{ name, label?, description?, tokens, styles? }` — `styles` defining shared `.wg-` classes under the same rules as a widget's styles, which widgets rendered under the theme can use; which theme is a default is a principal setting the person chooses in the designer's Settings, not part of the entry), the shared-schema entry shape (`{ name, label?, description?, schema }` — what the user imports in the Data schemas section), the shared-ACTION entry shape (`{ name, label?, description?, definition }` — what the user imports in the Actions section, with both definition kinds and the action name pattern, which is stricter than the identifier charset used for widgets, themes and schemas), a label-style rule, taken from the core package's exported rule, for the labels a template writes as literals and the `labels` hint of the built-in `card` and `table` (Title Case unless the user asks for another style or language), the template DSL's node forms (text, `bind`, `each`/`empty`, `when`/`else`, elements with attrs including `{ bind }` values and the attr transforms `{ bind, map, default? }` / `{ bind, prefix }` and the value transform `{ bind, format }` with its closed number/currency/date vocabulary, each taught with its motivating recipe — a status value selecting a `wg-status-*` class, `mailto:`/`tel:` links from bound addresses, and a numeric-string price formatted as a currency) and safety rules (no `on*` attributes, URL scheme allowlist, base64 `data:image/*` on `img src` only, depth and node bounds), the identifier charset and the reserved built-in kinds, the styles rules (`.wg-` selectors, banned constructs), the `dataSchema` subset including its `pattern` bounds, a data-modeling preference (bind only schema-declared properties; `$meta.*` is outside `dataSchema` validation and SHALL be discouraged rather than promoted), a shared-schema rule — when the user names a saved schema, reference it with `dataSchemaRef` and discover its shape with `list_schemas`; do NOT reconstruct it inline, since the copy forks the moment the user edits the shared one —, a shared-ACTION rule — an element binds one with `action: { "ref": "<name>", input?, output? }` and a widget loads one at first render with a `load` binding (http `GET` only); discover what exists with `list_actions` and reference it by name, and when nothing fits DESCRIBE the action the user should author and test in the designer rather than drafting an inline definition with a URL or credentials the agent cannot know —, the token registry with each token's type and use, the per-principal limits — including the caps on shared schemas and shared actions, so an agent can see the ceiling it drafts against —, and a `workflow` section stating that agents draft JSON while users import, validate, and save it in the authenticated designer — registration over MCP does not exist by design. Facts with a live source of truth SHALL be derived from it at call time — including the custom-variable name pattern, the banned style substrings, the style property allowlist, the schema `pattern` length cap, and the action name pattern, each read from its owning constant (reserved kinds from the catalog, limits from the store defaults, tokens from the token registry), never duplicated as prose.

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

#### Scenario: The guide carries the label style
- **WHEN** `get_authoring_guide` is called
- **THEN** its result SHALL contain the core package's exported label-style rule verbatim

### Requirement: Runtime-neutral host bundle
The package SHALL export from a `./host` entry `createWidgenticHost(config: string)`. Its default import condition SHALL resolve to ONE self-contained ES module with no `import` statements. Evaluating it SHALL require nothing beyond ECMAScript 2022 and ECMA-402 (`Intl`): no `node:` module, no `process`, no `Buffer`, no `require`, and no web API, so any embedded JavaScript engine with `Intl` can host widgentic.

`config` is a JSON string carrying optional `widgets` (designer-exported widget definitions `{ kind, template, descriptor, load? }`), `themes` (theme entries `{ name, label?, description?, tokens, styles? }`) `schemas` (shared schema entries `{ name, label?, description?, schema }`) and `resourceDomains` (the embedding server's own list of domains the app frame may load assets from, as `createWidgenticServer` takes it). Every entry SHALL be validated with the same checks and structured codes the store applies on write, and built-in kinds and the `light`/`dark` theme names stay reserved. An invalid entry SHALL be skipped and reported, never served and never thrown. A `resourceDomains` entry SHALL be read by the store's resource-domain rule, and one it refuses SHALL be reported under the section `resourceDomains` with code `INVALID_DOMAIN` and skipped.

`config` MAY also carry `settings`, a principal settings record in the store's shape (`{ defaultThemes?: { light?, dark? }, resourceDomains?: string[] }`), so a host can choose its default themes and declare its resource domains. An absent or `null` record means no settings. Any other value SHALL be checked with the store's write rules for settings:
- An unknown section, an unknown mode, or a name that is not a string SHALL be reported as `INVALID_SHAPE`.
- A default naming a theme the host does not serve SHALL be reported as `UNKNOWN_THEME`. That covers a built-in name, a theme the config does not carry, and a configured theme that was refused.
- A `resourceDomains` value that is not an array of strings, or that holds more than the limit, SHALL be reported as `INVALID_SHAPE`, and an entry the resource-domain rule refuses as `INVALID_DOMAIN`, naming it.

A reported setting SHALL be skipped, and SHALL be listed by `problems()` under the section `settings`, never thrown. A skipped default leaves its mode on the built-in, and a skipped domain is not declared. The defaults a valid record sets SHALL apply exactly as the Node assembly applies a principal's stored defaults: to `render_widget` and `preview_widget` output, to `widgetPage(kind)`, and to `list_themes`' `defaults`. Without `settings`, every output SHALL be byte-identical to a host created before settings existed.

The returned host SHALL take and return strings only, apart from the boolean `slim` flag of `call`:
- `version()`: the `@widgentic/mcp` version the bundle was built from, taken from its manifest at build time.
- `problems()`: a JSON array of `{ section, index, name, code, message }`, one per refused entry or setting.
- `definitions()`: the JSON of the tool definitions this host serves, taken from the same exported definitions as the Node assembly, with name, description and JSON-Schema `inputSchema`. The tools are `list_widgets`, `render_widget`, `list_theme_tokens`, `list_themes`, `list_schemas` and `get_authoring_guide`, plus the template's own `preview_widget`, which is marked `visibility: ["app"]` as the Node assembly registers it.
- `call(name, argsJson, slim)`: the MCP tool result JSON of that tool's handler, with the slim flag passed through to `render_widget`. `preview_widget` SHALL be answered by the same handler as in the Node assembly, through the host's composed catalog and themes, with no rate gate: rate-limiting previews belongs to the embedding server's transport. An unknown tool name SHALL return an `isError` result, never throw.
- `resources()`: the JSON of the served documents (the app template and the preview-page template) with name, URI or URI template, MIME type and description, taken from the same constants the Node assembly registers them with. For the app template it also gives `prefersBorder` and `resourceDomains`. `resourceDomains` lists the accepted entries of `config.resourceDomains` followed by those of `settings.resourceDomains`, in canonical `https://` origin form and deduplicated in first-seen order: the list the Node assembly declares for the same operator list and settings. The key SHALL be absent when no entry is accepted.
- `appTemplate()`: exactly `buildAppTemplate()`.
- `widgetPage(kind)`: the preview page the Node assembly serves for `ui://widgentic/page/{kind}`.

The host SHALL be render-only. Templates SHALL be compiled with http actions disabled for the `unresolved` reason. No `structuredContent.load` or `structuredContent.loads` SHALL be emitted. `execute_action` and `list_actions` SHALL NOT be served. Prompt action descriptors SHALL be unchanged. The bundle SHALL perform no network access, so server-side image inlining is not part of it.

Inside the bundle, `URL` SHALL resolve to the platform's implementation when the global exists, and otherwise to a bundled, spec-compliant WHATWG URL implementation. Evaluating the bundle SHALL NOT create or modify any global binding, and the host SHALL keep no data from one call to the next.

The repository SHALL keep a generated conformance corpus: render inputs paired with the exact Node-path outputs. It SHALL cover every served tool, `preview_widget` included, plus the built-in kinds, a group, named and inline themes (a named theme with styles included, as a render, a page and a preview), default themes from `settings` (a light default only, a dark default only, two defaults with styles, and one theme for both modes, each as a render, a page, a preview and `list_themes`), resource domains (operator entries, a settings section, and the two combined, each as `resources()`; a refused entry is covered by each runtime's host tests instead, because an embedding host may refuse such a configuration at startup), contract errors, hint diagnostics, number and currency formats including non-English locales, field labels (a card and a table with `hints.labels`), URL edge cases, and the example template widgets (with and without actions). The default gate SHALL fail when the committed corpus differs from the current Node output, or when the bundle evaluated in a bare realm (no globals beyond ECMAScript and `Intl`) produces any output that differs from the corpus.

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

#### Scenario: Settings choose the host's default themes
- **WHEN** a host is created with a configured theme `brand` and `settings: { defaultThemes: { light: "brand" } }`, and `render_widget` runs with no `theme`
- **THEN** the output SHALL equal the Node assembly's for a principal whose stored settings choose `brand` as the light default
- **AND** `list_themes` SHALL report `defaults: { "light": "brand", "dark": "dark" }`

#### Scenario: A default naming no served theme is reported
- **WHEN** `settings` names `ghost` as the dark default and the config carries no theme `ghost`
- **THEN** `problems()` SHALL list one entry with section `settings` and code `UNKNOWN_THEME`, the host SHALL be created, and the dark default SHALL stay the built-in

#### Scenario: Malformed settings are reported, not thrown
- **WHEN** `settings` carries an unknown section, or a mode other than `light` and `dark`
- **THEN** `problems()` SHALL list `INVALID_SHAPE` under section `settings`, and the host SHALL be created with the built-in defaults

#### Scenario: Declared domains are reported canonical
- **WHEN** a host is created with `resourceDomains: ["assets.example.org"]` and `settings: { resourceDomains: ["CDN.example.com", "https://*.example.net/", "https://assets.example.org"] }`
- **THEN** `resources()` SHALL give the app template `resourceDomains: ["https://assets.example.org", "https://cdn.example.com", "https://*.example.net"]`, and `problems()` SHALL be `[]`
- **AND** a host created with neither SHALL give no `resourceDomains` key, with `resources()` byte-identical to a host created before resource domains existed

#### Scenario: Refused domains are reported, not declared
- **WHEN** a host is created with `resourceDomains: ["http://old.example.com"]` and `settings: { resourceDomains: ["cdn.example.com", "localhost"] }`
- **THEN** `problems()` SHALL list `INVALID_DOMAIN` under section `resourceDomains` naming `http://old.example.com` and `INVALID_DOMAIN` under section `settings` naming `localhost`, the host SHALL be created, and `resources()` SHALL declare only `https://cdn.example.com`
