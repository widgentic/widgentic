# widget-designer — widget-actions delta

## ADDED Requirements

### Requirement: Standalone action designer
The `./designer` entry SHALL export `createActionDesigner(container: Element, options?)` returning `{ getAction(), loadAction(entry), setReadOnly(readOnly), subscribe(listener), dispose() }` and `defineActionDesignerElement(tagName?)` (default `widgentic-action-designer`), in the same family as the widget, theme and schema designers: zero dependencies, explicit element registration, read-only mode, `widgentic-change` events carrying the serialized `StoredAction`. The editor SHALL cover both kinds — a prompt's text segments (literals and binds) and an http action's method, URL, input and output schemas (edited inline; a shared schema supplied through `options.schemas` can be COPIED in, and the control SHALL say it is a copy — an action's contract never references a shared schema), headers and query with `{ secret }` references chosen from `options.secretNames`. The designer itself SHALL perform no network I/O: the test call SHALL be delegated to an `options.testCall(definition, args)` callback the host supplies, and without that callback the Test control SHALL be absent.

#### Scenario: The action designer is independently embeddable
- **WHEN** `createActionDesigner(container)` is called and later `dispose()`
- **THEN** an action editor SHALL mount inside `container` without any widget panels and be fully removed on dispose

#### Scenario: Testing is the host's job
- **WHEN** the designer is created without `options.testCall`
- **THEN** no Test control SHALL render
- **AND WHEN** it is created with one and Test is pressed
- **THEN** the callback SHALL receive the current definition and the form's arguments and its result SHALL be displayed

### Requirement: Action binding in the widget designer
The widget designer SHALL let the person bind a `button` or `a` element to an action — the add menu SHALL offer `action` on those elements only, while an existing binding on any element stays editable — (none, a shared action chosen from `options.actions`, or an inline definition edited in place), edit the binding's input mapping (one row per input-schema field, each a template path or a constant, with `$root`, `$parent` and `$index` completions inside `each`), choose the output mode with its `path`/`map` — the `map` editor SHALL offer target paths from the widget's effective data schema (relative to the `patch` path when that mode is chosen), source paths from the action's output schema, and SHALL flag a source/target type mismatch in place — and declare the widget-level `load` binding for http GET actions. Path completions throughout the template panel SHALL resolve a shared `dataSchemaRef` exactly as an inline `dataSchema`. The draft SHALL serialize bindings in the template's `action` form and the widget's `load` field; validation errors (`INVALID_ACTION`, `CONFLICTING_ATTRIBUTES`) SHALL surface in place at the offending node. The live preview SHALL render bound elements with an inert `wg-designer-action` badge and never execute anything.

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

## MODIFIED Requirements

### Requirement: Designer programmatic surface
The package SHALL export from a `./designer` entry: `createDesigner(container: Element, options?)` returning a handle `{ getDraft(), loadWidget(definition), loadTheme(theme), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createThemeDesigner(container: Element, options?)` returning `{ getTheme(), loadTheme(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createSchemaDesigner(container: Element, options?)` returning `{ getSchema(), loadSchema(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createActionDesigner(container: Element, options?)` returning `{ getAction(), loadAction(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, and the opt-in element registrars `defineDesignerElement(tagName?)` (default `widgentic-designer`), `defineThemeDesignerElement(tagName?)` (default `widgentic-theme-designer`), `defineSchemaDesignerElement(tagName?)` (default `widgentic-schema-designer`) and `defineActionDesignerElement(tagName?)` (default `widgentic-action-designer`), each wrapping its factory and emitting `widgentic-change` CustomEvents whose `detail` carries the serialized draft, theme entry, schema entry, or action entry. All four factories SHALL accept `readOnly` in options and every handle SHALL expose `setReadOnly(readOnly)`: in read-only mode every editing surface is inert — visible but inoperable and visibly de-emphasized — while the preview stays live along with the widget designer's preview-theme selector, the theme designer's preview-kind selector, and the Export controls (export copies out what is already on screen; read-only restricts editing, not looking). `createDesigner` SHALL additionally accept `options.actions` (the shared actions offered for binding) and `options.secretNames`. Custom-element registration SHALL only happen through the explicit calls — importing the module SHALL have no registry side effects. The entry SHALL import other capabilities only through their public package entries, and SHALL perform no network I/O.

#### Scenario: Factory mounts and disposes cleanly
- **WHEN** `createDesigner(container)` is called and later `dispose()`
- **THEN** the designer UI SHALL render inside `container` and be fully removed on dispose

#### Scenario: Multiple instances coexist
- **WHEN** two designers are created in one document
- **THEN** edits in one SHALL NOT affect the other's draft or preview

#### Scenario: Element registration is explicit
- **WHEN** the module is imported without calling `defineDesignerElement`
- **THEN** `customElements.get("widgentic-designer")` SHALL be undefined
- **AND WHEN** `defineDesignerElement()` is called and an element is attached
- **THEN** edits SHALL dispatch `widgentic-change` events with the serialized draft

#### Scenario: The theme designer is independently embeddable
- **WHEN** `createThemeDesigner(container)` is called
- **THEN** a theme editor SHALL mount without any widget-authoring panels
- **AND** `defineThemeDesignerElement()` SHALL register `widgentic-theme-designer` on the explicit call only

#### Scenario: Read-only mode disables editing but keeps the preview live
- **WHEN** a designer is created with `readOnly: true` or `setReadOnly(true)` is called
- **THEN** its editing surfaces SHALL be inert while the preview keeps rendering
- **AND** the widget designer's preview-theme selector (and the theme designer's preview-kind selector) SHALL remain operable, updating the preview
- **AND** `setReadOnly(false)` SHALL restore editing

#### Scenario: Read-only leaves export operable
- **WHEN** a designer is mounted read-only
- **THEN** its Export controls SHALL remain clickable and produce the current definition

#### Scenario: The schema designer is independently embeddable
- **WHEN** `createSchemaDesigner(container)` is called
- **THEN** a schema editor SHALL mount without any widget-authoring or theme panels
- **AND** `defineSchemaDesignerElement()` SHALL register `widgentic-schema-designer` on the explicit call only
- **AND** mounted read-only, its editing surfaces SHALL be inert while the schema stays visible

#### Scenario: The action designer registers on the explicit call only
- **WHEN** the module is imported without calling `defineActionDesignerElement`
- **THEN** `customElements.get("widgentic-action-designer")` SHALL be undefined
- **AND WHEN** it is called and an element is attached
- **THEN** edits SHALL dispatch `widgentic-change` events carrying the serialized action entry
