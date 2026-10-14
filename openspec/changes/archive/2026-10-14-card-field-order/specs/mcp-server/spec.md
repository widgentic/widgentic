## ADDED Requirements

### Requirement: Previews follow the card field order
The app template's client-built `card` preview SHALL apply `hints.fields` as the renderer does: the listed fields, in the listed order, skipping keys not yet received. A preview therefore keeps the order the result will have, and the tool result's render stays the authority.

#### Scenario: A streamed card previews in the hinted order
- **WHEN** partial input for `card` carries `hints: { fields: ["role", "company"] }` before `data: { fields: { company: "Northwind", role: "Designer", avatar: "x" } }`
- **THEN** the preview's field keys SHALL read `role` then `company`, with no `avatar` row, as the tool result's render does
- **AND WHEN** only `company` has arrived
- **THEN** the preview SHALL show `company` alone

## MODIFIED Requirements

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
- `definitions()`: the JSON of the tool definitions this host serves, taken from the same exported definitions as the Node assembly, with name, description, JSON-Schema `inputSchema` and `annotations`. The tools are `list_widgets`, `render_widget`, `list_theme_tokens`, `list_themes`, `list_schemas` and `get_authoring_guide`, plus the template's own `preview_widget`, which is marked `visibility: ["app"]` as the Node assembly registers it.
- `call(name, argsJson, slim)`: the MCP tool result JSON of that tool's handler, with the slim flag passed through to `render_widget`. `preview_widget` SHALL be answered by the same handler as in the Node assembly, through the host's composed catalog and themes, with no rate gate: rate-limiting previews belongs to the embedding server's transport. An unknown tool name SHALL return an `isError` result, never throw.
- `resources()`: the JSON of the served documents (the app template and the preview-page template) with name, URI or URI template, MIME type and description, taken from the same constants the Node assembly registers them with. For the app template it also gives `prefersBorder` and `resourceDomains`. `resourceDomains` lists the accepted entries of `config.resourceDomains` followed by those of `settings.resourceDomains`, in canonical `https://` origin form and deduplicated in first-seen order: the list the Node assembly declares for the same operator list and settings. The key SHALL be absent when no entry is accepted.
- `appTemplate()`: exactly `buildAppTemplate()`.
- `widgetPage(kind)`: the preview page the Node assembly serves for `ui://widgentic/page/{kind}`.

The host SHALL be render-only. Templates SHALL be compiled with http actions disabled for the `unresolved` reason. No `structuredContent.load` or `structuredContent.loads` SHALL be emitted. `execute_action` and `list_actions` SHALL NOT be served. Prompt action descriptors SHALL be unchanged. The bundle SHALL perform no network access, so server-side image inlining is not part of it.

Inside the bundle, `URL` SHALL resolve to the platform's implementation when the global exists, and otherwise to a bundled, spec-compliant WHATWG URL implementation. Evaluating the bundle SHALL NOT create or modify any global binding, and the host SHALL keep no data from one call to the next.

The repository SHALL keep a generated conformance corpus: render inputs paired with the exact Node-path outputs. It SHALL cover every served tool, `preview_widget` included, plus the built-in kinds, a group, named and inline themes (a named theme with styles included, as a render, a page and a preview), default themes from `settings` (a light default only, a dark default only, two defaults with styles, and one theme for both modes, each as a render, a page, a preview and `list_themes`), resource domains (operator entries, a settings section, and the two combined, each as `resources()`; a refused entry is covered by each runtime's host tests instead, because an embedding host may refuse such a configuration at startup), contract errors, hint diagnostics, number and currency formats including non-English locales, the text formats (a join, a truncate, and pluralize in English and in a locale with `few` and `many` forms), Markdown text binds (every construct of the subset, a refused link and literal HTML), field labels (a card and a table with `hints.labels`), card field order (a card with `hints.fields` ordering and selecting its fields, a missing key among them), URL edge cases, and the example template widgets (with and without actions). The default gate SHALL fail when the committed corpus differs from the current Node output, or when the bundle evaluated in a bare realm (no globals beyond ECMAScript and `Intl`) produces any output that differs from the corpus.

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
