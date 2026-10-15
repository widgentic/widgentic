## ADDED Requirements

### Requirement: Stylesheet resources are a settings section
The settings section `resources` SHALL list the stylesheets a principal's MCP Apps frames load. It holds at most 8 entries, a limit exported by the core package beside the rule.
- **An entry** SHALL be an object with exactly these keys:
  - `type`, which SHALL be `"stylesheet"`;
  - `href`, a string;
  - optionally `integrity`, a string.
- **The `href` rule.** After trimming surrounding whitespace, an `href` SHALL read as `https://`, then a host that the resource-domain rule accepts (no wildcard), then optionally a path, query and fragment, in at most 2,048 characters.
  - **Refused:** any other scheme, userinfo, a port, an IP literal, a single-label or `localhost` host, and any whitespace, control character, quote, `<`, `>` or backslash.
  - **Stored form:** the host lowercased, the rest as given.
- **The `integrity` rule.** One or more space-separated values, each `sha256-`, `sha384-` or `sha512-` followed by base64.
- **Refusal codes.**
  - `INVALID_RESOURCE`, naming the entry and the reason: an entry this rule rejects, including a `type` other than `"stylesheet"` (scripts are not supported) and a key other than the three.
  - `INVALID_SHAPE`: a value that is not an array of objects, or that holds more than the limit.
  - `UNDECLARED_DOMAIN`, naming the stylesheet and its host. After the write, each stylesheet's host SHALL be covered by the same record's `resourceDomains`, as a CSP host source covers a host: exactly, or by a `*.` wildcard for any subdomain. This applies to a write of `resources` and equally to a write of `resourceDomains`, or its removal, that would leave a stored stylesheet uncovered.

  On every refusal the stored record SHALL be unchanged.
- **Stored list.** Deduplicated by `href` in first-seen order. Order is kept, since it is cascade order. An empty list SHALL remove the section, as `null` does.
- **On read.** An entry that fails the rule, has an unknown `type`, or is not covered by the record's domains SHALL be dropped with a diagnostic naming it, and the entries that pass SHALL be kept. A record without the section SHALL read as no stylesheets.
- **`composeResources`** SHALL yield the principal's list: empty for `ANONYMOUS_PRINCIPAL`, never another principal's, and empty with a diagnostic when the settings cannot be read, never failing the request. An adapter written before settings existed SHALL yield an empty list silently.
- **Every adapter** (memory, file, SQLite, Cosmos) SHALL behave identically.

#### Scenario: Accepted entries are stored in order
- **WHEN** P's `resourceDomains` hold `fonts.googleapis.com` and `*.example.org`, and `putSettings(P, { resources: [...] })` is called with these entries in order:
  1. `{ type: "stylesheet", href: "https://Fonts.Googleapis.com/icon?family=Material+Icons" }`;
  2. `{ type: "stylesheet", href: "https://cdn.example.org/brand.css", integrity: "sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC" }`;
  3. the first entry again.
- **THEN** `settings(P).resources` SHALL be the first two entries, in that order, the first with its host lowercased

#### Scenario: Unacceptable entries are refused by name
- **WHEN** `putSettings` is called with a `resources` entry whose `href` is any one of `http://cdn.example.org/a.css`, `https://user:pw@cdn.example.org/a.css`, `https://cdn.example.org:8443/a.css`, `https://192.168.1.10/a.css`, `https://localhost/a.css`, `javascript:alert(1)` or `https://cdn.example.org/a.css" onload="x`; or whose `integrity` is `md5-abc`; or whose `type` is `"script"`; or which carries a key `media`
- **THEN** the call SHALL be refused with `INVALID_RESOURCE` naming that entry, and the stored record SHALL be unchanged

#### Scenario: Shape and limit are refused as shape
- **WHEN** `resources` is the string `"https://cdn.example.org/a.css"`, the array `["https://cdn.example.org/a.css"]`, or an array of 9 distinct valid entries
- **THEN** each call SHALL be refused with `INVALID_SHAPE`
- **AND** an array of 8 distinct valid entries SHALL be accepted

#### Scenario: A stylesheet outside the declared domains is refused
- **WHEN** P's `resourceDomains` hold only `cdn.example.org` and `putSettings(P, { resources: [{ type: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter" }] })` is called
- **THEN** the call SHALL be refused with `UNDECLARED_DOMAIN` naming the stylesheet and `fonts.googleapis.com`
- **AND** the same call with `resourceDomains: ["cdn.example.org", "fonts.googleapis.com"]` in the same update SHALL be accepted

#### Scenario: A domain a stylesheet needs cannot be removed
- **WHEN** P stores a stylesheet on `fonts.googleapis.com` and `putSettings(P, { resourceDomains: ["cdn.example.org"] })` or `putSettings(P, { resourceDomains: null })` is called
- **THEN** the call SHALL be refused with `UNDECLARED_DOMAIN` naming the stylesheet, and the stored record SHALL be unchanged

#### Scenario: A wildcard domain covers its subdomains
- **WHEN** P's `resourceDomains` hold `*.example.org` and a stylesheet `https://cdn.example.org/a.css` is written
- **THEN** it SHALL be accepted, and a stylesheet on `https://example.org/a.css` SHALL be refused with `UNDECLARED_DOMAIN`

#### Scenario: An empty list removes the section
- **WHEN** P stores stylesheets and `putSettings(P, { resources: [] })` is called
- **THEN** `settings(P)` SHALL hold no `resources`, as after `putSettings(P, { resources: null })`, and P's `resourceDomains` SHALL be unchanged

#### Scenario: Invalid stored entries are dropped on read
- **WHEN** a store edited out of band holds, for P, `resources` with a valid stylesheet, an entry of type `"script"` and a stylesheet whose host P's domains do not cover
- **THEN** `settings(P)` and `composeResources` SHALL yield only the valid stylesheet, and the adapter's read diagnostics SHALL name the other two

#### Scenario: Composition yields only the caller's stylesheets
- **WHEN** principal A stores a stylesheet and principal B stores none
- **THEN** composing for A SHALL yield A's entry, while composing for B and for `ANONYMOUS_PRINCIPAL` SHALL each yield `[]`
- **AND** an adapter without a `settings` method SHALL yield `[]` silently, and one whose settings read throws SHALL yield `[]` with a diagnostic

#### Scenario: Every adapter alike
- **WHEN** the scenarios above run against the memory, file, SQLite and Cosmos adapters
- **THEN** each SHALL store, refuse and read identically

## MODIFIED Requirements

### Requirement: Principal settings are one record per principal
Each principal SHALL have one settings record, read through `settings(principalId): Promise<PrincipalSettings>` on the read port — an empty object when nothing is set or the principal is unknown, never an error — and written through `putSettings(principalId, update)` on the writable port. The record is a set of named sections; this version defines three: `defaultThemes: { light?: string; dark?: string }`; `resourceDomains: string[]` (whose rule, refusals and composition are in "Resource domains are a settings section"); and `resources: { type: "stylesheet"; href: string; integrity?: string }[]` (in "Stylesheet resources are a settings section"). `putSettings` SHALL replace each section present in `update`, remove a section given as `null`, and keep every section `update` does not mention — a section given as `undefined` counts as not mentioned — so a writer that knows only some sections never erases the others. An unknown section name, a `defaultThemes` key other than `light` and `dark`, or a non-string value SHALL be refused with `INVALID_SHAPE`; a `defaultThemes` value naming no theme the principal stores (raw stored entries, whether or not they currently validate) SHALL be refused with `UNKNOWN_THEME`; on any refusal the stored record SHALL be unchanged. Because the section holds one name per mode, at most one theme SHALL be a mode's default at any time, and the same theme SHALL be allowed to hold both. `removeTheme` SHALL refuse with `THEME_IN_USE`, naming the mode or modes, while `defaultThemes` names the theme. `composeThemes` SHALL set the composed registry's default for each mode `defaultThemes` names; a name the composed registry does not hold — missing, or skipped as invalid — SHALL be dropped with a diagnostic, leaving that mode's built-in default. On read, a section this version does not know SHALL be ignored, not refused, so data written by a later version still loads. Composing for `ANONYMOUS_PRINCIPAL` SHALL leave both built-in defaults. Every adapter (memory, file, SQLite, Cosmos) SHALL behave identically, and a store holding no record SHALL read as empty settings. The invariant "a default names a stored theme" SHALL hold under concurrent writes: `putSettings` SHALL commit only while every theme its update names still exists and the record is unchanged since it was read (a section the update leaves alone is kept as stored, even if it names a theme that is gone), and `removeTheme` SHALL delete only while the record it checked is unchanged — retrying, or refusing with the matching code, when a concurrent write intervenes. A stored value that is not a name SHALL be dropped on read with a diagnostic. Default themes are cosmetic: when the settings cannot be read, `composeThemes` SHALL keep the built-in defaults and never fail: an adapter written before settings existed has none to read, silently, and a failing read is reported with a diagnostic. A Cosmos permission refusal SHALL surface as `FORBIDDEN` whether it arrives from a single operation or from a transactional batch, whose SDK error carries no status code, and Cosmos `putSettings` SHALL check only the defaults its update writes, as every adapter does.

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
