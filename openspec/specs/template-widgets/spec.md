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
A `TemplateNode` SHALL be one of: a string literal (rendered as text); `{ bind: <path> }` (resolved value rendered as text); `{ tag, attrs?, children? }` where attr values are strings or `{ bind: <path> }`; `{ each: <path>, template, empty? }` (template rendered once per array element with the element as scope); `{ when: <path>, template, else? }` (template rendered when the path resolves truthy, else the `else` template or nothing). Directives SHALL NOT appear in the output tree.

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

### Requirement: Path resolution
Paths SHALL be dot-notation resolved against `payload.data`, with these rules: inside `each`, the scope is the current array element; the path `"."` SHALL resolve to the scope value itself; paths starting with `"$meta."` SHALL resolve against `payload.meta`. Missing or non-traversable paths SHALL resolve to empty text for `bind`, an empty sequence for `each`, and falsy for `when`. Interpretation SHALL never throw regardless of `data` shape.

#### Scenario: Dot path traverses nested objects and array indices
- **WHEN** `{ bind: "items.0.name" }` renders data `{ items: [{ name: "first" }] }`
- **THEN** the output text SHALL be `"first"`

#### Scenario: Scope dot inside each
- **WHEN** `{ each: "tags", template: { bind: "." } }` renders data `{ tags: ["a", "b"] }`
- **THEN** the output SHALL contain texts `"a"` and `"b"`

#### Scenario: Meta escape prefix
- **WHEN** `{ bind: "$meta.title" }` renders a payload with `meta: { title: "T" }`
- **THEN** the output text SHALL be `"T"`

#### Scenario: Missing paths are blanks, not errors
- **WHEN** a template binds `"nope.deep"`, repeats over `"absent"`, and conditions on `"missing"` against data `{}`
- **THEN** rendering SHALL succeed with empty text, no repetitions, and the `else` branch respectively

### Requirement: Template validation
`validateTemplate(input)` SHALL return `{ ok: true, template } | { ok: false, error: TemplateError }` where `TemplateError` has `code` (`"INVALID_TEMPLATE_NODE" | "INVALID_PATH" | "FORBIDDEN_ATTRIBUTE" | "TEMPLATE_TOO_DEEP"`), `message`, and a dotted `path` locating the offending node within the template. Validation SHALL reject non-node shapes, non-string paths, attr values that are neither string nor `{ bind }`, and nesting deeper than 64 levels.

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

### Requirement: Untrusted-author safety
Event-handler attribute names (matching `on*`, case-insensitive) SHALL fail validation with `FORBIDDEN_ATTRIBUTE` and SHALL be skipped by the interpreter even when validation was bypassed. URL-bearing attributes (`href`, `src`, `action`, `formaction`, `xlink:href`) whose resolved value carries a scheme other than `http`, `https`, `mailto`, `tel`, or a relative reference SHALL be dropped at render time — with one image-context exception: the `src` attribute of an `img` element SHALL additionally accept base64-form `data:image/*;base64,` URIs, exactly as the shared `isSafeImageSrc` guard defines them. `data:` remains dropped for every other URL-bearing attribute. Bindings SHALL only ever produce text and attribute strings — never markup.

#### Scenario: Event handler rejected and skipped
- **WHEN** `validateTemplate({ tag: "button", attrs: { onclick: "x()" } })` is called
- **THEN** the result SHALL have `error.code: "FORBIDDEN_ATTRIBUTE"`
- **AND WHEN** the same template is compiled and rendered anyway
- **THEN** the output element SHALL have no `onclick` attribute

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
