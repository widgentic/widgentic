## MODIFIED Requirements

### Requirement: Template node forms and interpretation
A `TemplateNode` SHALL be one of: a string literal (rendered as text); `{ bind: <path> }` (resolved value rendered as text); `{ tag, attrs?, children? }` where attr values are strings, `{ bind: <path> }`, or one attr-level transform of the bind — `{ bind, map: Record<string, string>, default?: string }` (the resolved value, as a string, SELECTS a key: a hit emits that key's author-written literal, a miss emits `default` or empty text; data never contributes output characters, it only chooses among authored options) or `{ bind, prefix: string }` (emitted as the author-literal prefix concatenated with the resolved value when that value is a non-empty string, and as empty text otherwise — an absent email yields no dead `mailto:` href), or `{ bind, format: <format spec> }` (the resolved value rendered through a CLOSED, data-only format vocabulary). `map`, `prefix` and `format` SHALL be mutually exclusive on one attr value. A TEXT bind node MAY carry ONE of `map` or `format`: `{ bind, map, default? }` renders the authored label the value SELECTS (a status becomes its wording; a miss emits `default` or empty text — the same discipline as the attribute form), and `{ bind, format }` renders through the format vocabulary. `prefix` is an ATTRIBUTE-value transform — it composes a scheme — and has no meaning in a text position: a text bind carrying it stays valid and renders the plain value, so no stored template is refused on read. A format spec SHALL be one of: `{ type: "number", decimals?: <integer 0–8>, locale?: <literal> }`; `{ type: "currency", currency: <ISO-4217 code, three uppercase letters>, decimals?: <integer 0–8>, currencyDisplay?: "narrowSymbol" | "symbol" | "code", locale?: <literal> }` (default `narrowSymbol`, so a COP amount reads `$3,207` rather than `COP 3,207`; `symbol`/`code` give the disambiguated form an author needs when two dollar-denominated currencies sit side by side); `{ type: "date", pattern: <string of the tokens yyyy, MM, dd, HH, mm, ss plus literal separators, bounded length> }`. Numeric formats SHALL accept finite numbers and numeric STRINGS; the date format SHALL accept ISO-8601 strings and epoch numbers (seconds below 1e11, milliseconds above — the two shapes APIs emit, unambiguous under that split), treating an unzoned ISO value as UTC and formatting in UTC so server and preview renders agree; a date pattern SHALL contain at least one token and no letter outside a token, since a stray letter would render as a constant that hides the value. The default locale SHALL be `en-US` for the same reason; `locale` is an author literal the runtime must know, and numeric output SHALL use ordinary spaces where locales emit no-break variants, so engines with different ICU builds agree byte for byte. A value the format cannot parse SHALL render as the plain formatted value — data is never hidden and formatting never throws. Formats produce TEXT only: no markup, no URL semantics, no expressions — the author supplies every literal in the spec and data only flows through it; `{ each: <path>, template, empty? }` (template rendered once per array element with the element as scope); `{ when: <path>, template, else? }` (template rendered when the path resolves truthy, else the `else` template or nothing). Directives SHALL NOT appear in the output tree.

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

### Requirement: Template validation
`validateTemplate(input)` SHALL return `{ ok: true, template } | { ok: false, error: TemplateError }` where `TemplateError` has `code` (`"INVALID_TEMPLATE_NODE" | "INVALID_PATH" | "FORBIDDEN_ATTRIBUTE" | "FORBIDDEN_TAG" | "TEMPLATE_TOO_DEEP" | "INVALID_ACTION" | "CONFLICTING_ATTRIBUTES"`), `message`, and a dotted `path` locating the offending node within the template. Validation SHALL reject non-node shapes, non-string paths, attr values outside the documented forms (string, `{ bind }`, `{ bind, map, default? }`, `{ bind, prefix }`), and nesting deeper than 64 levels. For the transforms it SHALL reject, with dotted paths: a `map` that is not a plain object of string values, a non-string `default` or `prefix`, a `default` without `map`, `map`, `prefix` or `format` without `bind`, more than one of `map`, `prefix` and `format` together on one attribute value, `map` together with `format` on a text bind, and a malformed `format` — an unknown `type`, `decimals` outside the documented integer range, a `currency` that is not three uppercase letters, a `currencyDisplay` outside the documented vocabulary, a `pattern` that is not a string, exceeds the documented bound, contains characters outside the token-and-separator allowlist, has no token or has a letter outside a token, or a `locale` outside a bounded BCP-47 shape or unknown to the runtime. For action bindings it SHALL reject with `INVALID_ACTION`: a binding that is neither a `{ ref }` nor a valid inline definition, an `input` mapping to a non-string non-`{ const }` value or to a field the input schema does not declare, an `output.mode` outside `replace|merge|patch`, `mode: "patch"` without `path`, and a `prompt` whose text segments are not literals or `{ bind }`; and with `CONFLICTING_ATTRIBUTES` an element carrying both `action` and `href`. Prompt definitions' `{ bind }` segments SHALL face the same path-syntax check as input mappings (`INVALID_ACTION` at the segment's path), so a malformed bind cannot render silently as empty text.

#### Scenario: Valid template passes
- **WHEN** a template using all five node forms is validated
- **THEN** the result SHALL be `{ ok: true, template }`

#### Scenario: Malformed node is located
- **WHEN** `validateTemplate({ tag: "div", children: [{ bind: 42 }] })` is called
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "INVALID_TEMPLATE_NODE"`
- **AND** `error.path` SHALL point at `children.0`

#### Scenario: Excessive nesting is rejected
- **WHEN** a template nested deeper than 64 levels is validated
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "TEMPLATE_TOO_DEEP"`

#### Scenario: Malformed transforms are located
- **WHEN** attr values carrying `map: "nope"`, `map: { a: 1 }`, a numeric `prefix`, or both `map` and `prefix` are validated
- **THEN** each SHALL fail with `INVALID_TEMPLATE_NODE` and a dotted `path` locating the attr

#### Scenario: Malformed action bindings are located
- **WHEN** an element carries `action: { ref: "x", input: { city: 5 } }`, `action: { ref: "x", output: { mode: "patch" } }`, `action: { ref: "x", output: { mode: "upsert" } }`, or `action: { input: {} }` (neither `ref` nor `definition`)
- **THEN** each SHALL fail with `INVALID_ACTION` and a dotted `path` locating the element

#### Scenario: Action and href cannot share an element
- **WHEN** `{ tag: "a", attrs: { href: "https://x.example" }, action: { ref: "open" } }` is validated
- **THEN** the result SHALL have `error.code: "CONFLICTING_ATTRIBUTES"`

#### Scenario: Prompt bind paths are checked
- **WHEN** an element carries `action: { definition: { kind: "prompt", text: ["Hi ", { bind: "a..b" }] } }`
- **THEN** validation SHALL fail with `INVALID_ACTION` and a `path` ending in `action.definition.text.1`

#### Scenario: Malformed formats are located
- **WHEN** a template carries `format: { type: "money" }`, `format: { type: "currency", currency: "cop" }`, `format: { type: "date", pattern: "<script>" }`, or `format` beside `prefix` on one attr value
- **THEN** validation SHALL fail with a dotted path locating each offending value

#### Scenario: A pattern that would hide the value is refused
- **WHEN** a template carries `format: { type: "date", pattern: "d/M/yy" }` or `pattern: "--"`
- **THEN** validation SHALL fail at the value's dotted path, because no token (or a stray letter) would render a constant instead of the date

#### Scenario: Epoch numbers format by magnitude
- **WHEN** `{ bind: "ts", format: { type: "date", pattern: "yyyy-MM-dd" } }` renders `{ ts: 1788228287 }` and again `{ ts: 1788228287000 }`
- **THEN** both SHALL render `"2026-09-01"`

#### Scenario: A text bind maps a value to an authored label
- **WHEN** `{ tag: "span", children: [{ bind: "status", map: { "do-not-contact": "Do not contact" }, default: "Unknown" }] }` renders `{ status: "do-not-contact" }` and again `{ status: "paused" }`
- **THEN** the span SHALL read `"Do not contact"` and then `"Unknown"`

#### Scenario: Prefix on a text bind stays valid and inert
- **WHEN** a stored template carries `{ bind: "s", prefix: "mailto:" }` as a CHILD node
- **THEN** validation SHALL pass and the node SHALL render the plain value — the widget is never refused on read for an attribute-only transform
