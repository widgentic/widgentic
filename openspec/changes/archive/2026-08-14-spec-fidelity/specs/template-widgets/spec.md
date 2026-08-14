# template-widgets — truncation carve-out; precise data-URI prose

## MODIFIED Requirements

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
