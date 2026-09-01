## ADDED Requirements

### Requirement: Action listing tool
The server SHALL expose a read-only `list_actions` tool returning the presented key's stored shared actions, so an agent asked to wire "my weather action" can bind it by name and map its arguments from the widget's data. Each entry SHALL carry the action's `name`, its optional `label` and `description`, its `kind`, and — for an `http` action — its `method` and its `input` and `output` schemas; a `prompt` entry SHALL instead carry `binds`, the data paths its text references, because a prompt takes no input mapping and those paths are the contract a binding widget's data must satisfy. The listing SHALL be the action's CONTRACT and never its transport: `url`, `headers` and `query` SHALL be absent from every entry, because no binding an agent drafts needs them and a read-only key travels into prompt-injectable hosts, where an author's literal query or header value would otherwise become readable — the same reason `execute_action` refuses to let a request supply a URL, method, headers or schema. The listing SHALL serve the principal resolved from the request's key exactly like `list_widgets`: an anonymous or unknown key sees an empty list, never an error, and a stored action that fails validation on read SHALL be omitted rather than failing the call. The tool's wire-visible description and the result's own rules SHALL steer agents to bind a listed action by name (`action: { "ref": "<name>" }`), SHALL state that a prompt reference takes NO input mapping, and, when no listed action fits, SHALL tell them to DESCRIBE the action they would need so the user can author and test it in the designer, rather than drafting an inline definition with a URL or credentials the agent cannot know. Reading the actions SHALL cost nothing at server construction: the store is consulted when the tool is called.

#### Scenario: The listing serves the key's own actions
- **WHEN** `list_actions` is called with a key whose principal stores an http action `weather-current`
- **THEN** the result SHALL parse as JSON containing that entry's `name`, `kind`, `method` and its `input` and `output` schemas
- **AND** the same call with an unknown or absent key SHALL return an empty list, not an error

#### Scenario: The transport never leaves the server
- **WHEN** a listed action's stored definition carries a `url`, fixed `query` parameters and `headers` including a `{ secret }` reference
- **THEN** none of the URL, the header names or values, and the query names or values SHALL appear anywhere in the result

#### Scenario: A prompt's contract is its bound paths
- **WHEN** a stored prompt action's text is `["What should I wear in ", { "bind": "city" }, "?"]`
- **THEN** its entry SHALL carry `kind: "prompt"` and `binds: ["city"]` with no method or schemas
- **AND** the result's rules SHALL state that a prompt reference takes no input mapping

#### Scenario: The wire description steers to references
- **WHEN** an SDK client lists tools
- **THEN** `list_actions` SHALL appear with a description telling agents to bind a listed action by name and to describe — never invent — an action the user has not saved

#### Scenario: An invalid stored action does not break discovery
- **WHEN** one of a principal's stored actions fails validation on read
- **THEN** `list_actions` SHALL return the valid entries and omit the invalid one

#### Scenario: Listing actions costs nothing until it is called
- **WHEN** a server is constructed with an action source and `render_widget` is called
- **THEN** the source SHALL NOT be read for the listing — only a `list_actions` call reads it

## MODIFIED Requirements

### Requirement: Authoring guide tool
The server SHALL expose a read-only `get_authoring_guide` tool whose result is a structured JSON guide containing everything an external agent needs to draft valid widget and theme JSON for its user: the `CustomWidget` shape (`{ kind, template, descriptor }` with the descriptor's fields, including `dataSchemaRef` — a saved shared schema referenced by name IN PLACE of an inline `dataSchema`, never both), the theme entry shape (`{ name, label?, description?, tokens }`), the shared-schema entry shape (`{ name, label?, description?, schema }` — what the user imports in the Data schemas section), the shared-ACTION entry shape (`{ name, label?, description?, definition }` — what the user imports in the Actions section, with both definition kinds and the action name pattern, which is stricter than the identifier charset used for widgets, themes and schemas), the template DSL's node forms (text, `bind`, `each`/`empty`, `when`/`else`, elements with attrs including `{ bind }` values and the attr transforms `{ bind, map, default? }` / `{ bind, prefix }`, each taught with its motivating recipe — a status value selecting a `wg-status-*` class, and `mailto:`/`tel:` links from bound addresses) and safety rules (no `on*` attributes, URL scheme allowlist, base64 `data:image/*` on `img src` only, depth and node bounds), the identifier charset and the reserved built-in kinds, the styles rules (`.wg-` selectors, banned constructs), the `dataSchema` subset including its `pattern` bounds, a data-modeling preference (bind only schema-declared properties; `$meta.*` is outside `dataSchema` validation and SHALL be discouraged rather than promoted), a shared-schema rule — when the user names a saved schema, reference it with `dataSchemaRef` and discover its shape with `list_schemas`; do NOT reconstruct it inline, since the copy forks the moment the user edits the shared one —, a shared-ACTION rule — an element binds one with `action: { "ref": "<name>", input?, output? }` and a widget loads one at first render with a `load` binding (http `GET` only); discover what exists with `list_actions` and reference it by name, and when nothing fits DESCRIBE the action the user should author and test in the designer rather than drafting an inline definition with a URL or credentials the agent cannot know —, the token registry with each token's type and use, the per-principal limits — including the caps on shared schemas and shared actions, so an agent can see the ceiling it drafts against —, and a `workflow` section stating that agents draft JSON while users import, validate, and save it in the authenticated designer — registration over MCP does not exist by design. Facts with a live source of truth SHALL be derived from it at call time — including the custom-variable name pattern, the banned style substrings, the style property allowlist, the schema `pattern` length cap, and the action name pattern, each read from its owning constant (reserved kinds from the catalog, limits from the store defaults, tokens from the token registry), never duplicated as prose.

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
- **THEN** they SHALL tell agents that a theme the user wants to keep is delivered as the importable entry (`{ name, label?, description?, tokens }`) for the designer at widgentic.dev, referencing `get_authoring_guide` — the inline token map styles only one render

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

#### Scenario: The guide teaches the standalone action entry shape and its import path
- **WHEN** the guide's shared-action section is read
- **THEN** it SHALL document the entry shape (`{ name, label?, description?, definition }`) with both definition kinds, SHALL state the action name pattern read from the constant that enforces it, and SHALL state that the user imports the entry in the Actions section at widgentic.dev

#### Scenario: The guide teaches referencing a saved action over inventing one
- **WHEN** the template rules are read
- **THEN** they SHALL document the `action: { "ref": "<name>" }` binding and the widget-level `load` (http `GET` only), SHALL steer agents to `list_actions` for what the user already has, and SHALL state that an action the user has not saved is DESCRIBED for the designer rather than drafted with an invented URL or credential

#### Scenario: The published limits cover every entry an agent drafts
- **WHEN** the `limits` section is read
- **THEN** it SHALL carry the caps on shared schemas and shared actions beside the widget and theme caps, each equal to the store's documented default

### Requirement: Action execution tool
The server SHALL expose an app-only tool, `execute_action`, registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"` and `_meta.ui.visibility: ["app"]` so Apps hosts hide it from the model and let the mounted widget call it; its description SHALL state that it is called by widgets, not by agents (non-Apps clients still list it — the SDK does not filter). Its input SHALL be `{ widget: string, action: string, args?: object, payload: WidgetPayload, at?: string, item?: string }` where `action` is a binding identifier (a dotted template path or `"load"`), `payload` is the ROOT payload as the frame holds it, and — when the bound element belongs to an item of a `group` render — `at` is the dotted path of that item's payload within the root (e.g. `data.items.2`) and `item` its kind. The handler SHALL: resolve the binding on the item's kind when `at` is given (otherwise on `widget`) from the caller's composed catalog (the stored template's binding at that path, or the referenced shared action) — never from the request; require the `execute` scope; validate `args` against the action's input schema; execute per the widget-actions capability (SSRF-guarded https fetch, secrets injected, response validated); apply the output mode to `payload.data`; re-validate and re-render the payload exactly as `render_widget` would; and return the same `structuredContent: { html, css, payload, tree, diagnostics? }` (with inlined images) plus the slim text line; for a group item the response folds into THAT item's data and the whole group re-renders. Failures SHALL follow the rendering error contract with codes `UNKNOWN_KIND`, `UNKNOWN_ACTION`, `ACTION_NOT_HTTP`, `FORBIDDEN_SCOPE`, `INVALID_ACTION_INPUT`, `UNKNOWN_SECRET`, `ACTION_FETCH_FAILED`, `INVALID_ACTION_OUTPUT`, `RATE_LIMITED`; every message SHALL be scrubbed of secret values. `action` SHALL be a non-empty string (`MISSING_FIELD` otherwise); `at` SHALL match `data.items.<i>` exactly (`INVALID_TYPE` otherwise); failure messages SHALL never forward store or vault error text — a fixed message is returned and the detail is logged server-side; the designer's test path (`testHttpAction`) SHALL validate the definition before doing anything and return a structured `{ ok: false, code, message, path? }` for malformed input instead of throwing. The tool's wire schema descriptions SHALL derive from `EXECUTE_ACTION_TOOL` exactly as `render_widget`'s do.

#### Scenario: The tool is declared for apps only
- **WHEN** an SDK client lists tools
- **THEN** `execute_action` SHALL carry `_meta.ui.resourceUri` for the app template and `_meta.ui.visibility: ["app"]`

#### Scenario: A refresh re-renders through the same pipeline
- **WHEN** a principal's stored widget `weather` binds a button at path `children.2` to a GET action, and `execute_action` is called with `{ widget: "weather", action: "children.2", args: { city: "Oslo" }, payload }`
- **THEN** the result's `structuredContent.tree` SHALL be the render of the merged payload and `renderToHtml(tree)` SHALL equal `structuredContent.html`
- **AND** `structuredContent.payload.data` SHALL reflect the response under the binding's output mode

#### Scenario: Unknown bindings and prompt bindings are refused
- **WHEN** `action` names a path that carries no binding, or one whose action is a `prompt`
- **THEN** the result SHALL be `isError: true` with `UNKNOWN_ACTION` or `ACTION_NOT_HTTP` respectively

#### Scenario: Another principal's widget cannot be executed
- **WHEN** principal B calls `execute_action` for a kind only principal A owns
- **THEN** the result SHALL be `UNKNOWN_KIND` and nothing SHALL be fetched

#### Scenario: An item inside a group executes against its own kind and the group re-renders
- **WHEN** a `group` renders a `weather` item whose Refresh descriptor carries `at: "data.items.0"` and `widget: "weather"`, and `execute_action` is called with `{ widget: "group", action: "children.1", at: "data.items.0", item: "weather", args, payload: <the group payload> }`
- **THEN** the binding SHALL resolve on `weather`, the response SHALL fold into `data.items[0].data`, and the result SHALL be the re-rendered GROUP with every other item unchanged

#### Scenario: Errors never carry secret values
- **WHEN** an action fails after resolving a secret and the failure text would include the value
- **THEN** the tool text SHALL contain `***` in its place

#### Scenario: Empty ids and stray locations are refused
- **WHEN** `execute_action` is called with `action: ""`, or with `at: "meta.x"`
- **THEN** the result SHALL be `MISSING_FIELD` / `INVALID_TYPE` and nothing SHALL be fetched

#### Scenario: Backend errors are not echoed
- **WHEN** secret resolution throws a vault error carrying a key identifier
- **THEN** the tool text SHALL read a fixed message (no identifier) and the detail SHALL appear only in the server log

#### Scenario: A malformed test definition yields a structured result
- **WHEN** `testHttpAction` receives `{ kind: "http" }` with no `url` or `input`
- **THEN** it SHALL return `{ ok: false, code: "INVALID_ACTION_INPUT", … }` rather than throwing
