## ADDED Requirements

### Requirement: Descriptors may name the widget's themes
`WidgetDescriptor` SHALL accept an optional `themes` object, `{ light?: <theme name>, dark?: <theme name> }`, naming the themes the widget wears in each mode when a render names no theme.
- **Modes.** Each mode SHALL be optional.
- **Names.** A name SHALL be allowed to name a built-in (`light` or `dark`), so a widget can keep the built-in look against a brand default. Whether a name exists belongs to the registry of the caller who renders it, not to the catalog.
- **The catalog.** It SHALL keep `themes` from a registered descriptor and return it unchanged from `describe(kind)` and `list()`.
- **One shape check.** Core SHALL export one runtime-neutral shape check for `themes`, used by the store on write and read, by the designers' import, and by the host bundle. It SHALL refuse any key other than `light` and `dark`, and a name that is not a non-empty string of identifier characters (letters, digits, `.`, `_`, `-`), each with a message naming `descriptor.themes`.

#### Scenario: A descriptor names a theme per mode
- **WHEN** a kind registers with `descriptor.themes: { light: "acme", dark: "acme-night" }`
- **THEN** `describe(kind).themes` SHALL equal `{ light: "acme", dark: "acme-night" }`

#### Scenario: One mode, or a built-in, is enough
- **WHEN** the shape check reads `{ light: "acme" }` and `{ dark: "dark" }`
- **THEN** it SHALL accept both

#### Scenario: A malformed themes field is refused
- **WHEN** the shape check reads `{ light: 5 }`, `{ sepia: "acme" }`, `{ light: "" }`, `{ light: "a b" }` or `"acme"`
- **THEN** it SHALL refuse each with a message naming `descriptor.themes`
