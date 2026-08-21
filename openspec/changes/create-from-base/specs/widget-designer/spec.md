# Widget Designer — create-from-base delta

## ADDED Requirements

### Requirement: Draft seeding from existing definitions
The designer package SHALL export pure seeding helpers that copy at creation time and never keep a live link to the source. `seedWidgetDraft(source)` SHALL accept a stored widget definition — returning a draft whose identity (kind) is made distinct while the template, descriptor, styles, and any `dataSchemaRef` are copied — or a built-in kind name (`card`, `table`, `tree`), returning a starter draft whose template approximates that built-in using its `wg-*` classes and the built-in's documented data example, so the seed renders recognizably like the original before any edit. `seedThemeEntry(source)` SHALL accept a stored theme entry or a preset name (`light` for the token defaults, `dark` for the dark preset), returning an entry with the tokens copied and a distinct, non-reserved name. Both helpers SHALL accept the taken names/kinds and pick a deterministic distinct identity that avoids them; seeding SHALL never mutate the source.

#### Scenario: A stored widget seeds a new draft
- **WHEN** `seedWidgetDraft` is called with a stored `person-card` definition (including a `dataSchemaRef`)
- **THEN** the returned draft SHALL carry a kind different from `person-card`, the same template, descriptor content, and `dataSchemaRef`
- **AND** the source definition SHALL be unchanged

#### Scenario: Built-in kinds seed starter templates
- **WHEN** `seedWidgetDraft` is called with `"card"`, `"table"`, or `"tree"`
- **THEN** the returned draft SHALL validate, render through the preview pipeline, and use that built-in's `wg-*` classes with its documented data example

#### Scenario: A theme seeds from a preset or a stored entry
- **WHEN** `seedThemeEntry` is called with `"dark"` and with a stored entry
- **THEN** each result SHALL carry the source's tokens under a name that is neither reserved (`light`/`dark`) nor the source's own

#### Scenario: Seeded identities avoid taken names
- **WHEN** the taken set already contains the would-be seeded kind or name
- **THEN** the helper SHALL return a deterministic alternative not in the set
