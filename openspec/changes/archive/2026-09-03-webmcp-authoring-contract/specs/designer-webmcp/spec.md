## MODIFIED Requirements

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
