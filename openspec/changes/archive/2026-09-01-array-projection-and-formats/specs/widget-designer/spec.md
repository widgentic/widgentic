## ADDED Requirements

### Requirement: Schema-driven path completion descends arrays
The designer's path completions — the bind/each/when dropdowns in the template tree, attribute binds, action input mappings, and both output-map columns — SHALL derive candidate paths from the effective data schema by descending OBJECT properties; an ARRAY is offered as ITSELF and never descended by the enumerator, because neither the template resolver nor the projection steps into an array by name. Each consumer whose scope IS the item asks for the item schema: the scope inside `{ each: <path> }` SHALL be the item schema of the array that path resolves to — `each: "."` over a root-array schema included — so binds inside the each complete from the item's properties; the output-map editor SHALL complete an array side (widget data or action response) from that side's item schema, the per-item projection's vocabulary; and an array SCOPE itself (the template root over a root-array schema) SHALL offer only `"."` — nothing else resolves there, so no item property is advertised where it would render empty. The free-text fallback SHALL appear only when the draft has NO effective schema; a root-array schema is a schema, not the fallback case. Off-schema values stay selectable and marked as today.

#### Scenario: A root-array schema completes inside each "."
- **WHEN** a widget's data schema is `{ type: "array", items: { type: "object", properties: { ask, bid, book, date } } }` and the template contains `{ each: "." }` with a bind inside it
- **THEN** the each dropdown SHALL offer `"."` and the bind dropdown inside the each SHALL offer `ask`, `bid`, `book` and `date`
- **AND** a bind at the template ROOT (outside the each) SHALL offer `"."` only — not `ask`

#### Scenario: Nested array items are reachable through their each
- **WHEN** an object schema carries `lines: { type: "array", items: { properties: { qty } } }` and the template nests a bind inside `{ each: "lines" }`
- **THEN** the bind SHALL complete with `qty`, and outside the each `lines` SHALL be offered for `each`, not for `bind`

#### Scenario: No schema still falls back to free text
- **WHEN** a draft declares neither `dataSchema` nor `dataSchemaRef`
- **THEN** path inputs SHALL be free-text, exactly as before

### Requirement: Bind rows offer the transforms their position allows
A bind-mode ATTRIBUTE row SHALL offer all three value transforms — a literal `prefix`, a value→literal
`map` with its `default`, and a presentation `format` — and SHALL hide the other two once one is set,
mirroring the validator's mutual exclusion. A TEXT bind row SHALL offer `format` and `map` (with its `default`), hiding one once the
other is set; it SHALL NOT offer `prefix`, an attribute-value transform the renderer ignores in a text position. No transform SHALL be
restricted by attribute name or element tag; attribute-level safety belongs to validation and rendering,
not to hiding editors. Every control a row offers SHALL be REACHABLE: a hover- or focus-revealed control SHALL be revealed by
ONE rule that names every row type hosting it (so a new row type cannot ship present-but-invisible
controls), and a row SHALL wrap rather than clip its trailing controls, so an added control can never
push another out of reach.

#### Scenario: A text bind row offers format and map, never prefix
- **WHEN** a `{ bind }` child node's row is inspected
- **THEN** it SHALL carry a format control and a `map` control and SHALL NOT carry a `prefix` input
- **AND WHEN** `map` is set
- **THEN** the format control SHALL disappear and the map block (value → label rows plus a default) SHALL appear under the node

#### Scenario: A bound attribute row offers all three, each reachable
- **WHEN** a bind-mode attribute row is inspected
- **THEN** it SHALL carry a `prefix` input, a `map` control and a format control
- **AND** the `map` control SHALL become visible when its row is hovered or focused, and SHALL sit within the row's own width

#### Scenario: One transform at a time
- **WHEN** a `map`, a `prefix` or a `format` is set on an attribute row
- **THEN** the other two controls SHALL disappear from that row

#### Scenario: No per-attribute or per-element restriction
- **WHEN** bind-mode rows are inspected across different attribute names and element tags
- **THEN** each SHALL offer the same three transforms

## MODIFIED Requirements

### Requirement: Action binding in the widget designer
The widget designer SHALL let the person bind a `button` or `a` element to an action — the add menu SHALL offer `action` on those elements only, while an existing binding on any element stays editable — (none, a shared action chosen from `options.actions`, or an inline definition edited in place), edit the binding's input mapping (one row per input-schema field, each a template path or a constant, with `$root`, `$parent` and `$index` completions inside `each`), choose the output mode with its `path`/`map` — the `map` editor SHALL offer target paths from the widget's effective data schema (relative to the `patch` path when that mode is chosen), source paths from the action's output schema, and SHALL flag a source/target type mismatch in place; when either schema is an ARRAY the editor SHALL offer that side's ITEM properties (the per-item projection's vocabulary), a `"."` row's source SHALL complete from the response root while the other rows complete from the SELECTED value's item schema, and the mismatch check SHALL compare the item types of two array sides rather than passing every array-to-array pair — and declare the widget-level `load` binding for http GET actions. Path completions throughout the template panel SHALL resolve a shared `dataSchemaRef` exactly as an inline `dataSchema`. The draft SHALL serialize bindings in the template's `action` form and the widget's `load` field; validation errors (`INVALID_ACTION`, `CONFLICTING_ATTRIBUTES`) SHALL surface in place at the offending node. The live preview SHALL render bound elements with an inert `wg-designer-action` badge and never execute anything. Editors SHALL read the live binding on every commit (a URL typed before a method change survives; two mapping fields set in sequence both persist); new header/query/projection rows SHALL stay editor-local until they have a name (never committing `""` keys); path helpers SHALL be offered as complete paths (`$index`, `$root`, `$parent`), never as dangling prefixes; unknown shared-action references SHALL surface at the referencing node, not only in the Load section; and a binding editor SHALL be constructed only for elements that carry a binding.

#### Scenario: Only activatable elements offer an action
- **WHEN** the add menu opens on a `div` node and on a `button` node
- **THEN** `action` SHALL appear only for the `button`, and a `div` that already carries a binding SHALL still show its editor

#### Scenario: A binding round-trips through the draft
- **WHEN** a person binds a button to a shared action with an input mapping and an output mode and reloads the exported widget
- **THEN** the binding SHALL reappear in the editor exactly as authored

#### Scenario: A mismatched projection is flagged before it can fail at execution
- **WHEN** an output map targets a `number` data path with a `string` response path
- **THEN** the editor SHALL flag the mismatch at the row

#### Scenario: Shared schemas drive completions too
- **WHEN** a widget references its data schema by `dataSchemaRef`
- **THEN** the template panel's path dropdowns SHALL complete from the resolved shared schema

#### Scenario: Conflicts are shown where they are
- **WHEN** an element carries both `href` and `action`
- **THEN** `CONFLICTING_ATTRIBUTES` SHALL surface at that node in the tree

#### Scenario: Sequential edits all persist
- **WHEN** a person sets an inline action's URL and then changes its method
- **THEN** both values SHALL be present in the draft

#### Scenario: Unnamed rows never reach the draft
- **WHEN** a person adds a header row and commits a value before naming it
- **THEN** the draft SHALL NOT contain a `""` key and the row SHALL stay editable

#### Scenario: Array schemas complete on both sides of the projection
- **WHEN** the widget's data schema and the bound action's output schema are both root arrays of objects
- **THEN** the map editor's target column SHALL offer the widget item's properties and the source column the response item's properties
- **AND** with the default `merge` mode the editor SHALL flag that a per-item projection needs `replace` or `patch`
- **AND** the target column SHALL offer `"."` (the selection row) as an on-schema choice whatever the widget's shape
- **AND** a `string` response item field targeting a `number` widget item field SHALL be flagged

### Requirement: Import and export in the server's shapes
The designer SHALL export the draft as JSON in exactly the `CustomWidget` shape (`{ kind, template, descriptor }`) — its Export section SHALL offer that entry and the copy-as-TypeScript convenience only, labelled `Export widget entry` like the other designers' entry exports; themes export from the theme designer (the bare-token-map exporter stays available to hosts as a function) — and SHALL import the same shape, re-validating everything on load (imports are untrusted input; invalid imports are rejected with the structured errors, leaving the current draft untouched). Import and export SHALL be presented as two independent sections, with import placed before export — in BOTH designers, the widget designer and the standalone theme designer alike. A copy-as-TypeScript convenience SHALL emit a module body compatible with `examples/mcp-server/widgets/` for manual registration. Exported widget JSON loaded back SHALL round-trip to a deep-equal draft.

#### Scenario: Export/import round-trips
- **WHEN** a draft equivalent to the invoice example is exported and re-imported
- **THEN** the resulting draft SHALL deep-equal the original

#### Scenario: Invalid imports never clobber the draft
- **WHEN** an import contains a template failing validation
- **THEN** the current draft SHALL remain and the import errors SHALL be shown

#### Scenario: Import and export are independent sections
- **WHEN** the designer mounts
- **THEN** import and export SHALL each render as their own titled section, with import before export

#### Scenario: The theme designer splits its io sections too
- **WHEN** the standalone theme designer mounts
- **THEN** it SHALL render an Import section before an Export section, not one combined panel

#### Scenario: The widget designer exports the widget entry only
- **WHEN** the widget designer's Export section is inspected
- **THEN** it SHALL offer `Export widget entry` and `Copy as TypeScript`, and no theme export
