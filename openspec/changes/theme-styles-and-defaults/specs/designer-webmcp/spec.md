## ADDED Requirements

### Requirement: Load and check tools refuse what saving would refuse
`<prefix>_widget_draft_load` and `<prefix>_widget_definition_check` SHALL refuse a definition whose `kind` is not a safe identifier (letters, digits, `.`, `_`, `-`) or names a built-in kind, and `<prefix>_theme_load` SHALL refuse an entry whose `name` is not a safe identifier or names a built-in theme (`light`, `dark`), each with `ok: false`, `code: "REJECTED"` and an error naming the rule, and the designer's draft or entry SHALL be unchanged — an agent learns at the draft what the store would otherwise answer only when the person saves. A definition without a `dataShape` SHALL NOT be refused: the result SHALL carry a `dataShape` diagnostic saying agents will see a placeholder. `<prefix>_widget_theme_set` SHALL apply its tokens as an unnamed preview theme: the preview-theme selector SHALL NOT switch to a named theme whose tokens happen to match, so an empty token map leaves it on "none".

#### Scenario: A built-in kind is refused at the draft
- **WHEN** `<prefix>_widget_draft_load` or `<prefix>_widget_definition_check` executes with a definition of kind `table`
- **THEN** the result SHALL report `ok: false`, `code: "REJECTED"` and an error carrying `RESERVED_KIND`, and the draft's kind SHALL be unchanged

#### Scenario: A malformed kind is refused at the draft
- **WHEN** either tool executes with a definition of kind `my widget`
- **THEN** the result SHALL report `ok: false` with an error carrying `INVALID_IDENTIFIER`

#### Scenario: A reserved or malformed theme name is refused
- **WHEN** `<prefix>_theme_load` executes with an entry named `light`, and again with an entry named `my theme`
- **THEN** each result SHALL report `ok: false`, `code: "REJECTED"`, with `RESERVED_THEME` and `INVALID_IDENTIFIER` respectively, and the entry's name SHALL be unchanged

#### Scenario: A missing data shape warns
- **WHEN** `<prefix>_widget_definition_check` executes with an otherwise valid definition whose descriptor has no `dataShape`
- **THEN** the result SHALL report `ok: true` and `diagnostics.dataShape` SHALL say the shape is empty

#### Scenario: Preview tokens never claim a named theme
- **WHEN** the widget designer was given the built-in themes and `<prefix>_widget_theme_set` executes with `{ tokens: {} }`
- **THEN** the preview-theme selector SHALL show "none", not "Light"
