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
A `TemplateNode` SHALL be one of: a string literal (rendered as text); `{ bind: <path> }` (resolved value rendered as text); `{ tag, attrs?, children? }` where attr values are strings, `{ bind: <path> }`, or one attr-level transform of the bind — `{ bind, map: Record<string, string>, default?: string }` (the resolved value, as a string, SELECTS a key: a hit emits that key's author-written literal, a miss emits `default` or empty text; data never contributes output characters, it only chooses among authored options) or `{ bind, prefix: string }` (emitted as the author-literal prefix concatenated with the resolved value when that value is a non-empty string, and as empty text otherwise — an absent email yields no dead `mailto:` href). `map` and `prefix` SHALL be mutually exclusive on one attr value; `{ each: <path>, template, empty? }` (template rendered once per array element with the element as scope); `{ when: <path>, template, else? }` (template rendered when the path resolves truthy, else the `else` template or nothing). Directives SHALL NOT appear in the output tree.

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
`validateTemplate(input)` SHALL return `{ ok: true, template } | { ok: false, error: TemplateError }` where `TemplateError` has `code` (`"INVALID_TEMPLATE_NODE" | "INVALID_PATH" | "FORBIDDEN_ATTRIBUTE" | "TEMPLATE_TOO_DEEP" | "INVALID_ACTION" | "CONFLICTING_ATTRIBUTES"`), `message`, and a dotted `path` locating the offending node within the template. Validation SHALL reject non-node shapes, non-string paths, attr values outside the documented forms (string, `{ bind }`, `{ bind, map, default? }`, `{ bind, prefix }`), and nesting deeper than 64 levels. For the transforms it SHALL reject, with dotted paths: a `map` that is not a plain object of string values, a non-string `default` or `prefix`, `map` or `prefix` without `bind`, and `map` and `prefix` together on one value. For action bindings it SHALL reject with `INVALID_ACTION`: a binding that is neither a `{ ref }` nor a valid inline definition, an `input` mapping to a non-string non-`{ const }` value or to a field the input schema does not declare, an `output.mode` outside `replace|merge|patch`, `mode: "patch"` without `path`, and a `prompt` whose text segments are not literals or `{ bind }`; and with `CONFLICTING_ATTRIBUTES` an element carrying both `action` and `href`.

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

### Requirement: Untrusted-author safety
Event-handler attribute names (matching `on*`, case-insensitive) SHALL fail validation with `FORBIDDEN_ATTRIBUTE` and SHALL be skipped by the interpreter even when validation was bypassed. Attribute names starting with `data-wg-` are reserved for the renderer and SHALL likewise fail validation with `FORBIDDEN_ATTRIBUTE` and be skipped at render time — an author cannot hand-write an action descriptor; only a validated `action` binding produces one. URL-bearing attributes (`href`, `src`, `action`, `formaction`, `xlink:href`) whose resolved value carries a scheme other than `http`, `https`, `mailto`, `tel`, or a relative reference SHALL be dropped at render time — with one image-context exception: the `src` attribute of an `img` element SHALL additionally accept base64-form `data:image/*;base64,` URIs, exactly as the shared `isSafeImageSrc` guard defines them. `data:` remains dropped for every other URL-bearing attribute. Bindings SHALL only ever produce text and attribute strings — never markup. The transforms keep that posture: a `map` emits only author-written literals (data selects, it cannot append), and a `prefix`-composed value runs the same URL guard as any bound value, so a hostile bound value cannot smuggle a scheme past an innocent prefix. Action bindings keep it too: a prompt's text is plain text assembled from literals and bound values (never markup, capped at 2 000 characters), an inline http definition's URL is author-written and fixed (bindings cannot reach it), and the descriptor an element carries is data the trusted bridge validates before acting — the template never gains a way to run code.

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

### Requirement: Bounded interpretation
Interpretation SHALL be bounded by a node budget (`options.maxNodes`, default `DEFAULT_MAX_NODES` = 50 000). Template size alone bounds nothing, because `each` multiplies template nodes by agent-supplied data length; a stored template driven by a large payload must not be able to spend the process. When the budget is exhausted, interpretation SHALL stop, return the nodes built so far, and mark the render as truncated so the outcome is visible rather than silent. The bound SHALL be deterministic (node count, not wall-clock), so the same template and data always produce the same result.

#### Scenario: A runaway each is stopped at the budget
- **WHEN** a template whose `each` iterates 1 000 000 items is compiled with `maxNodes: 1000` and rendered
- **THEN** the render SHALL complete promptly, contain at most the budgeted nodes, and be marked truncated

#### Scenario: Ordinary renders are unaffected and unmarked
- **WHEN** a template producing far fewer nodes than the budget is rendered
- **THEN** the output SHALL be identical to the unbounded result and SHALL NOT be marked truncated

#### Scenario: The bound is deterministic
- **WHEN** the same over-budget template and data are rendered twice
- **THEN** both renders SHALL produce byte-identical output

### Requirement: Action bindings on element nodes
An element node MAY carry an `action` binding beside `tag`, `attrs` and `children`: `{ ref: "<shared action name>" } | { definition: <inline action definition> }` extended with optional `input` (a record of input-field → template path or `{ const }`) and `output` (`{ mode?, path?, map? }`) as the widget-actions capability defines. When such an element renders, the compiled renderer SHALL emit a `data-wg-action` attribute whose value is a JSON descriptor `{ id, kind, args?, text?, widget? }` — `id` the element's dotted template path, `kind` the action kind, `args` the input mapping resolved in the element's scope, `text` the resolved prompt text, `widget` the kind the template is registered as (so a descriptor rendered inside another widget still names its own kind) — and SHALL emit nothing else for the binding: no handler, no script, no URL. A widget's `load` binding is not a node concern and SHALL be declared beside the template, not inside it. Elements without `action` render exactly as before.

#### Scenario: A bound button carries its descriptor
- **WHEN** `{ tag: "button", action: { ref: "refresh", input: { city: "city" } }, children: ["Refresh"] }` renders `{ city: "Oslo" }`
- **THEN** the output element SHALL be `button` with text `Refresh` and a `data-wg-action` attribute parsing to `{ id: "", kind: "http", args: { city: "Oslo" } }` (an empty path for the root element)
- **AND** the element SHALL have no `on*` attribute and no `href`

#### Scenario: Descriptors are inert in serialized HTML
- **WHEN** the same render is serialized with `renderToHtml`
- **THEN** the attribute SHALL be present, escaped, and parseable, and the tree/html equivalence of the render SHALL hold
