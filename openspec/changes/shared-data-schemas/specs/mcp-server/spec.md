# mcp-server — agents discover shared schemas, reference them by name

## ADDED Requirements

### Requirement: Schema listing tool
The server SHALL expose a read-only `list_schemas` tool returning the presented key's stored shared schemas — each entry's `name`, optional `label` and `description`, and the `schema` object itself, so an agent asked to build a widget "using schema xyz" can bind the schema's actual properties and draft a `dataExample` that validates. The listing SHALL serve the principal resolved from the request's key, exactly like `list_widgets`: an anonymous or unknown key sees an empty list, never an error. The tool's wire-visible description SHALL steer agents to reference a listed schema by name (`descriptor.dataSchemaRef`) rather than copying its body inline. The schemas listed are the STORED entries — unlike `list_widgets`, whose descriptors carry references already resolved. Reading the schemas SHALL cost nothing on renders: the store is consulted when the tool is called, not when the server is constructed.

#### Scenario: The listing serves the key's own schemas
- **WHEN** `list_schemas` is called with a key whose principal stores a `person` schema
- **THEN** the result SHALL parse as JSON containing that entry's `name` and `schema` object
- **AND** the same call with an unknown or absent key SHALL return an empty list, not an error

#### Scenario: The wire description steers to references
- **WHEN** an SDK client lists tools
- **THEN** `list_schemas` SHALL appear with a description telling agents to reference a saved schema by name via `dataSchemaRef` instead of reconstructing it inline

#### Scenario: Listing schemas never taxes renders
- **WHEN** `render_widget` is called on a server constructed with a schema source
- **THEN** the schema source SHALL NOT be read — only a `list_schemas` call reads it

## MODIFIED Requirements

### Requirement: Authoring guide tool
The server SHALL expose a read-only `get_authoring_guide` tool whose result is a structured JSON guide containing everything an external agent needs to draft valid widget and theme JSON for its user: the `CustomWidget` shape (`{ kind, template, descriptor }` with the descriptor's fields, including `dataSchemaRef` — a saved shared schema referenced by name IN PLACE of an inline `dataSchema`, never both), the theme entry shape (`{ name, label?, description?, tokens }`), the shared-schema entry shape (`{ name, label?, description?, schema }` — what the user imports in the Data schemas section), the template DSL's node forms (text, `bind`, `each`/`empty`, `when`/`else`, elements with attrs including `{ bind }` values) and safety rules (no `on*` attributes, URL scheme allowlist, base64 `data:image/*` on `img src` only, depth and node bounds), the identifier charset and the reserved built-in kinds, the styles rules (`.wg-` selectors, banned constructs), the `dataSchema` subset including its `pattern` bounds, a data-modeling preference (bind only schema-declared properties; `$meta.*` is outside `dataSchema` validation and SHALL be discouraged rather than promoted), a shared-schema rule — when the user names a saved schema, reference it with `dataSchemaRef` and discover its shape with `list_schemas`; do NOT reconstruct it inline, since the copy forks the moment the user edits the shared one —, the token registry with each token's type and use, the per-principal limits, and a `workflow` section stating that agents draft JSON while users import, validate, and save it in the authenticated designer — registration over MCP does not exist by design. Facts with a live source of truth SHALL be derived from it at call time — including the custom-variable name pattern, the banned style substrings, the style property allowlist, and the schema `pattern` length cap, each read from its owning constant (reserved kinds from the catalog, limits from the store defaults, tokens from the token registry), never duplicated as prose.

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
