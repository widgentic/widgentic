## ADDED Requirements

### Requirement: Stored themes may carry styles
A stored theme entry MAY carry `styles` beside `tokens`. On write, a store SHALL refuse with `INVALID_THEME` a theme whose `styles` is present and is not a plain object mapping selectors to plain objects of string values, and composition SHALL skip such an entry with a diagnostic on read. Unsafe entries inside a well-shaped map SHALL be stored and dropped when CSS is generated, as a widget descriptor's are. The entry's serialized size, `styles` included, SHALL count against the per-entry byte limit. Entries written before `styles` existed SHALL load unchanged, every adapter included.

#### Scenario: A theme with styles round-trips
- **WHEN** a theme `{ name: "brand", tokens: { accent: "#ff5a1f" }, styles: { ".wg-btn": { padding: "4px 8px" } } }` is written with `putTheme`
- **THEN** `themes(principalId)` SHALL return it with the same `styles`, and the composed registry's `brand` entry SHALL carry them

#### Scenario: A malformed styles section is refused at the door
- **WHEN** a theme whose `styles` maps `.wg-btn` to the string `"padding: 4px"` is written
- **THEN** the write SHALL be refused with `INVALID_THEME` and nothing SHALL be stored
- **AND** a store edited out of band to hold that entry SHALL have it skipped at composition with a diagnostic naming the theme

#### Scenario: Themes stored before styles existed still load
- **WHEN** a store holds a theme entry with no `styles` key, written in the earlier shape, in each adapter (memory, file, SQLite, Cosmos)
- **THEN** composition SHALL register it with its tokens and no styles, and no diagnostic

### Requirement: Principal settings are one record per principal
Each principal SHALL have one settings record, read through `settings(principalId): Promise<PrincipalSettings>` on the read port — an empty object when nothing is set or the principal is unknown, never an error — and written through `putSettings(principalId, update)` on the writable port. The record is a set of named sections; this version defines one, `defaultThemes: { light?: string; dark?: string }`. `putSettings` SHALL replace each section present in `update`, remove a section given as `null`, and keep every section `update` does not mention — a section given as `undefined` counts as not mentioned — so a writer that knows only some sections never erases the others. An unknown section name, a `defaultThemes` key other than `light` and `dark`, or a non-string value SHALL be refused with `INVALID_SHAPE`; a `defaultThemes` value naming no theme the principal stores (raw stored entries, whether or not they currently validate) SHALL be refused with `UNKNOWN_THEME`; on any refusal the stored record SHALL be unchanged. Because the section holds one name per mode, at most one theme SHALL be a mode's default at any time, and the same theme SHALL be allowed to hold both. `removeTheme` SHALL refuse with `THEME_IN_USE`, naming the mode or modes, while `defaultThemes` names the theme. `composeThemes` SHALL set the composed registry's default for each mode `defaultThemes` names; a name the composed registry does not hold — missing, or skipped as invalid — SHALL be dropped with a diagnostic, leaving that mode's built-in default. On read, a section this version does not know SHALL be ignored, not refused, so data written by a later version still loads. Composing for `ANONYMOUS_PRINCIPAL` SHALL leave both built-in defaults. Every adapter (memory, file, SQLite, Cosmos) SHALL behave identically, and a store holding no record SHALL read as empty settings. The invariant "a default names a stored theme" SHALL hold under concurrent writes: `putSettings` SHALL commit only while every theme it names still exists and the record is unchanged since it was read, and `removeTheme` SHALL delete only while the record it checked is unchanged — retrying, or refusing with the matching code, when a concurrent write intervenes. A stored value that is not a name SHALL be dropped on read with a diagnostic. Default themes are cosmetic: when the settings cannot be read — an adapter written before settings existed, or a failing read — `composeThemes` SHALL keep the built-in defaults and report a diagnostic, never fail.

#### Scenario: Default themes round-trip and replace
- **WHEN** a principal stores themes `a` and `b`, and `putSettings(P, { defaultThemes: { light: "a", dark: "b" } })` is followed by `putSettings(P, { defaultThemes: { light: "b" } })`
- **THEN** `settings(P)` SHALL return `{ defaultThemes: { light: "b" } }`
- **AND** the composed registry's defaults SHALL be `{ light: "b", dark: "dark" }`

#### Scenario: Sections not mentioned are kept
- **WHEN** P's settings hold `defaultThemes` and `putSettings(P, {})` is called
- **THEN** `settings(P)` SHALL still hold the same `defaultThemes`
- **AND** `putSettings(P, { defaultThemes: null })` SHALL remove the section

#### Scenario: A default must name a stored theme
- **WHEN** `putSettings(P, { defaultThemes: { dark: "missing" } })` is called and P stores no `missing` theme
- **THEN** the call SHALL be refused with `UNKNOWN_THEME` and P's settings SHALL be unchanged
- **AND** `putSettings(P, { defaultThemes: { sepia: "a" } })` and `putSettings(P, { fonts: {} })` SHALL each be refused with `INVALID_SHAPE`

#### Scenario: A default theme cannot be removed
- **WHEN** theme `a` is P's light default and `removeTheme(P, "a")` is called
- **THEN** the removal SHALL be refused with `THEME_IN_USE` naming `light`, and `a` SHALL remain
- **AND** after `putSettings(P, { defaultThemes: null })`, the removal SHALL succeed

#### Scenario: A dangling default degrades to the built-in
- **WHEN** a store edited out of band names `ghost` as P's dark default and holds no `ghost` theme
- **THEN** composition SHALL report a diagnostic naming `ghost` and the registry's dark default SHALL be the built-in `dark`

#### Scenario: Stores without settings read as empty
- **WHEN** a principal written before settings existed is read in each adapter
- **THEN** `settings` SHALL return `{}` and the composed registry's defaults SHALL be the built-ins

#### Scenario: A later version's section does not break loading
- **WHEN** a store edited out of band holds settings with `defaultThemes` beside an unknown section `fonts`
- **THEN** `settings` and composition SHALL apply `defaultThemes` and ignore `fonts` without a refusal

#### Scenario: Settings never cross principals
- **WHEN** principal A sets `brand` as its light default and principal B stores its own `brand` theme
- **THEN** B's composed registry SHALL keep the built-in light default

#### Scenario: Concurrent writes keep a default naming a stored theme
- **WHEN** a theme named by a `putSettings` call is removed after the call checked it, or a theme being removed becomes a default after `removeTheme` checked the settings
- **THEN** `putSettings` SHALL be refused with `UNKNOWN_THEME` and the settings SHALL be unchanged, or `removeTheme` SHALL be refused with `THEME_IN_USE` and the theme SHALL remain
- **AND** a section another writer added meanwhile SHALL survive a `putSettings` of a different section

#### Scenario: Unreadable settings never fail a render
- **WHEN** composition runs over an adapter without a `settings` method, or one whose settings read throws
- **THEN** the registry SHALL keep the built-in defaults, register the stored themes, and report a diagnostic for the failed read
