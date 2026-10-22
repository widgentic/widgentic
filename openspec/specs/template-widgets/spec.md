# template-widgets Specification

## Purpose
Serializable widget templates — the runtime for user-defined custom widgets and a future widget designer. A JSON template DSL (text, `bind`, element, `each`, `when`) compiles to ordinary catalog renderers; validation returns path-addressed structured errors; templates from untrusted authors cannot execute code, attach event handlers, emit raw markup, or smuggle script-scheme URLs.
## Requirements
### Requirement: Template module programmatic surface
The package SHALL export from a `./templates` entry: `validateTemplate(input: unknown)`, `compileTemplate(template: WidgetTemplate, options?: { maxNodes?: number }): WidgetRenderer`, `registerTemplate(catalog: WidgetCatalog, kind: string, template: unknown, descriptor?, options?): void`, `countTemplateNodes(template)`, `DEFAULT_MAX_NODES`, and the `WidgetTemplate`/`TemplateNode`/`TemplateError` types. Templates SHALL be JSON-serializable plain data with no functions.

#### Scenario: Compiled template is an ordinary renderer
- **WHEN** `compileTemplate` output is registered via `catalog.register` and a payload of that kind is rendered
- **THEN** `catalog.render` SHALL return `{ ok: true, node }` produced by interpreting the template

#### Scenario: registerTemplate validates then registers
- **WHEN** `registerTemplate(catalog, "invoice", <valid template>)` is called
- **THEN** the kind SHALL render through the catalog
- **AND** calling it again with the same kind SHALL throw the catalog's `DuplicateKindError`

#### Scenario: registerTemplate rejects invalid templates loudly
- **WHEN** `registerTemplate(catalog, "bad", { bind: 42 })` is called
- **THEN** the call SHALL throw an error carrying the structured `TemplateError`

#### Scenario: Node counting is available for storage limits
- **WHEN** `countTemplateNodes(template)` is called on a template with nested `each`/`when` branches
- **THEN** it SHALL return the number of template nodes (structure, not rendered output) so stores can enforce a size limit before persisting

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

### Requirement: Path resolution
Paths SHALL be dot-notation resolved against `payload.data`, with these rules: inside `each`, the scope is the current array element; the path `"."` SHALL resolve to the scope value itself; paths starting with `"$meta."` SHALL resolve against `payload.meta`; paths starting with `"$root."` SHALL resolve against `payload.data` regardless of the enclosing `each` nesting; each leading `"$parent."` segment SHALL step out of one enclosing `each` scope (repeatable — `"$parent.$parent.x"` steps out twice; stepping past the outermost scope resolves to `undefined`); and the path `"$index"` SHALL resolve to the zero-based position of the current element within the innermost `each` (`undefined` outside any `each`). Missing or non-traversable paths SHALL resolve to empty text for `bind`, an empty sequence for `each`, and falsy for `when`. Interpretation SHALL never throw regardless of `data` shape.

#### Scenario: Dot path traverses nested objects and array indices
- **WHEN** `{ bind: "items.0.name" }` renders data `{ items: [{ name: "first" }] }`
- **THEN** the output text SHALL be `"first"`

#### Scenario: Scope dot inside each
- **WHEN** `{ each: "tags", template: { bind: "." } }` renders data `{ tags: ["a", "b"] }`
- **THEN** the output SHALL contain texts `"a"` and `"b"`

#### Scenario: Meta escape prefix
- **WHEN** `{ bind: "$meta.title" }` renders a payload with `meta: { title: "T" }`
- **THEN** the output text SHALL be `"T"`

#### Scenario: Root and parent escape the each scope
- **WHEN** `{ each: "groups", template: { each: "rows", template: { tag: "span", children: [{ bind: "$root.owner" }, "/", { bind: "$parent.name" }, "/", { bind: "id" }] } } }` renders `{ owner: "ada", groups: [{ name: "g1", rows: [{ id: 7 }] }] }`
- **THEN** the output SHALL contain the text `"ada/g1/7"`

#### Scenario: Index is available inside each
- **WHEN** `{ each: "tags", template: { bind: "$index" } }` renders `{ tags: ["a", "b"] }`
- **THEN** the output SHALL contain texts `"0"` and `"1"`
- **AND** `{ bind: "$index" }` outside any `each` SHALL render empty text

#### Scenario: Missing paths are blanks, not errors
- **WHEN** a template binds `"nope.deep"`, repeats over `"absent"`, and conditions on `"missing"` against data `{}`
- **THEN** rendering SHALL succeed with empty text, no repetitions, and the `else` branch respectively

### Requirement: Template validation
`validateTemplate(input)` SHALL return `{ ok: true, template } | { ok: false, error: TemplateError }` where `TemplateError` has `code` (`"INVALID_TEMPLATE_NODE" | "INVALID_PATH" | "FORBIDDEN_ATTRIBUTE" | "FORBIDDEN_TAG" | "TEMPLATE_TOO_DEEP" | "INVALID_ACTION" | "CONFLICTING_ATTRIBUTES"`), `message`, and a dotted `path` locating the offending node within the template. Validation SHALL reject non-node shapes, non-string paths, attr values outside the documented forms (string, `{ bind }`, `{ bind, map, default? }`, `{ bind, prefix }`), and nesting deeper than 64 levels. For the transforms it SHALL reject, with dotted paths: a `map` that is not a plain object of string values, a non-string `default` or `prefix`, a `default` without `map`, `map`, `prefix` or `format` without `bind`, more than one of `map`, `prefix` and `format` together on one attribute value, `map` together with `format` on a text bind, and a malformed `format` — an unknown `type`, `decimals` outside the documented integer range, a `currency` that is not three uppercase letters, a `currencyDisplay` outside the documented vocabulary, a `pattern` that is not a string, exceeds the documented bound, contains characters outside the token-and-separator allowlist, has no token or has a letter outside a token, or a `locale` outside a bounded BCP-47 shape or unknown to the runtime; a malformed text format — a `join` `separator` or `last` that is not a string or exceeds the documented bound, or a `field` that is not a plain dotted path; a `truncate` `length` that is not an integer in the documented range, or an `ellipsis` that is not a string within its bound; a `pluralize` `forms` that is not an object, lacks `other`, or carries a key outside the plural categories (`zero`, `one`, `two`, `few`, `many`, `other`) or a value that is not a string within its bound; and a misplaced Markdown mode — a `markdown` that is not a boolean, `markdown: true` together with `map` or `format` on a text bind, or `markdown` on an attribute value. For action bindings it SHALL reject with `INVALID_ACTION`: a binding that is neither a `{ ref }` nor a valid inline definition, an `input` mapping to a non-string non-`{ const }` value or to a field the input schema does not declare, an `output.mode` outside `replace|merge|patch`, `mode: "patch"` without `path`, and a `prompt` whose text segments are not literals or `{ bind }`; and with `CONFLICTING_ATTRIBUTES` an element carrying both `action` and `href`. Prompt definitions' `{ bind }` segments SHALL face the same path-syntax check as input mappings (`INVALID_ACTION` at the segment's path), so a malformed bind cannot render silently as empty text.

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

#### Scenario: Malformed text formats are located
- **WHEN** a template carries `format: { type: "truncate", length: 0 }`, `format: { type: "truncate", length: 12.5 }`, `format: { type: "join", field: "$root.name" }`, `format: { type: "pluralize", forms: { one: "item" } }` or `format: { type: "pluralize", forms: { single: "item", other: "items" } }`
- **THEN** validation SHALL fail with `INVALID_TEMPLATE_NODE` at the bind's path, with a message naming the field

#### Scenario: A misplaced Markdown mode is refused
- **WHEN** a template carries `{ bind: "notes", markdown: true, format: { type: "truncate", length: 80 } }`, `{ bind: "notes", markdown: "yes" }`, or an attribute value `{ bind: "notes", markdown: true }`
- **THEN** validation SHALL fail with `INVALID_TEMPLATE_NODE` at that node's or attribute's path
- **AND** `{ bind: "notes", markdown: true }` and `{ bind: "notes", markdown: false }` on a text bind SHALL pass

### Requirement: Untrusted-author safety
Event-handler attribute names (matching `on*`, case-insensitive) SHALL fail validation with `FORBIDDEN_ATTRIBUTE` and SHALL be skipped by the interpreter even when validation was bypassed. Attribute names starting with `data-wg-` are reserved for the renderer and SHALL likewise fail validation with `FORBIDDEN_ATTRIBUTE` and be skipped at render time — an author cannot hand-write an action descriptor; only a validated `action` binding produces one. URL-bearing attributes (`href`, `src`, `action`, `formaction`, `xlink:href`) whose resolved value carries a scheme other than `http`, `https`, `mailto`, `tel`, or a relative reference SHALL be dropped at render time — with one image-context exception: the `src` attribute of an `img` element SHALL additionally accept base64-form `data:image/*;base64,` URIs, exactly as the shared `isSafeImageSrc` guard defines them. `data:` remains dropped for every other URL-bearing attribute. Bindings SHALL only ever produce text and attribute strings, with one exception whose shape the parser fixes: a Markdown text bind produces elements, and its parser, not the value, chooses them — only the documented subset's tags (`p`, `br`, `strong`, `em`, `code`, `a`, `ul`, `ol`, `li`) inside one `div.wg-md`, every character of the value emitted as text, and every link URL facing the same scheme guard as a bound `href`. A bound value SHALL never be parsed as HTML. The transforms keep that posture: a `map` emits only author-written literals (data selects, it cannot append), and a `prefix`-composed value runs the same URL guard as any bound value, so a hostile bound value cannot smuggle a scheme past an innocent prefix. Action bindings keep it too: a prompt's text is plain text assembled from literals and bound values (never markup, capped at 2 000 characters), an inline http definition's URL is author-written and fixed (bindings cannot reach it), and the descriptor an element carries is data the trusted bridge validates before acting — the template never gains a way to run code. Element tags SHALL face a policy too: `script`, `iframe`, `frame`, `frameset`, `object`, `embed`, `style`, `link`, `meta`, `base`, `template` and `noscript` SHALL fail validation with `FORBIDDEN_TAG` and SHALL render as nothing when validation was bypassed; the `srcdoc` attribute SHALL be treated like an event handler (`FORBIDDEN_ATTRIBUTE`, skipped), and `data`, `poster` and `ping` SHALL join the URL-bearing attributes that face the scheme guard. A template can therefore never introduce active content into the frame.

#### Scenario: Event handler rejected and skipped
- **WHEN** `validateTemplate({ tag: "button", attrs: { onclick: "x()" } })` is called
- **THEN** the result SHALL have `error.code: "FORBIDDEN_ATTRIBUTE"`
- **AND WHEN** the same template is compiled and rendered anyway
- **THEN** the output element SHALL have no `onclick` attribute

#### Scenario: Hand-written descriptors are rejected and skipped
- **WHEN** `validateTemplate({ tag: "button", attrs: { "data-wg-action": "{}" } })` is called
- **THEN** the result SHALL have `error.code: "FORBIDDEN_ATTRIBUTE"`
- **AND WHEN** the same template is compiled and rendered anyway
- **THEN** the output element SHALL have no `data-wg-action` attribute

#### Scenario: javascript scheme is dropped
- **WHEN** `{ tag: "a", attrs: { href: { bind: "url" } } }` renders data `{ url: "javascript:alert(1)" }`
- **THEN** the output `a` element SHALL have no `href` attribute
- **AND** an `https:` value SHALL be kept

#### Scenario: data-image URI allowed on img src only
- **WHEN** `{ tag: "img", attrs: { src: { bind: "pic" } } }` renders data `{ pic: "data:image/png;base64,iVBORw0KGgo=" }`
- **THEN** the output `img` element SHALL keep the `src` attribute
- **AND WHEN** `{ tag: "a", attrs: { href: { bind: "pic" } } }` renders the same data
- **THEN** the output `a` element SHALL have no `href` attribute

#### Scenario: Bound markup stays inert
- **WHEN** a bind resolves to `"<img onerror=x src=y>"`
- **THEN** serialized HTML SHALL contain the escaped text and no `img` element

#### Scenario: Transformed values still face the URL guard
- **WHEN** `{ tag: "a", attrs: { href: { bind: "email", prefix: "mailto:" } } }` renders `{ email: "ada@example.org" }`
- **THEN** the `href` SHALL be kept (mailto is allowlisted)
- **AND WHEN** a template author writes `prefix: "javascript:"` in the same position
- **THEN** the composed value SHALL be dropped by the scheme guard exactly as a bound `javascript:` value is

#### Scenario: Prompt text cannot carry markup
- **WHEN** a prompt action's bound segment resolves to `"<b>hi</b>"`
- **THEN** the descriptor's `text` SHALL contain the literal characters `<b>hi</b>` as plain text, and the host message sent from it SHALL be a text block

#### Scenario: Active-content tags are rejected and skipped
- **WHEN** `validateTemplate({ tag: "script", children: ["alert(1)"] })` is called, or the same for `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`
- **THEN** the result SHALL have `error.code: "FORBIDDEN_TAG"` with the node's dotted path
- **AND WHEN** such a template is compiled and rendered anyway
- **THEN** the output SHALL contain no element of that tag

#### Scenario: srcdoc and data URLs cannot smuggle content
- **WHEN** `{ tag: "div", attrs: { srcdoc: "<script>x</script>" } }` is validated
- **THEN** the result SHALL have `error.code: "FORBIDDEN_ATTRIBUTE"`
- **AND WHEN** `{ tag: "object", attrs: { data: { bind: "u" } } }` renders `{ u: "javascript:alert(1)" }`
- **THEN** the output element SHALL have no `data` attribute

#### Scenario: Markdown cannot smuggle markup
- **WHEN** `{ bind: "notes", markdown: true }` renders `{ notes: "<img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](data:text/html,hi)" }`
- **THEN** the output SHALL contain no `img` and no `a` element, and its text SHALL read `<img src=x onerror=alert(1)> x y`

### Requirement: Multi-node root wrapping
When a template's root interprets to anything other than exactly one node, the compiled renderer SHALL wrap the output in a `div` element with class `wg-template`, so the renderer contract (a single root `WidgetNode`) always holds. Single-node roots SHALL NOT be wrapped — with one exception: a render truncated by the node budget SHALL be wrapped even when it yields a single node, because the wrapper carries the `data-truncated` marker the bounded-interpretation requirement demands.

#### Scenario: Each-rooted template wraps
- **WHEN** a template whose root is an `each` node renders two items
- **THEN** the output SHALL be a single `div` with `class="wg-template"` containing both items

#### Scenario: Single-node root is unwrapped
- **WHEN** a template whose root is an element node renders
- **THEN** the output SHALL be that element itself, with no `wg-template` wrapper

#### Scenario: Truncated single-node renders keep the marker
- **WHEN** a render is stopped by the node budget and yields exactly one node
- **THEN** the output SHALL be wrapped in the `wg-template` container carrying `data-truncated="true"`

### Requirement: Reactive integration
Template widgets SHALL work with in-place updates: mounting a payload of a template-registered kind via `mountWidget` (with the owning catalog) and updating with changed data SHALL patch the DOM, preserving identity of unchanged elements.

#### Scenario: Template widget updates in place
- **WHEN** a template with an `each` over records is registered, mounted, and updated with one more record
- **THEN** the new item's element SHALL be appended
- **AND** the existing item elements SHALL keep their DOM identity

### Requirement: Keyed each
An `each` node MAY carry `key: <path>`, a path in the same grammar as `bind`, resolved against each item's scope (so `"sku"` reads the item's `sku`, and the escapes `$root`, `$parent`, `$meta` and `$index` resolve as they do in a bind inside that `each`). Validation SHALL refuse a `key` that is not a string (`INVALID_TEMPLATE_NODE`) or that fails path syntax (`INVALID_PATH`), at the node's path. During interpretation, an iteration whose output is exactly one element node and whose key path resolves to a string or a finite number SHALL give that element the key's string form; an iteration rendering zero nodes, several nodes, or text, or whose key resolves to anything else, SHALL emit its nodes without a key. The `empty` branch's output SHALL never be keyed. A `key` adds no output a reader sees and SHALL NOT change the rendered HTML. Templates without `key` SHALL render exactly as before.

#### Scenario: Keyed iterations carry their item keys
- **WHEN** `{ each: "lines", key: "sku", template: { tag: "li", children: [{ bind: "name" }] } }` renders `{ lines: [{ sku: "A1", name: "Bolt" }, { sku: 42, name: "Nut" }] }`
- **THEN** the two `li` elements SHALL carry keys `"A1"` and `"42"`

#### Scenario: A keyed template widget reorders in place
- **WHEN** a template kind with a keyed `each` is mounted through `mountWidget` and updated with its items in a new order
- **THEN** each item element SHALL keep its DOM identity at its new position

#### Scenario: Multi-node iterations stay unkeyed
- **WHEN** a keyed `each` whose item template renders two sibling elements per item is interpreted
- **THEN** none of its output elements SHALL carry a key

#### Scenario: Invalid key paths are refused at the door
- **WHEN** a template's `each` carries `key: 5` or `key: "a..b"`
- **THEN** `validateTemplate` SHALL fail with `INVALID_TEMPLATE_NODE` or `INVALID_PATH` respectively, at that node's path

#### Scenario: The key never changes the HTML
- **WHEN** the same template renders with and without `key` on its `each`
- **THEN** `renderToHtml` of both results SHALL be identical

### Requirement: Bounded interpretation
Interpretation SHALL be bounded by a node budget (`options.maxNodes`, default `DEFAULT_MAX_NODES` = 50 000). Template size alone bounds nothing, because `each` multiplies template nodes by agent-supplied data length; a stored template driven by a large payload must not be able to spend the process. When the budget is exhausted, interpretation SHALL stop, return the nodes built so far, and mark the render as truncated so the outcome is visible rather than silent. The bound SHALL be deterministic (node count, not wall-clock), so the same template and data always produce the same result. Every `each` iteration SHALL consume at least one unit of budget even when its item template renders nothing, so an array of a million items behind a false `when` cannot spin for free.

#### Scenario: A runaway each is stopped at the budget
- **WHEN** a template whose `each` iterates 1 000 000 items is compiled with `maxNodes: 1000` and rendered
- **THEN** the render SHALL complete promptly, contain at most the budgeted nodes, and be marked truncated

#### Scenario: Ordinary renders are unaffected and unmarked
- **WHEN** a template producing far fewer nodes than the budget is rendered
- **THEN** the output SHALL be identical to the unbounded result and SHALL NOT be marked truncated

#### Scenario: The bound is deterministic
- **WHEN** the same over-budget template and data are rendered twice
- **THEN** both renders SHALL produce byte-identical output

#### Scenario: Empty iterations still cost
- **WHEN** `{ each: "rows", template: { when: "never", template: "x" } }` renders 1 000 000 rows with `maxNodes: 1000`
- **THEN** the render SHALL stop at the budget and be marked truncated

### Requirement: Action bindings on element nodes
An element node MAY carry an `action` binding beside `tag`, `attrs` and `children`: `{ ref: "<shared action name>" } | { definition: <inline action definition> }` extended with optional `input` (a record of input-field → template path or `{ const }`) and `output` (`{ mode?, path?, map? }`) as the widget-actions capability defines. When such an element renders, the compiled renderer SHALL emit a `data-wg-action` attribute whose value is a JSON descriptor `{ id, kind, args?, text?, widget? }` — `id` the element's dotted template path, `kind` the action kind, `args` the input mapping resolved in the element's scope, `text` the resolved prompt text, `widget` the kind the template is registered as (so a descriptor rendered inside another widget still names its own kind) — and SHALL emit nothing else for the binding: no handler, no script, no URL. A widget's `load` binding is not a node concern and SHALL be declared beside the template, not inside it. Elements without `action` render exactly as before.

#### Scenario: A bound button carries its descriptor
- **WHEN** `{ tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] }` renders `{ city: "Oslo" }`
- **THEN** the output element SHALL be `button` with text `Refresh` and a `data-wg-action` attribute parsing to `{ id: "", kind: "http", args: { city: "Oslo" } }` (an empty path for the root element)
- **AND** the element SHALL have no `on*` attribute and no `href`

#### Scenario: Descriptors are inert in serialized HTML
- **WHEN** the same render is serialized with `renderToHtml`
- **THEN** the attribute SHALL be present, escaped, and parseable, and the tree/html equivalence of the render SHALL hold

### Requirement: Text presentation formats
The `format` vocabulary SHALL include four text formats beside `number`, `currency` and `date`. Like them, a text format presents a bound value at render time while the payload keeps the typed value, works on a text bind and an attribute value alike, takes every literal from the author, renders a value it cannot read as that value's plain text, and never throws.
- `{ type: "count", locale? }` SHALL render an array's length as a grouped integer in the locale (default `en-US`). Any other value SHALL render as its plain text.
- `{ type: "join", separator?, last?, field? }` SHALL render an array's items as one string. Each item SHALL be read as its plain text, or as the plain text at `field` when `field` is given and the item is an object. `field` is a plain dotted path, read in the item's own scope. Items that are `null`, absent or read empty SHALL be skipped. The items SHALL be separated by `separator` (default `", "`), and the last two by `last` when it is given. A value that is not an array SHALL render as its plain text. `separator` and `last` SHALL be strings of at most 16 characters.
- `{ type: "truncate", length, ellipsis? }` SHALL read the value as its plain text. A text longer than `length` code points SHALL be cut to its first `length` code points, with trailing whitespace removed, and end with `ellipsis` (default `…`); a shorter text SHALL render unchanged. A surrogate pair SHALL never be split. `length` SHALL be an integer from 1 to 1 000, and `ellipsis` a string of at most 8 characters.
- `{ type: "pluralize", forms, locale? }` SHALL read a number, a numeric string, or an array as its length, and render the author's form for it.
  - `forms` maps plural categories (`zero`, `one`, `two`, `few`, `many`, `other`) to strings of at most 80 characters, and `other` is required.
  - A `zero` form, when given, SHALL be chosen for exactly 0 in every locale. Otherwise the locale's plural rules (default `en-US`) SHALL choose the category, and `other` SHALL serve a category without a form.
  - Every `{count}` in the chosen form SHALL be replaced by the number, grouped in the locale.
  - A value that is none of those SHALL render as its plain text.

Numbers SHALL be grouped with ordinary spaces wherever a locale emits no-break variants, as for the number format, so every engine renders them alike. The bounds and the plural categories SHALL be exported constants that the validator, the designer and the guides read.

#### Scenario: Count renders an array's length
- **WHEN** `{ bind: "items", format: { type: "count" } }` renders an `items` array of 1 234 entries, then `{ items: "n/a" }`
- **THEN** the output SHALL be `1,234`, then `n/a`

#### Scenario: Join builds a sentence from author separators
- **WHEN** `{ bind: "tags", format: { type: "join", separator: ", ", last: " and " } }` renders `{ tags: ["red", "", null, "green", "blue"] }`
- **THEN** the output SHALL be `red, green and blue`
- **AND WHEN** `{ bind: "people", format: { type: "join", field: "name" } }` renders `{ people: [{ name: "Ada" }, { name: "Lin" }] }`
- **THEN** the output SHALL be `Ada, Lin`

#### Scenario: Truncate cuts by code point and ends with the ellipsis
- **WHEN** `{ bind: "title", format: { type: "truncate", length: 10 } }` renders `{ title: "Quarterly revenue summary" }`, then `{ title: "Short" }`
- **THEN** the output SHALL be `Quarterly…`, then `Short`
- **AND WHEN** `{ type: "truncate", length: 2, ellipsis: "..." }` renders `"👍👍👍"`
- **THEN** the output SHALL be `👍👍...`

#### Scenario: Pluralize chooses the author's form
- **WHEN** `{ bind: "n", format: { type: "pluralize", forms: { zero: "No items", one: "{count} item", other: "{count} items" } } }` renders `n` as `0`, `1`, `1200`, the string `"2"`, a three-item array, and `"lots"`
- **THEN** the outputs SHALL be `No items`, `1 item`, `1,200 items`, `2 items`, `3 items` and `lots`

#### Scenario: Pluralize follows the locale's rules
- **WHEN** `{ type: "pluralize", locale: "pl", forms: { one: "{count} plik", few: "{count} pliki", many: "{count} plików", other: "{count} pliku" } }` renders 1, 3, 5 and 22
- **THEN** the outputs SHALL be `1 plik`, `3 pliki`, `5 plików` and `22 pliki`

### Requirement: Markdown text binds
A text bind carrying `markdown: true` SHALL read the bound value as its plain text and parse it as a small, fixed Markdown subset into render-tree nodes inside one `div` with class `wg-md`. The parser SHALL be the package's own, and it SHALL run identically wherever templates render. Line endings SHALL be normalized to `\n`.
- **Blocks.** Blank lines SHALL separate blocks.
  - A run of lines starting with `-`, `*` or `+` followed by a space SHALL form a `ul`, and a run starting with digits and `.` or `)` followed by a space an `ol`, one `li` per item. An `ol` whose first number is not 1 SHALL carry that number as `start`.
  - A non-blank line following an item SHALL continue that item.
  - Every other block SHALL be a `p`.
  - Within a paragraph or an item, lines SHALL be trimmed and separated by `br`. Lists SHALL be flat: an indented item SHALL be an item of the same list.
- **Inline.**
  - A backtick-delimited span SHALL be a `code` whose content is literal text.
  - A backslash before a Markdown punctuation character SHALL emit that character literally.
  - `**x**` and `__x__` SHALL be `strong`, and `*x*` and `_x_` SHALL be `em`, nesting within each other and within link text. An underscore inside a word SHALL be literal, so `snake_case` stays text.
  - `[text](url)` SHALL be an `a` with `href` and `rel="noopener noreferrer"` when the URL passes the template URL guard (`http`, `https`, `mailto`, `tel` or a relative reference); otherwise it SHALL render as its text alone.
  - A delimiter without its partner SHALL be literal text.
- **Everything else is text.** Headings, code fences, block quotes, images, tables, autolinks and raw HTML SHALL render as literal text, every character of the value preserved.
- **Bounds.**
  - An empty or whitespace-only value SHALL render nothing.
  - A value longer than 20 000 characters SHALL render, without parsing, as one `p` holding the whole text inside the `div.wg-md`.
  - Every element and text node of the output, the wrapper included, SHALL consume one unit of the render's node budget. When the budget runs out, interpretation SHALL stop and the render SHALL be marked truncated as for any other node.

The base stylesheet SHALL style `.wg-md` paragraphs, lists, code and links from the theme tokens, so Markdown output follows the theme. Widget and theme styles MAY restyle it through selectors naming `.wg-md`.

#### Scenario: The subset renders as elements
- **WHEN** `{ bind: "notes", markdown: true }` renders ``{ notes: "Intro with **bold**, *em* and `code`.\n\n- one\n- two\n\n3. third\n4. fourth\n\nSee [docs](https://example.com/docs)." }``
- **THEN** the output SHALL be one `div.wg-md` holding, in order:
  - a `p` with a `strong` reading `bold`, an `em` reading `em` and a `code` reading `code`;
  - a `ul` of two `li`;
  - an `ol` with `start="3"` of two `li`;
  - a `p` ending in an `a` whose `href` is `https://example.com/docs`, with `rel="noopener noreferrer"`, reading `docs`.

#### Scenario: Lines break and identifiers stay text
- **WHEN** a Markdown bind renders ``"Line one\nsnake_case_name and `**literal**`\n\\*not em\\*"``
- **THEN** the output SHALL be one `p` holding `Line one`, a `br`, the text `snake_case_name and `, a `code` reading `**literal**`, a `br`, and the text `*not em*`, with no `em` or `strong`

#### Scenario: Images and code fences stay literal
- **WHEN** a Markdown bind renders ``"![logo](https://example.com/logo.png)\n\n```js\nconst a = 1;\n```"``
- **THEN** the output SHALL hold no `img`, `a` or `code` element, and its text SHALL read `![logo](https://example.com/logo.png)`, then `` ```js ``, `const a = 1;` and `` ``` `` on separate lines

#### Scenario: Empty and oversized values
- **WHEN** a Markdown bind renders `"   "`, then a 20 001-character value containing `**bold**`
- **THEN** the first SHALL render nothing, and the second SHALL render one `div.wg-md` holding one `p` whose text is the whole value, with no `strong`

#### Scenario: Markdown output spends the node budget
- **WHEN** a Markdown bind renders 4 000 list items (under the source bound) with `maxNodes: 1000`
- **THEN** the render SHALL stop at the budget and be marked truncated

#### Scenario: Markdown follows the theme
- **WHEN** a Markdown bind with a link renders in a document carrying the base stylesheet and a theme setting `accent`
- **THEN** the link's computed color SHALL be the theme's `accent`
