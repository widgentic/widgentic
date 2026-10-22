## MODIFIED Requirements

### Requirement: Template node forms and interpretation
A `TemplateNode` SHALL be one of: a string literal (rendered as text); `{ bind: <path> }` (resolved value rendered as text); `{ tag, attrs?, children? }` where attr values are strings, `{ bind: <path> }`, or one attr-level transform of the bind — `{ bind, map: Record<string, string>, default?: string }` (the resolved value, as a string, SELECTS a key: a hit emits that key's author-written literal, a miss emits `default` or empty text; data never contributes output characters, it only chooses among authored options) or `{ bind, prefix: string }` (emitted as the author-literal prefix followed by the resolved value, composed by the URL-value rule below, when that value is a non-empty string, and as empty text otherwise — an absent email yields no dead `mailto:` href), or `{ bind, format: <format spec> }` (the resolved value rendered through a CLOSED, data-only format vocabulary). `map`, `prefix` and `format` SHALL be mutually exclusive on one attr value. The URL-value rule SHALL compose a value behind an author prefix by the prefix's shape alone, never by the value: (1) a prefix that is exactly `http:`, `https:`, `http://` or `https://` (any case) makes the value the rest of a URL, so whitespace and control characters, `"`, `<`, `>`, `\`, `^`, `` ` ``, `{`, `|`, `}` and every non-ASCII character SHALL be percent-encoded as UTF-8 and every other character kept, `%` and the URL delimiters included — the value chooses the host, path and query, as a whole bound URL does; (2) a prefix that starts with `data:` (any case) SHALL keep the value as written, since the URL guard admits only a base64 image source, whose alphabet needs no encoding; (3) any other prefix that is only a scheme (`mailto:`, `tel:`) makes the value that scheme's address, so only letters, digits and `-._~@+:;,=!$'()*/` SHALL be kept and every other character percent-encoded as UTF-8, `%`, `?`, `#` and `&` among them, so the value cannot add header fields or a fragment; (4) any other prefix SHALL encode the value as one URI component, as ECMAScript's `encodeURIComponent` does, so the value cannot add parameters, a fragment or a path segment. A lone surrogate SHALL encode as `%EF%BF%BD`. The composed value still faces the URL guard. A TEXT bind node MAY carry ONE of `map`, `format` or `markdown: true`: `{ bind, map, default? }` renders the authored label the value SELECTS (a status becomes its wording; a miss emits `default` or empty text — the same discipline as the attribute form), and `{ bind, format }` renders through the format vocabulary, and `{ bind, markdown: true }` renders the bound text as Markdown, as the requirement "Markdown text binds" defines (`markdown` is a text-bind mode with no attribute form). `prefix` is an ATTRIBUTE-value transform — it composes a scheme — and has no meaning in a text position: a text bind carrying it stays valid and renders the plain value, so no stored template is refused on read. A format spec SHALL be one of: `{ type: "number", decimals?: <integer 0–8>, locale?: <literal> }`; `{ type: "currency", currency: <ISO-4217 code, three uppercase letters>, decimals?: <integer 0–8>, currencyDisplay?: "narrowSymbol" | "symbol" | "code", locale?: <literal> }` (default `narrowSymbol`, so a COP amount reads `$3,207` rather than `COP 3,207`; `symbol`/`code` give the disambiguated form an author needs when two dollar-denominated currencies sit side by side); `{ type: "date", pattern: <string of the tokens yyyy, MM, dd, HH, mm, ss plus literal separators, bounded length>, zone?: "utc" | "value" | "viewer" }`; or one of the text formats `{ type: "count" }`, `{ type: "join" }`, `{ type: "truncate" }` and `{ type: "pluralize" }` with the fields the requirement "Text presentation formats" defines. Numeric formats SHALL accept finite numbers and numeric STRINGS; the date format SHALL accept ISO-8601 strings and epoch numbers (seconds below 1e11, milliseconds above — the two shapes APIs emit, unambiguous under that split), reading an unzoned ISO value as UTC, and its `zone` (default `utc`) SHALL choose the wall clock the tokens read: `utc` the instant in UTC; `value` the time the value itself states — its own offset, an unzoned ISO value as written, an epoch number in UTC; `viewer` the viewer's zone, which only an MCP Apps frame knows — on a TEXT bind the renderer SHALL emit the formatted text inside a `time` element whose `datetime` is the instant in ISO-8601 UTC and whose `data-wg-date` is the pattern, the text being the UTC rendering that every surface without a viewer shows, while a value the format cannot parse renders as plain text with no `time` element; `zone: "viewer"` SHALL be refused on an attribute value, since a frame can rewrite only text; `utc` and `value` renders are deterministic, so server and preview renders agree byte for byte; a date pattern SHALL contain at least one token and no letter outside a token, since a stray letter would render as a constant that hides the value. The default locale SHALL be `en-US` for the same reason; `locale` is an author literal the runtime must know, and numeric output SHALL use ordinary spaces where locales emit no-break variants, so engines with different ICU builds agree byte for byte. A value the format cannot parse SHALL render as the plain formatted value — data is never hidden and formatting never throws. Formats produce TEXT only: no markup, no URL semantics, no expressions — the author supplies every literal in the spec and data only flows through it; `{ each: <path>, template, empty? }` (template rendered once per array element with the element as scope); `{ when: <path>, template, else? }` (template rendered when the path resolves truthy, else the `else` template or nothing). Directives SHALL NOT appear in the output tree.

#### Scenario: Bind renders data as text
- **WHEN** template `{ tag: "span", children: [{ bind: "customer.name" }] }` renders payload data `{ customer: { name: "Ada" } }`
- **THEN** the output SHALL be a `span` element containing the text `"Ada"`

#### Scenario: Each repeats over arrays with item scope
- **WHEN** template `{ each: "lines", template: { tag: "li", children: [{ bind: "amount" }] } }` renders data `{ lines: [{ amount: 1 }, { amount: 2 }] }`
- **THEN** the output SHALL contain two `li` elements with texts `"1"` and `"2"`

#### Scenario: When selects between branches
- **WHEN** a `{ when: "paid", template: A, else: B }` node renders with `paid: true` and again with `paid: false`
- **THEN** the first render SHALL contain A's output and not B's, and the second the reverse

#### Scenario: Bound attribute values resolve
- **WHEN** template `{ tag: "a", attrs: { title: { bind: "label" } } }` renders data `{ label: "Docs" }`
- **THEN** the output element SHALL have `title="Docs"`

#### Scenario: A bound value selects an authored class
- **WHEN** template `{ tag: "span", attrs: { class: { bind: "status", map: { "do-not-contact": "wg-status wg-status-danger", "active": "wg-status wg-status-success" }, default: "wg-status" } } }` renders data `{ status: "do-not-contact" }`
- **THEN** the output element's `class` SHALL be `"wg-status wg-status-danger"`
- **AND** with `{ status: "unknown-value" }` it SHALL be `"wg-status"`
- **AND** with the `default` omitted and a miss, the attribute value SHALL be empty

#### Scenario: A prefix builds a scheme href from a bound value
- **WHEN** template `{ tag: "a", attrs: { href: { bind: "email", prefix: "mailto:" } } }` renders data `{ email: "ada@example.org" }`
- **THEN** the output element SHALL have `href="mailto:ada@example.org"`
- **AND** with `{ email: "" }` or missing `email` the emitted value SHALL be empty — the prefix alone is never emitted

#### Scenario: A currency format renders a parsed numeric string
- **WHEN** `{ bind: "ask", format: { type: "currency", currency: "COP", decimals: 0 } }` renders data `{ ask: "3206.9905920000" }`
- **THEN** the output text SHALL be `"$3,207"` — the amount with no decimals, grouped per the default locale, named by the default `narrowSymbol` — and the payload value SHALL be unchanged
- **AND** with `currencyDisplay: "symbol"` or `"code"` it SHALL be the disambiguated form `"COP 3,207"`

#### Scenario: A date pattern formats an ISO timestamp
- **WHEN** `{ bind: "date", format: { type: "date", pattern: "dd-MM-yyyy HH:mm" } }` renders data `{ date: "2026-09-01T02:04:47.257871358" }`
- **THEN** the output text SHALL be `"01-09-2026 02:04"`

#### Scenario: Unparseable values render raw
- **WHEN** a currency format receives `"n/a"` and a date format receives `"soon"`
- **THEN** each SHALL render the value as plain text, unchanged and without error

#### Scenario: A text format renders on a text bind and an attribute alike
- **WHEN** `{ tag: "span", attrs: { title: { bind: "tags", format: { type: "join" } } }, children: [{ bind: "tags", format: { type: "count" } }] }` renders data `{ tags: ["red", "green"] }`
- **THEN** the output SHALL be a `span` whose `title` is `red, green` and whose text is `2`

#### Scenario: A value behind a query prefix is one encoded component
- **WHEN** template `{ tag: "img", attrs: { src: { bind: "name", prefix: "https://api.dicebear.com/9.x/initials/svg?seed=" } } }` renders `{ name: "Ada & Lin?x=1#y" }`
- **THEN** the `src` SHALL be `https://api.dicebear.com/9.x/initials/svg?seed=Ada%20%26%20Lin%3Fx%3D1%23y`

#### Scenario: A value behind a bare mail or phone scheme stays an address
- **WHEN** `{ href: { bind: "email", prefix: "mailto:" } }` renders `{ email: "ada@example.org" }` and `{ email: "ada@example.org?subject=hi#x" }`, and `{ href: { bind: "phone", prefix: "tel:" } }` renders `{ phone: "+1 555-0100" }`
- **THEN** the hrefs SHALL be `mailto:ada@example.org`, `mailto:ada@example.org%3Fsubject=hi%23x` and `tel:+1%20555-0100`

#### Scenario: A value behind a bare web scheme keeps its URL structure
- **WHEN** `{ src: { bind: "rest", prefix: "https:" } }` renders `{ rest: "//cdn.example.com/a.png?w=1&h=2" }` and `{ rest: "//cdn.example.com/a b.png" }`
- **THEN** the `src` values SHALL be `https://cdn.example.com/a.png?w=1&h=2` and `https://cdn.example.com/a%20b.png`

#### Scenario: A value behind a web scheme with slashes keeps its URL
- **WHEN** `{ href: { bind: "site", prefix: "https://" } }` renders `{ site: "example.com/a/b?c=1" }`
- **THEN** the `href` SHALL be `https://example.com/a/b?c=1`

#### Scenario: A base64 value behind a data prefix stays an image source
- **WHEN** `{ tag: "img", attrs: { src: { bind: "pixel", prefix: "data:image/png;base64," } } }` renders `{ pixel: "iVBORw0KGgo+/AAA=" }` and `{ pixel: "<svg onload=x>" }`
- **THEN** the first `src` SHALL be `data:image/png;base64,iVBORw0KGgo+/AAA=`
- **AND** the second SHALL be dropped by the image-source guard

#### Scenario: Non-ASCII is encoded as UTF-8
- **WHEN** `{ src: { bind: "name", prefix: "https://example.com/u?n=" } }` renders `{ name: "José" }`
- **THEN** the `src` SHALL be `https://example.com/u?n=Jos%C3%A9`

#### Scenario: A date in the value's own offset
- **WHEN** `{ bind: "at", format: { type: "date", pattern: "HH:mm", zone: "value" } }` renders `{ at: "2026-10-21T09:30:00-07:00" }`, `{ at: "2026-10-21T09:30:00" }` and `{ at: 1700000000 }`
- **THEN** the texts SHALL be `09:30`, `09:30` and `22:13`
- **AND** with no `zone` the first SHALL render `16:30`, the instant in UTC

#### Scenario: A viewer-zone date carries its instant for the frame
- **WHEN** `{ tag: "p", children: [{ bind: "at", format: { type: "date", pattern: "dd-MM HH:mm", zone: "viewer" } }] }` renders `{ at: "2026-10-21T09:30:00-07:00" }`
- **THEN** the output SHALL be `<p><time datetime="2026-10-21T16:30:00.000Z" data-wg-date="dd-MM HH:mm">21-10 16:30</time></p>`
- **AND** with `{ at: "soon" }` it SHALL be `<p>soon</p>`

#### Scenario: A viewer zone on an attribute value is refused
- **WHEN** a template's attribute value is `{ bind: "at", format: { type: "date", pattern: "HH:mm", zone: "viewer" } }`
- **THEN** validation SHALL fail with `INVALID_TEMPLATE_NODE`, its message naming `format.zone`
- **AND** the same value with `zone: "value"` or `"utc"` SHALL validate
