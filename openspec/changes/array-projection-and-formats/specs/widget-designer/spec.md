## ADDED Requirements

### Requirement: Schema-driven path completion descends arrays
The designer's path completions — the bind/each/when dropdowns in the template tree, attribute binds, action input mappings, and both output-map columns — SHALL derive candidate paths from the effective data schema by descending OBJECT properties and ARRAY `items` alike, including a root-level array schema: an array path is offered as itself for `each` and `when`, and its item properties become reachable inside the matching `each` scope. The scope inside `{ each: <path> }` SHALL be the item schema of the array that path resolves to — `each: "."` over a root-array schema included — so binds inside the each complete from the item's properties. The free-text fallback SHALL appear only when the draft has NO effective schema; a root-array schema is a schema, not the fallback case. Off-schema values stay selectable and marked as today.

#### Scenario: A root-array schema completes inside each "."
- **WHEN** a widget's data schema is `{ type: "array", items: { type: "object", properties: { ask, bid, book, date } } }` and the template contains `{ each: "." }` with a bind inside it
- **THEN** the each dropdown SHALL offer `"."` and the bind dropdown inside the each SHALL offer `ask`, `bid`, `book` and `date`

#### Scenario: Nested array items are reachable through their each
- **WHEN** an object schema carries `lines: { type: "array", items: { properties: { qty } } }` and the template nests a bind inside `{ each: "lines" }`
- **THEN** the bind SHALL complete with `qty`, and outside the each `lines` SHALL be offered for `each`, not for `bind`

#### Scenario: No schema still falls back to free text
- **WHEN** a draft declares neither `dataSchema` nor `dataSchemaRef`
- **THEN** path inputs SHALL be free-text, exactly as before

## MODIFIED Requirements

### Requirement: Action binding in the widget designer
The widget designer SHALL let the person bind a `button` or `a` element to an action — the add menu SHALL offer `action` on those elements only, while an existing binding on any element stays editable — (none, a shared action chosen from `options.actions`, or an inline definition edited in place), edit the binding's input mapping (one row per input-schema field, each a template path or a constant, with `$root`, `$parent` and `$index` completions inside `each`), choose the output mode with its `path`/`map` — the `map` editor SHALL offer target paths from the widget's effective data schema (relative to the `patch` path when that mode is chosen), source paths from the action's output schema, and SHALL flag a source/target type mismatch in place; when either schema is an ARRAY the editor SHALL offer that side's ITEM properties (the per-item projection's vocabulary), and the mismatch check SHALL compare the item types of two array sides rather than passing every array-to-array pair — and declare the widget-level `load` binding for http GET actions. Path completions throughout the template panel SHALL resolve a shared `dataSchemaRef` exactly as an inline `dataSchema`. The draft SHALL serialize bindings in the template's `action` form and the widget's `load` field; validation errors (`INVALID_ACTION`, `CONFLICTING_ATTRIBUTES`) SHALL surface in place at the offending node. The live preview SHALL render bound elements with an inert `wg-designer-action` badge and never execute anything. Editors SHALL read the live binding on every commit (a URL typed before a method change survives; two mapping fields set in sequence both persist); new header/query/projection rows SHALL stay editor-local until they have a name (never committing `""` keys); path helpers SHALL be offered as complete paths (`$index`, `$root`, `$parent`), never as dangling prefixes; unknown shared-action references SHALL surface at the referencing node, not only in the Load section; and a binding editor SHALL be constructed only for elements that carry a binding.

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
- **AND** a `string` response item field targeting a `number` widget item field SHALL be flagged
