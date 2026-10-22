## ADDED Requirements

### Requirement: Widgets that name themes keep them resolvable
A stored widget's `descriptor.themes` SHALL be checked against the principal's registry on every write. `putWidget` SHALL refuse with `UNKNOWN_THEME` a name that is neither a built-in (`light`, `dark`) nor one of the principal's stored themes, naming the mode and the theme, and SHALL leave the stored widget unchanged. `removeTheme` SHALL refuse with `THEME_IN_USE` while any of the principal's stored widgets names the theme in either mode, naming those widgets beside any settings default that also names it. The scan SHALL run over the RAW stored entries, as the other reference guards do. Every writable implementation (memory, SQLite, Cosmos) SHALL behave alike, and the read-only file store SHALL apply the read-side rule. A malformed `themes` (refused by core's shape check) SHALL fail the write with `INVALID_SHAPE`. On read, a widget whose `themes` has a malformed shape SHALL be skipped with a diagnostic, like any invalid descriptor. A widget naming a theme the principal no longer holds, which can arrive by other means (manual edits, races), SHALL compose and render with the default for that mode, never failing; the render's `Theme notes:` line names it (mcp-server, "A widget's own themes take priority over the defaults"). Widgets without `themes` SHALL read and compose exactly as before.

#### Scenario: A widget naming an unknown theme is refused
- **WHEN** `putWidget(P, { kind: "promo", …, descriptor: { …, themes: { light: "acme" } } })` runs and principal `P` holds no theme `acme`
- **THEN** the call SHALL fail with `UNKNOWN_THEME` naming `light` and `acme`, and no widget `promo` SHALL be stored
- **AND** the same widget SHALL be stored once `P` holds `acme`, and a widget naming only the built-in `dark` SHALL be stored without any stored theme

#### Scenario: A theme a widget names cannot be removed
- **WHEN** widget `promo` names `acme` as its light theme and `removeTheme(P, "acme")` is called
- **THEN** the call SHALL fail with `THEME_IN_USE` naming `promo`, and `acme` SHALL remain
- **AND** after `promo` is removed or names another theme, the removal SHALL succeed

#### Scenario: A dangling theme reference degrades, not fails
- **WHEN** a stored widget names `acme` and the principal's stored themes no longer include it
- **THEN** the widget SHALL compose and render with the default for that mode, and the render's text SHALL carry a `Theme notes:` line naming the widget and the theme

#### Scenario: Old widgets are untouched
- **WHEN** a widget stored before this change, with no `themes`, is read and rendered
- **THEN** it SHALL compose without a diagnostic and render byte-identically to before
