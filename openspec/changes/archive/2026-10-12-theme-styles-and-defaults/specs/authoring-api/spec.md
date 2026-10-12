## ADDED Requirements

### Requirement: Settings have their own route
The surface SHALL serve the resolved principal's settings at `/settings` under its base path: `GET` SHALL answer the settings record (an empty object when nothing is set), and `PUT` SHALL apply the body through the store's `putSettings` — each section present replaces that section, a section given as `null` is removed, and sections the body does not mention are kept. A refusal SHALL keep the store's code under the surface's status mapping: `UNKNOWN_THEME` and `INVALID_SHAPE` as `422`. Deleting a theme that a setting names SHALL answer `409 THEME_IN_USE`, naming the mode, with the theme still stored. A malformed body SHALL be refused as `400 INVALID_BODY`, and on any refusal the record SHALL be unchanged.

#### Scenario: Default themes are read and replaced
- **WHEN** a principal stores themes `a` and `b`, `PUT /settings` carries `{ "defaultThemes": { "light": "a", "dark": "b" } }`, and a second `PUT` carries `{ "defaultThemes": { "light": "b" } }`
- **THEN** `GET /settings` SHALL answer `{ "defaultThemes": { "light": "b" } }`

#### Scenario: An unknown theme is refused
- **WHEN** `PUT /settings` carries `{ "defaultThemes": { "dark": "missing" } }`
- **THEN** the response SHALL be `422` with code `UNKNOWN_THEME` and the record SHALL be unchanged

#### Scenario: A default theme is protected
- **WHEN** theme `a` is the light default and `DELETE /themes/a` is requested
- **THEN** the response SHALL be `409` with code `THEME_IN_USE` naming `light`, and `a` SHALL still be listed

#### Scenario: The route cannot address another principal
- **WHEN** a `PUT /settings` body or query carries a principal id
- **THEN** it SHALL be ignored and only the resolved principal's settings SHALL change

### Requirement: Theme entries keep their styles through the surface
Replacing a theme by name SHALL carry the body's `styles` into the store write beside `label`, `description` and `tokens`, under the store's own validation, and listing themes SHALL return each stored theme with its `styles`. The path SHALL still name the theme.

#### Scenario: A theme's styles round-trip
- **WHEN** `PUT /themes/brand` carries `{ "tokens": { "accent": "#ff5a1f" }, "styles": { ".wg-btn": { "padding": "4px 8px" } } }`
- **THEN** `GET /themes` SHALL list `brand` with those `styles`
- **AND** a body whose `styles` maps `.wg-btn` to a string SHALL be refused with `422 INVALID_THEME` and nothing SHALL be stored
