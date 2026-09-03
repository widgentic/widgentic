# designer-webmcp Specification

## Purpose
The mounted widgentic designers exposed as WebMCP tools, so a browser-side agent working in the same page as a person can read and edit the drafts the person is looking at — the agent edits, the person saves. Ships in `@widgentic/webmcp` (beta).

## Requirements

### Requirement: Designer tools are derived from the designer handles
The package SHALL build WebMCP tool descriptors from host-supplied designer sources — a getter per designer (`widget`, `theme`, `schema`, `action`, any subset) that returns the currently mounted handle or nothing — and SHALL register only the tools whose designer source was supplied, plus three reference tools that need no designer. Each descriptor SHALL carry a `name` composed of a host-configurable prefix (default `widgentic`) and a fixed suffix, a `description` written for the agent (the shape it must send, what it gets back, and that the person saves), a JSON-Schema `inputSchema` with `additionalProperties: false`, `annotations.readOnlyHint` true for every tool that changes nothing, and an `execute` callback. The tool set SHALL be: `<prefix>_widget_draft_get` (read-only), `<prefix>_widget_draft_load`, `<prefix>_widget_example_data_set`, `<prefix>_widget_theme_set` for the widget designer; `<prefix>_theme_get` (read-only), `<prefix>_theme_load`, `<prefix>_theme_tokens_set` for the theme designer; `<prefix>_schema_get` (read-only) and `<prefix>_schema_load`; `<prefix>_action_get` (read-only) and `<prefix>_action_load`; and the reference tools `<prefix>_authoring_guide`, `<prefix>_widget_definition_check` and `<prefix>_theme_token_specs` (all read-only). Every editing tool's description SHALL carry a summary of the authoring contract the designers enforce — the template DSL forms (`bind`, `each`, `when`, elements), the `map`, `prefix` and `format` transforms and their one-per-value rule, the forbidden tags and attributes, the `.wg-` style rule with `var(--wg-*)` tokens, the required descriptor fields and the identifier rule — and SHALL name the guide and check tools, so an agent that reads only the tool list drafts by the same rules as one that read the MCP authoring guide. The descriptor factory SHALL be a pure function usable without any browser model-context API, so hosts and tests can inspect the tools before registering them.

#### Scenario: Only supplied designers get tools
- **WHEN** descriptors are built from sources holding a `widget` getter only
- **THEN** exactly the four widget tools and the three reference tools SHALL be produced, and no theme, schema or action tool

#### Scenario: Names follow the prefix
- **WHEN** descriptors are built with the prefix `acme`
- **THEN** every tool name SHALL start with `acme_` and the widget draft tool SHALL be `acme_widget_draft_get`
- **AND WHEN** no prefix is given
- **THEN** the same tool SHALL be `widgentic_widget_draft_get`

#### Scenario: Read tools are annotated read-only
- **WHEN** the descriptors are inspected
- **THEN** every `*_get` tool and the three reference tools SHALL carry `annotations.readOnlyHint === true`, and every `*_load` and `*_set` tool SHALL NOT

#### Scenario: Input schemas are closed
- **WHEN** any descriptor's `inputSchema` is inspected
- **THEN** it SHALL be an object schema with `additionalProperties: false` naming every accepted argument

#### Scenario: The editing tools teach the contract
- **WHEN** the widget draft-load tool's description is read
- **THEN** it SHALL mention `bind`, `each`, `when`, `map`, `prefix`, `format`, the `.wg-` style rule, `var(--wg-`, `dataShape`, and the names of the guide and check tools under the configured prefix

### Requirement: Widget designer tools edit the live draft
`<prefix>_widget_draft_get` SHALL return the current draft in the designer's export shape (`kind`, `template`, `descriptor`, and `load` when present) together with the designer's current diagnostics. `<prefix>_widget_draft_load` SHALL accept `{ definition }` and load it through the designer's own validation, returning the validation errors when it is refused and the new diagnostics when it is applied. `<prefix>_widget_example_data_set` SHALL accept `{ data }` and replace the draft descriptor's example data (the data the preview renders), returning the diagnostics that result — including the example-versus-schema verdict. `<prefix>_widget_theme_set` SHALL accept `{ tokens }` and apply them as the draft's preview theme through the designer's theme validation, returning the error when refused. Every edit SHALL be visible in the mounted designer immediately, with no reload and no host involvement.

#### Scenario: The agent reads what the person sees
- **WHEN** a widget designer holds a draft of kind `invoice` and `<prefix>_widget_draft_get` executes
- **THEN** the result SHALL carry `kind: "invoice"`, the draft's template and descriptor, and `diagnostics.previewable`

#### Scenario: A drafted definition lands in the designer
- **WHEN** `<prefix>_widget_draft_load` executes with a valid definition of kind `order-summary`
- **THEN** the designer's draft SHALL become that definition, the result SHALL report `ok: true`, and the designer's own subscribers SHALL have been notified

#### Scenario: A bad definition is refused with the designer's words
- **WHEN** `<prefix>_widget_draft_load` executes with a definition whose template is invalid
- **THEN** the draft SHALL be unchanged and the result SHALL report `ok: false` with the same error strings the designer's import panel would show

#### Scenario: Example data updates the preview
- **WHEN** `<prefix>_widget_example_data_set` executes with an object
- **THEN** the draft's `descriptor.dataExample` SHALL equal that object and the result SHALL carry the diagnostics, so a mismatch with the data schema is reported rather than silently previewed

#### Scenario: Preview theme tokens are validated
- **WHEN** `<prefix>_widget_theme_set` executes with `{ tokens: { accent: "#0a84ff" } }`
- **THEN** the draft's theme SHALL carry that token
- **AND WHEN** it executes with an unknown token name
- **THEN** the result SHALL report `ok: false` with the theming validator's message and the draft theme SHALL be unchanged

### Requirement: Theme, schema and action designer tools mirror their handles
`<prefix>_theme_get`, `<prefix>_schema_get` and `<prefix>_action_get` SHALL return the current entry of their designer. `<prefix>_theme_load`, `<prefix>_schema_load` and `<prefix>_action_load` SHALL accept `{ entry }` and load it through the designer's own validation, returning its errors when refused. `<prefix>_theme_tokens_set` SHALL accept `{ tokens, remove? }`, merge `tokens` into the current entry's tokens, drop the names listed in `remove`, and load the merged entry through the same validation, so an invalid token leaves the entry unchanged.

#### Scenario: A theme entry round-trips
- **WHEN** `<prefix>_theme_load` executes with `{ entry: { name: "ocean", tokens: { bg: "#001b2e" } } }` and then `<prefix>_theme_get` executes
- **THEN** the second result SHALL carry `name: "ocean"` and `tokens.bg: "#001b2e"`

#### Scenario: Tokens merge into the current theme
- **WHEN** the theme designer holds `{ bg: "#fff", fg: "#000" }` and `<prefix>_theme_tokens_set` executes with `{ tokens: { accent: "#0a84ff" }, remove: ["fg"] }`
- **THEN** the entry's tokens SHALL be exactly `{ bg: "#fff", accent: "#0a84ff" }`

#### Scenario: A schema entry is refused at the door
- **WHEN** `<prefix>_schema_load` executes with an entry whose `name` is empty
- **THEN** the result SHALL report `ok: false` with the schema designer's error and the current entry SHALL be unchanged

#### Scenario: An action entry loads
- **WHEN** `<prefix>_action_load` executes with a valid prompt action entry named `ask-more`
- **THEN** `<prefix>_action_get` SHALL return that entry

### Requirement: The token reference tool derives from the exported specs
`<prefix>_theme_token_specs` SHALL return every `--wg-*` theme token with its name, type, default, purpose text and fallback token, derived at call time from the theming capability's exported token specifications rather than restated. `<prefix>_authoring_guide` SHALL return the complete authoring contract in the same structure as the MCP server's `get_authoring_guide` — workflow, widget shape, shared schema, shared action, theme, template rules (forms, actions, safety, bounds, data modeling), style rules, data-schema subset and limits — derived from the core package's exported constants and validators wherever one exists, with the workflow rewritten for the browser: the agent loads into the open designer and the person saves. `<prefix>_widget_definition_check` SHALL validate a definition without touching any designer, returning what the load tool would return: the designer's errors when refused, the derived diagnostics when accepted.

#### Scenario: Every token is listed
- **WHEN** `<prefix>_theme_token_specs` executes
- **THEN** the result SHALL list exactly the documented tokens, each with `name`, `type`, `default` and `use`, and `surface` SHALL name `bg` as its fallback

#### Scenario: The guide is the validators' own words
- **WHEN** `<prefix>_authoring_guide` executes
- **THEN** its reserved kinds SHALL equal the catalog's kinds, its theme tokens SHALL equal the exported token specifications, its template forms SHALL cover bind, each, when, element, attribute map, attribute prefix, format and the one-transform rule with rendered format examples, and its workflow SHALL name the prefixed load tool

#### Scenario: A definition is checked without side effects
- **WHEN** `<prefix>_widget_definition_check` executes with a valid definition whose example data violates its schema
- **THEN** the result SHALL be `ok: true` with `diagnostics.example` set, and no designer SHALL have changed
- **AND WHEN** it executes with an invalid template
- **THEN** the result SHALL be `ok: false` with code `REJECTED` and the same errors the designer's import would show

### Requirement: Results are structured, never thrown
Every tool's `execute` SHALL resolve to `{ content: [{ type: "text", text }] }` where `text` is a JSON document with a boolean `ok`. Refusals SHALL be results, not rejections: a designer source that returns nothing yields `ok: false` with code `NOT_MOUNTED`; arguments that do not match the input schema yield `ok: false` with code `INVALID_INPUT` and the offending argument; a designer's validation refusal yields `ok: false` with code `REJECTED` and the designer's error strings. The only rejection a caller SHALL observe is the browser's own abort.

#### Scenario: An unmounted designer is reported
- **WHEN** the `theme` source returns nothing and `<prefix>_theme_get` executes
- **THEN** the promise SHALL resolve with text whose JSON has `ok: false` and `code: "NOT_MOUNTED"`

#### Scenario: A malformed argument is reported
- **WHEN** `<prefix>_widget_draft_load` executes with `{ definition: "not an object" }`
- **THEN** the promise SHALL resolve with `ok: false`, `code: "INVALID_INPUT"` and the argument name `definition`

#### Scenario: Results are text content
- **WHEN** any tool executes
- **THEN** the resolved value SHALL have a `content` array whose first item has `type: "text"` and parseable JSON in `text`

### Requirement: Registration is feature-detected, reported and disposable
The package SHALL register descriptors on the page's model context, found as `document.modelContext` first and `navigator.modelContext` second unless the host passes one explicitly. When no model context exists, registration SHALL succeed as a no-op that reports `supported: false`, registers nothing and throws nothing, so a page behaves identically in a browser without agents. Each descriptor SHALL be registered under one abort signal; the returned handle's `dispose()` SHALL abort it (and call the context's unregister method when one exists) so every tool disappears together, and calling it twice SHALL be harmless. A browser that rejects one registration — a duplicate name, a permissions-policy refusal — SHALL NOT prevent the others: the result SHALL list the registered names and the failures by name and message. The package SHALL perform no network I/O and SHALL use no Node-only API.

#### Scenario: No agent-capable browser
- **WHEN** the tools are exposed in a document with neither `document.modelContext` nor `navigator.modelContext`
- **THEN** the call SHALL resolve with `supported: false`, an empty registered list, and SHALL have thrown nothing

#### Scenario: Registration lands on the model context
- **WHEN** the tools are exposed against a model context that records registrations
- **THEN** every produced descriptor SHALL have been passed to its register method exactly once, with an abort signal, and the result SHALL list their names

#### Scenario: Document wins over navigator
- **WHEN** both `document.modelContext` and `navigator.modelContext` exist
- **THEN** registration SHALL use the document's

#### Scenario: One failure does not stop the rest
- **WHEN** the model context rejects the registration of one tool
- **THEN** the remaining tools SHALL still be registered and the result SHALL name the failed tool with the rejection message

#### Scenario: Dispose removes everything
- **WHEN** `dispose()` is called on the handle
- **THEN** the abort signal SHALL be aborted, the context's unregister method (when present) SHALL have been called for every registered name, and a second `dispose()` SHALL do nothing

### Requirement: Agents edit, people save
The package SHALL ship no tool that persists, publishes or deletes an entry: every tool reads or changes a mounted designer's working copy, and the host's save controls remain the only write path. Tool descriptions and the guide SHALL state that the person reviews and saves, and SHALL tell an agent whose host lets it operate the page to leave the Save control to the person unless asked. The package cannot prevent a host agent from pressing Save through the host's own page-automation tools under the person's session and permission settings; the documentation SHALL say so plainly, and SHALL note that the draft is visible in the designer before any such save. Hosts MAY register additional tools of their own through the package's registration helper.

#### Scenario: No persistence tool exists
- **WHEN** the descriptors are enumerated with every designer source supplied
- **THEN** no tool name SHALL contain `save`, `publish` or `delete`, and no tool SHALL call anything but the designer handles

#### Scenario: A host adds its own tool
- **WHEN** a host passes its own descriptor alongside the designer tools to the registration helper
- **THEN** it SHALL be registered under the same abort signal and reported in the same result

#### Scenario: The boundary is stated where the agent reads
- **WHEN** the guide's workflow and the editing tools' descriptions are read
- **THEN** they SHALL say that no tool saves and that the Save control is the person's unless the person asks otherwise
