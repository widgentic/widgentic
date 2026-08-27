# template-widgets — actions-hardening delta

## MODIFIED Requirements

### Requirement: Untrusted-author safety
Event-handler attribute names (matching `on*`, case-insensitive) SHALL fail validation with `FORBIDDEN_ATTRIBUTE` and SHALL be skipped by the interpreter even when validation was bypassed. Attribute names starting with `data-wg-` are reserved for the renderer and SHALL likewise fail validation with `FORBIDDEN_ATTRIBUTE` and be skipped at render time — an author cannot hand-write an action descriptor; only a validated `action` binding produces one. URL-bearing attributes (`href`, `src`, `action`, `formaction`, `xlink:href`) whose resolved value carries a scheme other than `http`, `https`, `mailto`, `tel`, or a relative reference SHALL be dropped at render time — with one image-context exception: the `src` attribute of an `img` element SHALL additionally accept base64-form `data:image/*;base64,` URIs, exactly as the shared `isSafeImageSrc` guard defines them. `data:` remains dropped for every other URL-bearing attribute. Bindings SHALL only ever produce text and attribute strings — never markup. The transforms keep that posture: a `map` emits only author-written literals (data selects, it cannot append), and a `prefix`-composed value runs the same URL guard as any bound value, so a hostile bound value cannot smuggle a scheme past an innocent prefix. Action bindings keep it too: a prompt's text is plain text assembled from literals and bound values (never markup, capped at 2 000 characters), an inline http definition's URL is author-written and fixed (bindings cannot reach it), and the descriptor an element carries is data the trusted bridge validates before acting — the template never gains a way to run code. Element tags SHALL face a policy too: `script`, `iframe`, `frame`, `frameset`, `object`, `embed`, `style`, `link`, `meta`, `base`, `template` and `noscript` SHALL fail validation with `FORBIDDEN_TAG` and SHALL render as nothing when validation was bypassed; the `srcdoc` attribute SHALL be treated like an event handler (`FORBIDDEN_ATTRIBUTE`, skipped), and `data`, `poster` and `ping` SHALL join the URL-bearing attributes that face the scheme guard. A template can therefore never introduce active content into the frame.

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

### Requirement: Template validation
`validateTemplate(input)` SHALL return `{ ok: true, template } | { ok: false, error: TemplateError }` where `TemplateError` has `code` (`"INVALID_TEMPLATE_NODE" | "INVALID_PATH" | "FORBIDDEN_ATTRIBUTE" | "FORBIDDEN_TAG" | "TEMPLATE_TOO_DEEP" | "INVALID_ACTION" | "CONFLICTING_ATTRIBUTES"`), `message`, and a dotted `path` locating the offending node within the template. Validation SHALL reject non-node shapes, non-string paths, attr values outside the documented forms (string, `{ bind }`, `{ bind, map, default? }`, `{ bind, prefix }`), and nesting deeper than 64 levels. For the transforms it SHALL reject, with dotted paths: a `map` that is not a plain object of string values, a non-string `default` or `prefix`, `map` or `prefix` without `bind`, and `map` and `prefix` together on one value. For action bindings it SHALL reject with `INVALID_ACTION`: a binding that is neither a `{ ref }` nor a valid inline definition, an `input` mapping to a non-string non-`{ const }` value or to a field the input schema does not declare, an `output.mode` outside `replace|merge|patch`, `mode: "patch"` without `path`, and a `prompt` whose text segments are not literals or `{ bind }`; and with `CONFLICTING_ATTRIBUTES` an element carrying both `action` and `href`. Prompt definitions' `{ bind }` segments SHALL face the same path-syntax check as input mappings (`INVALID_ACTION` at the segment's path), so a malformed bind cannot render silently as empty text.

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
