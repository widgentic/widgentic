## ADDED Requirements

### Requirement: Runtime-neutral host bundle
The package SHALL export from a `./host` entry `createWidgenticHost(config: string)`. Its default import condition SHALL resolve to ONE self-contained ES module with no `import` statements. Evaluating it SHALL require nothing beyond ECMAScript 2022 and ECMA-402 (`Intl`): no `node:` module, no `process`, no `Buffer`, no `require`, and no web API, so any embedded JavaScript engine with `Intl` can host widgentic.

`config` is a JSON string carrying optional `widgets` (designer-exported widget definitions `{ kind, template, descriptor, load? }`), `themes` (theme entries `{ name, label?, description?, extends?, tokens }`) and `schemas` (shared schema entries `{ name, label?, description?, schema }`). Every entry SHALL be validated with the same checks and structured codes the store applies on write, and built-in kinds and the `light`/`dark` theme names stay reserved. An invalid entry SHALL be skipped and reported, never served and never thrown.

The returned host SHALL take and return strings only, apart from the boolean `slim` flag of `call`:
- `version()`: the `@widgentic/mcp` version the bundle was built from, taken from its manifest at build time.
- `problems()`: a JSON array of `{ section, index, code, message }`, one per refused entry.
- `definitions()`: the JSON of the tool definitions this host serves — `list_widgets`, `render_widget`, `list_theme_tokens`, `list_themes`, `list_schemas` and `get_authoring_guide` — taken from the same exported definitions as the Node assembly, with name, description and JSON-Schema `inputSchema`.
- `call(name, argsJson, slim)`: the MCP tool result JSON of that tool's handler, with the slim flag passed through to `render_widget`. An unknown tool name SHALL return an `isError` result, never throw.
- `resources()`: the JSON of the served documents (the app template and the preview-page template) with name, URI or URI template, MIME type and description, taken from the same constants the Node assembly registers them with.
- `appTemplate()`: exactly `buildAppTemplate()`.
- `widgetPage(kind)`: the preview page the Node assembly serves for `ui://widgentic/page/{kind}`.

The host SHALL be render-only. Templates SHALL be compiled with http actions disabled for the `unresolved` reason. No `structuredContent.load` or `structuredContent.loads` SHALL be emitted. `execute_action` and `list_actions` SHALL NOT be served. Prompt action descriptors SHALL be unchanged. The bundle SHALL perform no network access, so server-side image inlining is not part of it.

Inside the bundle, `URL` SHALL resolve to the platform's implementation when the global exists, and otherwise to a bundled, spec-compliant WHATWG URL implementation. Evaluating the bundle SHALL NOT create or modify any global binding, and the host SHALL keep no data from one call to the next.

The repository SHALL keep a generated conformance corpus: render inputs paired with the exact Node-path outputs. It SHALL cover the built-in kinds, a group, named and inline themes, contract errors, hint diagnostics, number and currency formats including non-English locales, URL edge cases, and the example template widgets (with and without actions). The default gate SHALL fail when the committed corpus differs from the current Node output, or when the bundle evaluated in a bare realm (no globals beyond ECMAScript and `Intl`) produces any output that differs from the corpus.

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
- **THEN** each tool's `name`, `description` and `inputSchema` SHALL deep-equal the corresponding exported tool definition, and the list SHALL contain no `execute_action` and no `list_actions`

#### Scenario: Unknown tools are results
- **WHEN** `call("execute_action", "{}", false)` runs
- **THEN** it SHALL return an `isError` result with a structured `UNKNOWN_TOOL` code and SHALL NOT throw

#### Scenario: No global is touched
- **WHEN** the names of the global object's own properties are recorded before evaluating the bundle in a bare realm and again after creating a host and rendering every corpus input
- **THEN** the two lists SHALL be identical, and `URL` SHALL still be undefined after a render that parsed URLs

#### Scenario: Calls carry no state
- **WHEN** a host renders payload A and then payload B
- **THEN** B's output SHALL be byte-identical to B rendered by a freshly created host, and SHALL contain no string that appears only in A
