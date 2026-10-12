## ADDED Requirements

### Requirement: Load and check tools refuse what saving would refuse
`<prefix>_widget_draft_load` and `<prefix>_widget_definition_check` SHALL refuse a definition whose `kind` is not a safe identifier (letters, digits, `.`, `_`, `-`) or names a built-in kind, and `<prefix>_theme_load` SHALL refuse an entry whose `name` is not a safe identifier or names a built-in theme (`light`, `dark`), each with `ok: false`, `code: "REJECTED"` and an error naming the rule, and the designer's draft or entry SHALL be unchanged — an agent learns at the draft what the store would otherwise answer only when the person saves. These checks SHALL apply only to an identity the call would change: `<prefix>_widget_example_data_set` and `<prefix>_theme_tokens_set`, which reload the current draft or entry, SHALL NOT be refused for a kind or name the person already gave it. Diagnostics SHALL be the mounted designer's own, resolved against the shared schemas and actions its host supplied: `<prefix>_widget_draft_get` and the editing tools SHALL return the designer's diagnostics for its current draft, and `<prefix>_widget_definition_check` SHALL check through the widget designer the host exposes as `widgetIfMounted` — a source that never shows or mounts anything, so the check never changes the person's view — producing the same refusals and diagnostics a load would, and falling back, without that source or a mounted designer, to the definition alone with its references left unverified and `diagnosticsDerived: true`. What the store accepts but an author likely did not mean SHALL load with a warning, not a refusal: a definition without a `dataShape` SHALL carry a `dataShape` diagnostic saying agents will see a placeholder, an inline `dataSchema` with keywords the validator would ignore SHALL carry a `dataSchema` diagnostic listing them, and `<prefix>_schema_load` SHALL return `warnings` naming the same problems in the loaded schema (omitted when there are none). `<prefix>_widget_theme_set` SHALL layer its tokens over the preview theme the person chose: the selection and its styles stay, each call replaces the previous layer so `{ tokens: {} }` returns to the chosen theme exactly, and the result SHALL carry the effective tokens and `previewTheme`, the chosen theme's name.

#### Scenario: Shared schema references resolve against the saved schemas
- **WHEN** the widget designer was given the saved schema `email-inbox` and opened on a widget referencing it, and `<prefix>_widget_draft_get` or `<prefix>_widget_definition_check` executes for it
- **THEN** neither result SHALL carry a `schemaRef` diagnostic, and a definition whose example violates `email-inbox` SHALL get the example diagnostic
- **AND** a reference naming no saved schema SHALL still be reported, and a definition carrying both `dataSchema` and `dataSchemaRef` SHALL be refused

#### Scenario: The check never moves the person's view
- **WHEN** a host supplies a `widget` source that shows its section and a `widgetIfMounted` source, and `<prefix>_widget_definition_check` executes
- **THEN** the `widget` source SHALL NOT have been called and the result SHALL carry the mounted designer's diagnostics

#### Scenario: A built-in kind is refused at the draft
- **WHEN** `<prefix>_widget_draft_load` or `<prefix>_widget_definition_check` executes with a definition of kind `table`
- **THEN** the result SHALL report `ok: false`, `code: "REJECTED"` and an error carrying `RESERVED_KIND`, and the draft's kind SHALL be unchanged

#### Scenario: A malformed kind is refused at the draft
- **WHEN** either tool executes with a definition of kind `my widget`
- **THEN** the result SHALL report `ok: false` with an error carrying `INVALID_IDENTIFIER`

#### Scenario: A reserved or malformed theme name is refused
- **WHEN** `<prefix>_theme_load` executes with an entry named `light`, and again with an entry named `my theme`
- **THEN** each result SHALL report `ok: false`, `code: "REJECTED"`, with `RESERVED_THEME` and `INVALID_IDENTIFIER` respectively, and the entry's name SHALL be unchanged

#### Scenario: Reloading tools are not refused for the person's own identity
- **WHEN** the person's draft has kind `my widget` and `<prefix>_widget_example_data_set` executes, or the person's theme is named `dark` and `<prefix>_theme_tokens_set` executes
- **THEN** each result SHALL report `ok: true` with the edit applied, and the widget result's `diagnostics.kind` SHALL carry `INVALID_IDENTIFIER`

#### Scenario: A missing data shape warns
- **WHEN** `<prefix>_widget_definition_check` executes with an otherwise valid definition whose descriptor has no `dataShape`
- **THEN** the result SHALL report `ok: true` and `diagnostics.dataShape` SHALL say the shape is empty

#### Scenario: Preview tokens never claim a named theme
- **WHEN** the widget designer was given the built-in themes, none is chosen, and `<prefix>_widget_theme_set` executes with `{ tokens: {} }`
- **THEN** the preview-theme selector SHALL show "none", not "Light"

#### Scenario: Preview tokens keep the person's chosen theme
- **WHEN** the person chose `google-light` as the preview theme and `<prefix>_widget_theme_set` executes with `{ tokens: { accent: "#d93025" } }`
- **THEN** the selector SHALL still show `google-light`, and the result SHALL carry `previewTheme: "google-light"` and `google-light`'s tokens with `accent` replaced
- **AND WHEN** it executes with `{ tokens: {} }`
- **THEN** the result's tokens SHALL equal `google-light`'s exactly

#### Scenario: A schema the validator would partly ignore loads with warnings
- **WHEN** `<prefix>_schema_load` executes with a schema whose property `kind` has `type: "banana"`
- **THEN** the result SHALL report `ok: true` and `warnings` naming `schema.properties.kind.type`
- **AND WHEN** `<prefix>_widget_definition_check` executes with an inline `dataSchema` of `{ type: "banana" }`
- **THEN** the result SHALL report `ok: true` and `diagnostics.dataSchema` naming it
