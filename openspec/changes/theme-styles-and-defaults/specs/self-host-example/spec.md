## MODIFIED Requirements

### Requirement: An optional seed populates the single principal at startup
When `WIDGENTIC_SEED_FILE` names a readable JSON document, the authoring service SHALL, at startup in single-principal mode, load its entries into the single principal: an object whose optional `schemas`, `themes`, `actions` and `widgets` arrays hold entries in the shapes the authoring surface imports and exports, and whose optional `settings` object holds sections in the shape the settings route takes. Entries SHALL be written in that order — shared schemas and actions before the widgets that reference them — and each through the store's validated write, so the seed passes exactly the checks a person's import passes. An entry whose name (or kind) the principal already holds SHALL be skipped and SHALL NOT be overwritten. A refused entry SHALL be logged with its name and refusal code, and the remaining entries SHALL still be written. A file that cannot be read or parsed SHALL be logged and SHALL NOT stop the service. Each `settings` section SHALL be applied after the entries, through the store's validated write, and only when the principal's settings lack that section, so a person's choice is never overwritten; a refused section SHALL be logged with its refusal code. The seed SHALL never create keys or secrets. With the variable unset or empty nothing SHALL be seeded, and in trusted-header mode the seed SHALL be ignored with a log line, since no single principal owns it. The service SHALL log a summary of what was written, skipped and refused.

#### Scenario: A seed populates an empty store
- **WHEN** the service starts in single-principal mode with a seed holding two schemas, two themes and two widgets that reference those schemas
- **THEN** the principal SHALL hold all six entries, and a render of either widget over its kind SHALL succeed

#### Scenario: A person's edits survive a restart
- **WHEN** the principal already holds a theme named in the seed, with different tokens, and the service restarts
- **THEN** the stored theme SHALL keep the person's tokens

#### Scenario: A bad entry does not block the rest
- **WHEN** a seed holds a widget that references a schema absent from the store and the seed
- **THEN** that widget SHALL be refused and logged with `UNKNOWN_SCHEMA`, and the seed's other entries SHALL be written

#### Scenario: A broken file does not stop the service
- **WHEN** `WIDGENTIC_SEED_FILE` names a missing file or a file that is not JSON
- **THEN** the service SHALL log the failure and start with nothing seeded

#### Scenario: No seed without configuration
- **WHEN** the variable is unset, or the service runs in trusted-header mode
- **THEN** nothing SHALL be written, and in trusted-header mode a log line SHALL say the seed was ignored

#### Scenario: The seed sets default themes once
- **WHEN** a seed holding themes `google-light` and `google-dark` and `settings: { "defaultThemes": { "light": "google-light", "dark": "google-dark" } }` loads into an empty store
- **THEN** the principal's settings SHALL name those themes and a render naming no theme SHALL use them
- **AND** after the person changes the dark default to the built-in and the service restarts, the dark default SHALL stay the built-in

## ADDED Requirements

### Requirement: The app has a Settings section
The example SHALL offer a Settings section beside its Widgets, Themes, Data schemas, Actions and Keys sections, mounting the published settings designer with the principal's stored themes as its choices and the stored settings as its record, and saving it through the authoring surface's settings route; a refusal SHALL be shown to the person with its code and message. The Themes section's list SHALL show which themes are a default, and a theme deletion refused with `THEME_IN_USE` SHALL be shown with the refusal's message, leaving the theme listed. The widget designer SHALL open with the light default theme preselected as its preview theme. When the settings cannot be read, the Settings section SHALL open read-only with no Save, and once a later read succeeds it SHALL open the stored record rather than the read-only placeholder, so an empty record is never saved over the stored one.

#### Scenario: Picking a default and saving it
- **WHEN** `google-light` is the light default and the person picks `ocean` for light hosts in Settings and saves
- **THEN** the settings route SHALL report `ocean` as the light default and the Themes list SHALL show the mark on `ocean` and not on `google-light`

#### Scenario: A default theme is not deleted silently
- **WHEN** the person deletes the theme that is the dark default
- **THEN** the Themes section SHALL show the `THEME_IN_USE` message and the theme SHALL remain listed

#### Scenario: A theme saved elsewhere becomes a choice
- **WHEN** the person saves a new theme `night` and opens Settings
- **THEN** `night` SHALL be offered for both modes

#### Scenario: The widget designer previews under the light default
- **WHEN** `google-light` is the light default and the person opens the Widgets section
- **THEN** the widget designer's preview theme SHALL be `google-light`

#### Scenario: Unread settings are never saved over
- **WHEN** reading the settings fails and the person opens Settings
- **THEN** the settings designer SHALL be read-only, Save SHALL be hidden, and the stored record SHALL be unchanged
- **AND WHEN** a later visit reads them and the person saves
- **THEN** the designer SHALL show the stored light default and the stored record SHALL be unchanged
