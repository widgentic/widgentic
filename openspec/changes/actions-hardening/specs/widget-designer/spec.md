# widget-designer — actions-hardening delta

## MODIFIED Requirements

### Requirement: Action binding in the widget designer
The widget designer SHALL let the person bind a `button` or `a` element to an action — the add menu SHALL offer `action` on those elements only, while an existing binding on any element stays editable — (none, a shared action chosen from `options.actions`, or an inline definition edited in place), edit the binding's input mapping (one row per input-schema field, each a template path or a constant, with `$root`, `$parent` and `$index` completions inside `each`), choose the output mode with its `path`/`map` — the `map` editor SHALL offer target paths from the widget's effective data schema (relative to the `patch` path when that mode is chosen), source paths from the action's output schema, and SHALL flag a source/target type mismatch in place — and declare the widget-level `load` binding for http GET actions. Path completions throughout the template panel SHALL resolve a shared `dataSchemaRef` exactly as an inline `dataSchema`. The draft SHALL serialize bindings in the template's `action` form and the widget's `load` field; validation errors (`INVALID_ACTION`, `CONFLICTING_ATTRIBUTES`) SHALL surface in place at the offending node. The live preview SHALL render bound elements with an inert `wg-designer-action` badge and never execute anything. Editors SHALL read the live binding on every commit (a URL typed before a method change survives; two mapping fields set in sequence both persist); new header/query/projection rows SHALL stay editor-local until they have a name (never committing `""` keys); path helpers SHALL be offered as complete paths (`$index`, `$root`, `$parent`), never as dangling prefixes; unknown shared-action references SHALL surface at the referencing node, not only in the Load section; and a binding editor SHALL be constructed only for elements that carry a binding.

#### Scenario: Only activatable elements offer an action
- **WHEN** the add menu opens on a `button` or an `a` element
- **THEN** it SHALL list `action`
- **AND WHEN** it opens on a `div` or `span`
- **THEN** it SHALL NOT

#### Scenario: A binding round-trips through the draft
- **WHEN** a button node is bound to shared action `refresh` with input `{ city: "location.city" }` and the draft is exported
- **THEN** the template SHALL contain `action: { ref: "refresh", input: { city: "location.city" } }` on that node
- **AND** importing that widget SHALL restore the binding editor's state

#### Scenario: A mismatched projection is flagged before it can fail at execution
- **WHEN** the widget's data schema declares `reading.temperature` as `string` and the output map projects `current.temp_c` (a `number` in the action's output schema) onto it
- **THEN** the binding editor SHALL show a type-mismatch diagnostic naming both paths and types
- **AND** the target and source inputs SHALL offer the widget's and the action's schema paths respectively

#### Scenario: Shared schemas drive completions too
- **WHEN** a draft references a shared schema by `dataSchemaRef`
- **THEN** the template panel's path controls SHALL offer that schema's paths exactly as for an inline schema

#### Scenario: Conflicts are shown where they are
- **WHEN** an anchor with `href` is bound to an action
- **THEN** the node SHALL show `CONFLICTING_ATTRIBUTES` and the draft SHALL be unsaveable until one is removed

#### Scenario: Sequential edits all persist
- **WHEN** the person types a URL, then changes the method, then maps field `a`, then field `b`
- **THEN** the draft SHALL hold the typed URL, the new method and both mappings

#### Scenario: Unnamed rows never reach the draft
- **WHEN** `+ projection` is pressed and nothing is typed
- **THEN** the draft's `output.map` SHALL be unchanged

### Requirement: Standalone action designer
The `./designer` entry SHALL export `createActionDesigner(container: Element, options?)` returning `{ getAction(), loadAction(entry), setReadOnly(readOnly), subscribe(listener), dispose() }` and `defineActionDesignerElement(tagName?)` (default `widgentic-action-designer`), in the same family as the widget, theme and schema designers: zero dependencies, explicit element registration, read-only mode, `widgentic-change` events carrying the serialized `StoredAction`. The editor SHALL cover both kinds — a prompt's text segments (literals and binds) and an http action's method, URL, input and output schemas (edited inline; a shared schema supplied through `options.schemas` can be COPIED in, and the control SHALL say it is a copy — an action's contract never references a shared schema), headers and query with `{ secret }` references chosen from `options.secretNames`. The designer itself SHALL perform no network I/O: the test call SHALL be delegated to an `options.testCall(definition, args)` callback the host supplies, and without that callback the Test control SHALL be absent. Test-call arguments SHALL reset when an entry is loaded or the input schema changes, and `label`/`description` SHALL be validated as strings on load.

#### Scenario: The action designer is independently embeddable
- **WHEN** `createActionDesigner(container)` is called and later `dispose()`
- **THEN** an action editor SHALL mount inside `container` without any widget panels and be fully removed on dispose

#### Scenario: Testing is the host's job
- **WHEN** the designer is created without `options.testCall`
- **THEN** no Test control SHALL render
- **AND WHEN** it is created with one and Test is pressed
- **THEN** the callback SHALL receive the current definition and the form's arguments and its result SHALL be displayed

#### Scenario: Test arguments follow the schema
- **WHEN** the input schema drops a field after a test call
- **THEN** the next test call SHALL NOT carry the dropped field
