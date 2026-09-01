## MODIFIED Requirements

### Requirement: Built-in widget kinds
The system SHALL provide built-in widgets: `card`, `table`, `tree`, and `group`. Each built-in widget MUST document the shape of `data` and supported `hints`.

#### Scenario: Card renders an object
- **WHEN** a `card` payload is rendered with `data: { title, subtitle, fields }`
- **THEN** the output SHALL display title, subtitle, and field key/value pairs

#### Scenario: Table renders an array of records
- **WHEN** a `table` payload is rendered with `data: [{ ... }, { ... }]`
- **THEN** the output SHALL display one row per record and one column per detected field

#### Scenario: Tree renders nested nodes
- **WHEN** a `tree` payload is rendered with nested `{ label, children[] }` nodes
- **THEN** the output SHALL display a collapsible tree honoring `hints.expandDepth`

#### Scenario: Group renders several widgets in one call
- **WHEN** a `group` payload is rendered with `data.items` holding sub-widgets of mixed kinds
- **THEN** the output SHALL contain each item's rendering inside one layout container

### Requirement: Catalog programmatic surface
The package SHALL export `createCatalog(): WidgetCatalog` from a `./catalog` entry. A catalog instance SHALL expose `register(kind, renderer)`, `has(kind)`, `resolve(kind)`, `kinds()`, and `render(payload)`. The built-ins (`card`, `table`, `tree`, `group`) SHALL be pre-registered on every new instance.

#### Scenario: New catalog has the built-ins
- **WHEN** `createCatalog().kinds()` is called
- **THEN** the result SHALL contain `"card"`, `"table"`, `"tree"`, and `"group"`, and SHALL NOT contain `"custom"`

#### Scenario: Instances are independent
- **WHEN** a kind is registered on one catalog instance
- **THEN** a separately created instance SHALL NOT have that kind

#### Scenario: kinds returns a fresh array
- **WHEN** the array returned by `kinds()` is mutated by the caller
- **THEN** the catalog's registry SHALL be unaffected

### Requirement: Tree data handling
The `tree` renderer SHALL render nested `{ label, icon?, children[] }` nodes, using a JSON-snippet fallback label for nodes without a usable `label` (the fallback excludes `children` and `icon`), recursing only into array-valued `children`. `meta.title` SHALL render as a title line above the tree; without it no title appears.

A node with at least one child SHALL render as a NATIVE disclosure — a `details` element whose `summary` carries the node's label — so a person can expand and collapse branches in every context the HTML reaches (the Apps iframe, a `page` document, a plain fragment) with no script, and the toggle is keyboard-operable by the platform. Leaves SHALL render as plain labels with no disclosure element, so the presence of the disclosure alone identifies an expandable branch. `hints.expandDepth` (default unlimited) SHALL select the INITIAL state: nodes at depth less than the value carry the `open` attribute, deeper branches do not; a negative value SHALL behave as `0` (everything collapsed), keeping `depth < value` monotone. Nodes deeper than the documented bound (64) SHALL render as leaves, so a hostile nesting cannot overflow the recursive renderer or the serializers — the renderer stays total. Collapsing stays presentational: the full subtree remains in the output and the collapsed children are hidden by the disclosure's native semantics, not removed.

A visitor's toggles SHALL survive in-place re-renders: because the initial state is a pure function of data and hints, a re-render of unchanged data emits the same attributes, and the in-place patchers touch only attributes that changed — so an expansion or collapse the visitor made is not reset by an action's re-render of the same branches.

A node's optional `icon` SHALL render before its label: a string that passes the same image-safety gate card and table use (`isSafeImageSrc` plus the image-source detection rule) renders as an image element with classes `wg-img wg-img-icon`, an empty `alt` (the icon is decorative; the label carries the meaning), `loading="lazy"` and `decoding="async"`, participating in server-side image inlining exactly as card and table images do; any other string renders as a text span (an emoji, a glyph) with a stable class; a value failing the safety gate renders as text, never as an image.

#### Scenario: Nested nodes render recursively
- **WHEN** `tree` renders `{ label: "root", children: [{ label: "leaf", children: [] }] }`
- **THEN** the output SHALL contain `"root"` with a nested node containing `"leaf"`

#### Scenario: expandDepth limits expanded state
- **WHEN** the same data renders with `hints: { expandDepth: 1 }`
- **THEN** the root branch SHALL carry the `open` attribute and a depth-1 branch SHALL NOT

#### Scenario: Leaves carry no expansion attribute
- **WHEN** `tree` renders a three-level hierarchy with `hints: { expandDepth: 1 }`
- **THEN** only the nodes with children SHALL render a disclosure element
- **AND** the collapsed branch's children SHALL still be present in the output

#### Scenario: Meta supplies the tree title
- **WHEN** `tree` renders any hierarchy with `meta: { title: "Regions" }`
- **THEN** the output SHALL contain a title line `"Regions"` above the root nodes

#### Scenario: A branch toggles without script
- **WHEN** the rendered HTML of a collapsed branch is opened in a browsing context with no JavaScript
- **THEN** activating the branch's summary SHALL reveal its children, and activating it again SHALL hide them

#### Scenario: A visitor's expansion survives an action re-render
- **WHEN** a visitor expands a branch the server emitted collapsed, and an action then re-renders the widget with that branch unchanged
- **THEN** the in-place patch SHALL leave the branch expanded

#### Scenario: A safe image icon renders through the shared gate
- **WHEN** a node carries `icon: "https://cdn.example/folder.png"`
- **THEN** the output SHALL contain an `img` with classes `wg-img wg-img-icon`, that URL as `src`, an empty `alt`, `loading="lazy"` and `decoding="async"`, before the node's label

#### Scenario: An emoji icon renders as text
- **WHEN** a node carries `icon: "📁"`
- **THEN** the output SHALL contain the emoji in a stable-classed span before the label, and no image element

#### Scenario: An unsafe icon source never renders as an image
- **WHEN** a node carries `icon: "javascript:alert(1)"` or an `http(s)` URL that fails the safety gate
- **THEN** the value SHALL render as text, never as an `img`

#### Scenario: Icon stays out of the fallback label
- **WHEN** a node has no `label` but carries `icon` and other fields
- **THEN** the JSON-snippet fallback SHALL exclude `icon` (and `children`) from the snippet
- **AND WHEN** `icon` and `children` are the node's ONLY properties
- **THEN** the fallback SHALL still exclude them rather than printing the whole node

#### Scenario: Hostile depth renders as leaves, not a crash
- **WHEN** a payload nests children beyond the documented depth bound
- **THEN** nodes past the bound SHALL render as plain leaves and the render SHALL complete

#### Scenario: A negative expandDepth collapses everything
- **WHEN** a tree renders with `hints: { expandDepth: -1 }`
- **THEN** no branch SHALL carry the `open` attribute

## REMOVED Requirements

### Requirement: Custom escape hatch rendering
**Reason**: The `custom` kind pretty-printed `data` as JSON in a `<pre>` — not styleable, no scenario a host or agent needs (agents present JSON and text natively, and the mapper's fallback is `card`), and a name that collides with the product's real custom widgets (template widgets built in the designer).
**Migration**: Render structured data through `card`, `table`, `tree` or `group`, or let the agent present it as text. A payload naming `custom` after removal receives the standard `UNKNOWN_KIND` error listing the available kinds. The freed name may be claimed by a user's template widget; reserved kinds derive from the catalog, so nothing else changes.
