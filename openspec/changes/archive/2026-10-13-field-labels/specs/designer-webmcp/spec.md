## MODIFIED Requirements

### Requirement: The token reference tool derives from the exported specs
`<prefix>_theme_token_specs` SHALL return every `--wg-*` theme token with its name, type, default, purpose text and fallback token, derived at call time from the theming capability's exported token specifications rather than restated. `<prefix>_authoring_guide` SHALL return the complete authoring contract in the same structure as the MCP server's `get_authoring_guide` — workflow, widget shape, shared schema, shared action, theme, template rules (forms, actions, safety, bounds, data modeling), the label-style rule, style rules, data-schema subset and limits — derived from the core package's exported constants and validators wherever one exists, with the workflow rewritten for the browser: the agent loads into the open designer and the person saves. `<prefix>_widget_definition_check` SHALL validate a definition without touching any designer, returning what the load tool would return: the designer's errors when refused, the derived diagnostics when accepted.

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

#### Scenario: The guide carries the label style
- **WHEN** `<prefix>_authoring_guide` executes
- **THEN** its result SHALL contain the core package's exported label-style rule verbatim, as the MCP server's guide does
