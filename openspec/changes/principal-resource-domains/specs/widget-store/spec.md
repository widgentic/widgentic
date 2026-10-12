## MODIFIED Requirements

### Requirement: Principal settings are one record per principal
Each principal SHALL have one settings record, read through `settings(principalId): Promise<PrincipalSettings>` on the read port — an empty object when nothing is set or the principal is unknown, never an error — and written through `putSettings(principalId, update)` on the writable port. The record is a set of named sections; this version defines two, `defaultThemes: { light?: string; dark?: string }` and `resourceDomains: string[]` (whose rule, refusals and composition are in "Resource domains are a settings section"). `putSettings` SHALL replace each section present in `update`, remove a section given as `null`, and keep every section `update` does not mention — a section given as `undefined` counts as not mentioned — so a writer that knows only some sections never erases the others. An unknown section name, a `defaultThemes` key other than `light` and `dark`, or a non-string value SHALL be refused with `INVALID_SHAPE`; a `defaultThemes` value naming no theme the principal stores (raw stored entries, whether or not they currently validate) SHALL be refused with `UNKNOWN_THEME`; on any refusal the stored record SHALL be unchanged. Because the section holds one name per mode, at most one theme SHALL be a mode's default at any time, and the same theme SHALL be allowed to hold both. `removeTheme` SHALL refuse with `THEME_IN_USE`, naming the mode or modes, while `defaultThemes` names the theme. `composeThemes` SHALL set the composed registry's default for each mode `defaultThemes` names; a name the composed registry does not hold — missing, or skipped as invalid — SHALL be dropped with a diagnostic, leaving that mode's built-in default. On read, a section this version does not know SHALL be ignored, not refused, so data written by a later version still loads. Composing for `ANONYMOUS_PRINCIPAL` SHALL leave both built-in defaults. Every adapter (memory, file, SQLite, Cosmos) SHALL behave identically, and a store holding no record SHALL read as empty settings. The invariant "a default names a stored theme" SHALL hold under concurrent writes: `putSettings` SHALL commit only while every theme its update names still exists and the record is unchanged since it was read (a section the update leaves alone is kept as stored, even if it names a theme that is gone), and `removeTheme` SHALL delete only while the record it checked is unchanged — retrying, or refusing with the matching code, when a concurrent write intervenes. A stored value that is not a name SHALL be dropped on read with a diagnostic. Default themes are cosmetic: when the settings cannot be read, `composeThemes` SHALL keep the built-in defaults and never fail: an adapter written before settings existed has none to read, silently, and a failing read is reported with a diagnostic. A Cosmos permission refusal SHALL surface as `FORBIDDEN` whether it arrives from a single operation or from a transactional batch, whose SDK error carries no status code, and Cosmos `putSettings` SHALL check only the defaults its update writes, as every adapter does.

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
- **THEN** the registry SHALL keep the built-in defaults and register the stored themes, and the throwing read SHALL be reported with a diagnostic

#### Scenario: A read-only identity's batch is FORBIDDEN
- **WHEN** a Cosmos `putSettings` or `removeTheme` batch fails as the SDK reports a permission refusal
- **THEN** the store SHALL refuse with `FORBIDDEN`, and a batch failing for another reason, throttling included, SHALL refuse with `STORE_ERROR`

#### Scenario: A dangling default left alone does not block an update
- **WHEN** the stored settings name a dark default whose theme is gone and an update leaves `defaultThemes` alone
- **THEN** Cosmos SHALL accept the update, as every adapter does, and an update writing that name SHALL be refused with `UNKNOWN_THEME`

## ADDED Requirements

### Requirement: Resource domains are a settings section
The settings section `resourceDomains` SHALL list the domains a principal's MCP Apps frames may load assets from directly, at most 20 entries (the limit exported beside the rule). An entry SHALL be accepted when, after trimming surrounding whitespace and lowercasing, it reads as an optional `https://` prefix, then a host, then at most one trailing `/`, and nothing else. The host is two or more dot-separated labels, each 1–63 characters of `a-z`, `0-9` and `-` that neither starts nor ends with `-`, with at most 253 characters in all and a last label that is not all digits; the host MAY begin with a wildcard label `*.` followed by at least two labels. A stored entry SHALL take the canonical form `https://<host>` (wildcard included), and the stored list SHALL be deduplicated in first-seen order. The store SHALL refuse with `INVALID_DOMAIN`, naming the entry and the reason, any string this rule rejects. That includes a scheme other than `https` (`http:`, `data:`), a port, a path, a query or a fragment, userinfo, an IPv4 or IPv6 literal, a single-label host such as `localhost`, a wildcard that is not the whole leading label or that is followed by fewer than two labels (`*`, `https://*`, `*.com`, `a.*.example.com`), a non-ASCII host (the punycode `xn--` form is accepted), and any whitespace, `;`, `,` or quote inside the entry, so no entry can inject into a CSP a host builds from it. A value that is not an array of strings, or that holds more than the limit, SHALL be refused with `INVALID_SHAPE`. On every refusal the stored record SHALL be unchanged. An empty list SHALL remove the section, as `null` does. Writing `resourceDomains` SHALL check no theme, and writing `defaultThemes` SHALL leave `resourceDomains` as stored. On read, an entry that fails the rule SHALL be dropped with a diagnostic naming it, the entries that pass SHALL be kept, and a record without the section SHALL read as no domains. `composeResourceDomains` SHALL yield the principal's canonical list: empty for `ANONYMOUS_PRINCIPAL`, never another principal's, and empty with a diagnostic when the settings cannot be read, never failing the request. An adapter written before settings existed SHALL yield an empty list silently. Every adapter (memory, file, SQLite, Cosmos) SHALL behave identically.

#### Scenario: Accepted forms are stored canonical
- **WHEN** `putSettings(P, { resourceDomains: ["CDN.Example.com", "https://*.example.org/", "https://cdn.example.com"] })` is called
- **THEN** `settings(P)` SHALL return `{ resourceDomains: ["https://cdn.example.com", "https://*.example.org"] }`

#### Scenario: Unacceptable entries are refused by name
- **WHEN** `putSettings` is called with `resourceDomains` holding any one of `http://cdn.example.com`, `https://cdn.example.com:8443`, `https://cdn.example.com/img`, `192.168.1.10`, `localhost`, `*`, `*.com`, `a.*.example.com`, `exämple.com`, `cdn.example.com; script-src *` or `'self'`
- **THEN** the call SHALL be refused with `INVALID_DOMAIN` naming that entry, and the stored record SHALL be unchanged

#### Scenario: Shape and limit are refused as shape
- **WHEN** `resourceDomains` is the string `"cdn.example.com"`, the array `[42]`, or an array of 21 distinct valid domains
- **THEN** each call SHALL be refused with `INVALID_SHAPE`
- **AND** an array of 20 distinct valid domains SHALL be accepted

#### Scenario: An empty list removes the section
- **WHEN** P stores domains and `putSettings(P, { resourceDomains: [] })` is called
- **THEN** `settings(P)` SHALL hold no `resourceDomains`, as after `putSettings(P, { resourceDomains: null })`

#### Scenario: Sections stay independent
- **WHEN** P's settings hold a light default theme, and `putSettings(P, { resourceDomains: ["cdn.example.com"] })` is called
- **THEN** the light default SHALL be unchanged, and no theme SHALL be checked
- **AND** a later `putSettings(P, { defaultThemes: { dark: "b" } })` SHALL keep the domains

#### Scenario: Invalid stored entries are dropped on read
- **WHEN** a store edited out of band holds `resourceDomains: ["https://cdn.example.com", "http://old.example.com"]` for P
- **THEN** `settings(P)` and `composeResourceDomains` SHALL yield `["https://cdn.example.com"]`, and composition SHALL report a diagnostic naming `http://old.example.com`

#### Scenario: Composition yields only the caller's domains
- **WHEN** principal A stores `["cdn.a.example"]` and principal B stores nothing
- **THEN** composing for A SHALL yield `["https://cdn.a.example"]`, while composing for B and for `ANONYMOUS_PRINCIPAL` SHALL each yield `[]`

#### Scenario: Unreadable settings declare nothing
- **WHEN** composition runs over an adapter without a `settings` method, or one whose settings read throws
- **THEN** `composeResourceDomains` SHALL yield `[]`; only the throwing read SHALL be reported with a diagnostic

#### Scenario: Every adapter alike
- **WHEN** the scenarios above run against the memory, file, SQLite and Cosmos adapters
- **THEN** each SHALL store, refuse and read identically
