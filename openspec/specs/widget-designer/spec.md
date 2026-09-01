# widget-designer Specification

## Purpose
The embeddable, zero-dependency designer for authoring custom widgets and themes. A programmatic factory (plus an opt-in custom element) mounts a DOM editor over a draft in the server's `CustomWidget` shape; every edit re-runs widgentic's own pure validators and re-renders a live preview through the real catalog/template/theming pipeline. It is a library, not an app: drafts import and export as the exact JSON shapes the server consumes, and the designer performs no network I/O — hosts own persistence.
## Requirements
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

### Requirement: Draft seeding from existing definitions
The designer package SHALL export pure seeding helpers that copy at creation time and never keep a live link to the source. `seedWidgetDraft(source)` SHALL accept a stored widget definition — returning a draft whose identity (kind) is made distinct while the template, descriptor, styles, and any `dataSchemaRef` are copied — or a built-in kind name (`card`, `table`, `tree`), returning a starter draft whose template approximates that built-in using its `wg-*` classes and the built-in's documented data example, so the seed renders recognizably like the original before any edit. `seedThemeEntry(source)` SHALL accept a stored theme entry or a preset name (`light` for the token defaults, `dark` for the dark preset), returning an entry with the tokens copied and a distinct, non-reserved name. Both helpers SHALL accept the taken names/kinds and pick a deterministic distinct identity that avoids them; seeding SHALL never mutate the source.

#### Scenario: A stored widget seeds a new draft
- **WHEN** `seedWidgetDraft` is called with a stored `person-card` definition (including a `dataSchemaRef`)
- **THEN** the returned draft SHALL carry a kind different from `person-card`, the same template, descriptor content, and `dataSchemaRef`
- **AND** the source definition SHALL be unchanged

#### Scenario: Built-in kinds seed starter templates
- **WHEN** `seedWidgetDraft` is called with `"card"`, `"table"`, or `"tree"`
- **THEN** the returned draft SHALL validate, render through the preview pipeline, and use that built-in's `wg-*` classes with its documented data example

#### Scenario: A theme seeds from a preset or a stored entry
- **WHEN** `seedThemeEntry` is called with `"dark"` and with a stored entry
- **THEN** each result SHALL carry the source's tokens under a name that is neither reserved (`light`/`dark`) nor the source's own

#### Scenario: Seeded identities avoid taken names
- **WHEN** the taken set already contains the would-be seeded kind or name
- **THEN** the helper SHALL return a deterministic alternative not in the set

### Requirement: Custom widget draft editing
The designer SHALL edit a draft in the server's `CustomWidget` shape — `kind`, `template`, and a descriptor with `description`, `dataShape`, `dataExample`, `hints`, `styles`, and `dataSchema` — through dedicated panels. The template SHALL be editable both as a structured node tree covering every DSL form (text, `bind`, `each` with `empty`, `when` with `else`, elements with attrs including `{ bind }` values and the attr transforms — a bind-mode attr row SHALL offer an optional literal `prefix` input and a value→literal `map` editor with `default`, so status→class mapping and `mailto:`/`tel:` links are authorable without the JSON pane) and as a JSON source pane; both are projections of one canonical model, and invalid JSON SHALL never destroy the current tree (last-valid wins with the parse error shown). The node tree SHALL stay flat and compact: each node renders as one slim row with its sub-structure indented beneath it, and value controls carry minimal chrome until hovered or focused. Dropdown controls in the tree SHALL size themselves to their selected value — re-fitting when the selection changes — so their carets sit beside the text instead of drifting with leftover row width. The data-schema builder SHALL share the same flat treatment: slim rows, minimal control chrome until hover or focus, hover-revealed removal controls, and selects fitted to their selected value. The builder SHALL read and write nullable type arrays: a `type` of the form `[<type>, "null"]` (either order) presents as the PRIMARY type with a nullable toggle — constraints (`pattern`, `enum`) and sub-structure follow the primary type, never collapsing to `any` — and type edits emit the array form while the toggle is set. Type arrays beyond the nullable pattern remain JSON-pane territory but survive untouched until the type controls are edited. The descriptor's `styles` SHALL be editable both as a structured tree of selectors with their declarations and as a JSON source pane, both projections of the one draft value with the same parse gating as the template's JSON pane. The descriptor's `hints` SHALL likewise be editable as flat name→doc rows beside a parse-gated JSON pane. JSON source panes SHALL accept Tab as indentation — inserting spaces at the caret without moving focus — while Shift+Tab keeps its focus-moving default as the keyboard escape. Node insertion — child nodes, element attributes, and the `template`/`empty`/`else` slots — SHALL go through a single compact add-menu control that lists the available forms on demand, never through persistent per-form button rows. Structural nodes (elements, `each`, `when`) SHALL be collapsible from their row, with collapse state keyed to the node path so it survives the re-renders caused by draft edits; a collapsed node SHALL keep its header row and show a muted summary of what is hidden. An element's attribute rows SHALL be grouped under chrome visually distinct from its children (differentiated color, border, or typography). The Data schema section SHALL offer two modes: **define inline** — the builder/JSON pair editing `descriptor.dataSchema`, today's behavior — or **use shared**, selecting one of the host-supplied `options.schemas` entries, which displays that schema read-only and stores `dataSchemaRef: "<name>"` on the draft's descriptor in place of the inline schema (never both). Validation and preview machinery that needs the schema — the `dataExample`/sample-data checks and the schema-driven data form — SHALL resolve the ref against `options.schemas` locally; a ref naming no supplied schema SHALL surface a diagnostic at the section. Loading a widget whose descriptor carries a ref SHALL select shared mode with that schema; export SHALL carry the ref exactly as authored — resolution belongs to the server's composition, so an exported definition stays what the store persists. Every mutation SHALL re-run the relevant widgentic validators — `validateTemplate`, `validateDataAgainstSchema` (including `dataExample` cross-checked against `dataSchema`), the styles safety filters, and theme validation — surfacing their structured errors beside the panel that owns the offending value — theme validation included, whose errors belong to the preview-theme panel.

#### Scenario: Template edits validate live
- **WHEN** an element node gains an `onclick` attribute in the tree editor
- **THEN** a `FORBIDDEN_ATTRIBUTE` diagnostic SHALL appear at that node without losing the draft

#### Scenario: JSON pane cannot destroy the tree
- **WHEN** the JSON source is edited into invalid JSON
- **THEN** the canonical model SHALL remain the last valid template and the pane SHALL show the parse error

#### Scenario: dataExample is checked against dataSchema
- **WHEN** the draft's `dataSchema` requires `lines` and `dataExample` lacks it
- **THEN** a diagnostic SHALL flag the mismatch with the schema's dotted path

#### Scenario: Styles editor applies the same guards as the server
- **WHEN** a style entry uses a non-`.wg-` selector or a `url(...)` value
- **THEN** the entry SHALL be flagged as one the renderer would skip

#### Scenario: Nodes are added through one compact menu
- **WHEN** the add menu on an element node is opened
- **THEN** it SHALL list the insertable forms (attribute plus the DSL node forms) and choosing one SHALL insert that form
- **AND** unset `template`/`empty`/`else` slots SHALL offer the same menu control instead of per-form button rows
- **AND** the menu SHALL close on an outside click or Escape without inserting

#### Scenario: Structural nodes collapse and stay collapsed across edits
- **WHEN** an element node with children is collapsed from its row
- **THEN** its attribute and child rows SHALL be hidden while the header row remains, with a muted summary of the hidden content
- **AND** after a draft edit elsewhere in the template the node SHALL remain collapsed

#### Scenario: Attributes read differently from children
- **WHEN** an element with both attributes and children is rendered in the tree
- **THEN** the attribute rows SHALL be grouped under distinct chrome from the children container

#### Scenario: Dropdowns hug their selected value
- **WHEN** an element's tag select shows `div` and the selection changes to `section`
- **THEN** the control's width SHALL track the selected label in both states rather than stretching to the row's width

#### Scenario: The schema builder reads flat like the tree
- **WHEN** the data-schema builder renders an object schema with properties
- **THEN** each property SHALL render as one slim row with its removal control revealed on hover or focus and its type select fitted to the selected value

#### Scenario: Styles edit as a tree and as JSON
- **WHEN** a styles entry `.wg-card` with a `padding` declaration exists
- **THEN** the styles tree SHALL show the selector with its declaration rows, editable in place
- **AND** edits in either view SHALL project into the other, with invalid JSON keeping the last valid styles and showing the parse error
- **AND** only the selected view SHALL be visible at a time

#### Scenario: Hints edit as rows and as JSON
- **WHEN** a hint named `columns` with a doc string exists
- **THEN** the hints tree SHALL show it as an editable name→doc row beside the parse-gated JSON pane, one view visible at a time

#### Scenario: JSON panes indent on Tab
- **WHEN** Tab is pressed inside an editable JSON source pane
- **THEN** indentation SHALL be inserted at the caret and focus SHALL remain in the pane
- **AND** Shift+Tab SHALL keep its focus-moving default

#### Scenario: Theme validation errors reach the theme panel
- **WHEN** the selected preview theme carries an unsafe token value
- **THEN** the theme panel SHALL show that validator's structured error

#### Scenario: A shared schema replaces the inline one
- **WHEN** the Data schema section switches to shared mode and selects `person`
- **THEN** the draft's descriptor SHALL carry `dataSchemaRef: "person"` and no inline `dataSchema`, with the shared schema displayed read-only
- **AND** switching back to inline mode SHALL drop the ref and restore an editable schema

#### Scenario: Refs resolve locally for validation and preview
- **WHEN** the draft references a shared `person` schema requiring `name` and `dataExample` lacks `name`
- **THEN** the dataExample diagnostic SHALL flag the mismatch with the schema's dotted path, exactly as with an inline schema
- **AND** a ref naming no supplied schema SHALL surface a diagnostic at the Data schema section

#### Scenario: Nullable type arrays keep their type and constraints
- **WHEN** a schema property carries `type: ["string", "null"]` with a `pattern`
- **THEN** the builder SHALL show type `string` with the nullable toggle set and the pattern constraint visible and editable
- **AND** clearing the toggle SHALL write `type: "string"` preserving the pattern, and setting it SHALL write the array form back

#### Scenario: Attr transforms are authorable in the tree
- **WHEN** a bind-mode attr row sets `prefix: "mailto:"`, or adds map rows `do-not-contact → wg-status-danger` with a default
- **THEN** the draft's attr value SHALL carry the corresponding transform object
- **AND** loading a template that carries transforms SHALL show them in those controls, round-tripping unchanged through export

### Requirement: Live preview through the real pipeline
The designer SHALL preview the draft continuously through widgentic's own pipeline: the draft template compiled by the public template compiler and registered into a scratch catalog (built-ins always present; registration via `catalog.register` with a compile delegate, so one mounted preview survives every recompile), rendered with `mountWidget` against `dataExample` or user-supplied sample data, under the currently selected theme — updates patching the existing DOM in place. When the draft is invalid, the preview SHALL freeze the last good render and show the structured error in a banner; it SHALL never show a blank or stale-placeholder state — including on the FIRST render, where there is no last good render to freeze on (an invalid or reserved-kind `initialWidget` must still leave a legible pane, not an empty one).

#### Scenario: Valid edits patch the preview in place
- **WHEN** a text node's content changes in a valid draft
- **THEN** the preview SHALL update without replacing the mounted root element

#### Scenario: Invalid drafts keep the last good preview
- **WHEN** the template becomes invalid mid-edit
- **THEN** the last valid preview SHALL remain visible with the validation error banner shown

#### Scenario: An invalid initial draft never renders blank
- **WHEN** a designer is created with an `initialWidget` whose template fails validation, or whose `kind` is a reserved built-in
- **THEN** the preview pane SHALL show an explicit empty state rather than nothing, with the structured error in the banner

### Requirement: Theme designer for catalog widgets
The standalone theme designer SHALL edit a named theme entry — identity (`name`, optional `label`/`description`) plus a plain token map over `THEME_TOKENS` (one control per registry token, with the control chosen from the token's declared `type` — `color` tokens showing a picker/swatch of the effective value — and its documented `use` surfaced as help text) and author-defined `x-*` custom variables (add/rename/remove) — validating on every change and previewing against any kind in its scratch catalog. It SHALL accept host-supplied custom widget definitions in `options.widgets` and offer them alongside the built-in kinds in its preview-kind selector, rendering each with its own descriptor styles — a theme is judged against the widgets it will actually dress. A supplied definition that fails template validation SHALL be skipped without breaking the designer. Unsafe token values SHALL be flagged inline with the validator's error and excluded from the applied preview theme. Export SHALL produce the registry entry shape (`{ name, label?, description?, tokens }`) and import SHALL accept the same, re-validating before it replaces the working entry.

#### Scenario: Token edits preview immediately
- **WHEN** the `surface` token is set to a color distinct from `bg` with a `card` preview selected
- **THEN** the previewed card SHALL reflect the new surface immediately

#### Scenario: Unsafe values are flagged and not applied
- **WHEN** a token value contains `url(https://evil.example/x)`
- **THEN** the control SHALL show the `INVALID_TOKEN_VALUE` error and the preview SHALL not apply that value

#### Scenario: Custom variables are editable and previewed
- **WHEN** a custom variable `x-badge-gap` is added with value `4px`
- **THEN** it SHALL be applied to the preview as `--wg-x-badge-gap`
- **AND** it SHALL appear in the exported entry's tokens

#### Scenario: Export and import use the registry entry shape
- **WHEN** an edited entry is exported and re-imported
- **THEN** the resulting entry SHALL deep-equal the original
- **AND** an entry whose tokens fail validation SHALL be rejected without replacing the working entry

#### Scenario: Custom widgets are previewable under the theme
- **WHEN** a theme designer is created with `options.widgets` carrying a custom definition
- **THEN** its kind selector SHALL offer that kind beside the built-ins
- **AND** selecting it SHALL render that widget from its own `dataExample`, with its descriptor styles applied and the edited tokens in effect
- **AND** a definition with an invalid template SHALL be skipped while the rest stay selectable

### Requirement: Preview theme selection in the widget designer
The widget designer SHALL accept `options.themes` — a list of named theme entries — and offer them as the preview theme through a selector (including a "none" choice for the built-in defaults), applying the chosen entry's tokens to the live preview. The preview SHALL render the draft widget only — there is no kind selector; previewing arbitrary catalog kinds under a theme belongs to the standalone theme designer. Beside the theme selection, the designer SHALL show a compact read-only listing of the effective preview tokens — the selected entry merged over the defaults — with each token's name, its effective value, and a color swatch for `color`-typed tokens (type read from the registry's metadata, never inferred), so style authoring can reference `var(--wg-…)` by sight. The widget designer SHALL NOT edit theme tokens; theme authoring belongs to the standalone theme designer. The draft's theme selection SHALL NOT affect the exported widget definition, which stays `{ kind, template, descriptor }`.

#### Scenario: Supplied themes are selectable and applied
- **WHEN** a designer is created with `options.themes` containing a `dark` entry and that entry is selected
- **THEN** the preview SHALL carry the entry's tokens as `--wg-*` custom properties

#### Scenario: Theme selection never leaks into the export
- **WHEN** a theme is selected and the widget is exported
- **THEN** the exported JSON SHALL contain exactly `kind`, `template`, and `descriptor`

#### Scenario: No themes supplied is a valid embedding
- **WHEN** a designer is created without `options.themes`
- **THEN** it SHALL mount with the default preview appearance and no theme selector entries beyond "none"

#### Scenario: The preview renders the draft only
- **WHEN** the widget designer is mounted
- **THEN** its preview area SHALL offer no kind selection and SHALL render the current draft

#### Scenario: The token reference reflects the selected theme
- **WHEN** a `dark` entry is selected as the preview theme
- **THEN** the token listing SHALL show the entry's values (its `bg` over the default), with swatches on color-typed tokens
- **AND** selecting "none" SHALL show the defaults

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

### Requirement: Standalone schema designer
The schema designer SHALL edit a stored-schema entry — identity (`name`, optional `label`/`description`) plus a `schema` object in the documented JSON-Schema subset — with the schema editable both through the structured builder and a parse-gated JSON pane (projections of one value; invalid JSON keeps the last valid schema with the error shown; only the selected view visible at a time). It SHALL validate on every change — the identifier charset for `name`, a plain object for `schema` — surfacing structured errors inline. It SHALL present Import and Export as two independent sections, import first (the shape the other designers share): import accepts the store's entry JSON — the exact JSON an agent drafts from the authoring guide — re-validating before it replaces the working entry and rejecting with structured errors that leave it untouched; export produces the current entry as JSON, and stays operable in read-only mode (export copies out what is on screen). `loadSchema(entry)` SHALL treat its input as untrusted, re-validating before it replaces the working entry and never replacing it on failure; `getSchema()` SHALL return the exact entry shape the store persists.

#### Scenario: Edits project between builder and JSON
- **WHEN** a property is added in the builder
- **THEN** the JSON pane SHALL reflect it, and an edit in the JSON pane SHALL reflect back in the builder
- **AND** invalid JSON SHALL keep the last valid schema with the parse error shown

#### Scenario: Invalid loads never clobber the working entry
- **WHEN** `loadSchema` receives an entry with an empty `name` or a non-object `schema`
- **THEN** it SHALL return the structured errors and the working entry SHALL remain unchanged

#### Scenario: The entry round-trips in the store's shape
- **WHEN** a valid entry is loaded and immediately read back with `getSchema()`
- **THEN** the result SHALL deep-equal the loaded entry

#### Scenario: An agent-drafted entry imports through the designer
- **WHEN** a schema entry JSON drafted from the authoring guide is pasted into the Import section
- **THEN** it SHALL load as the working entry, ready to save
- **AND** invalid JSON or an invalid entry SHALL show the errors and leave the working entry untouched

#### Scenario: Import and export are independent sections, import first
- **WHEN** the schema designer mounts
- **THEN** it SHALL render an Import section before an Export section
- **AND** Export SHALL remain operable when mounted read-only

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

### Requirement: Designer chrome is themeable by the host
The designers SHALL paint their chrome exclusively through a documented set of custom properties — the chrome tokens — exported as `CHROME_TOKENS` (with the `ChromeToken` type): the colour tokens `bg`, `panel`, `border`, `line`, `text`, `muted`, `accent`, `accent-bg`, `accent-line`, `danger`, `danger-bg`, `danger-line`, `hover`, `hl-key`, `hl-str`, `hl-num`, `hl-bool`, `hl-punct`; the typography tokens `font` (labels, buttons, controls), `font-mono` (code panes and code-like values), `font-size` (base), `font-size-sm` (compact rows), `font-size-xs` (badges, tags and inline meta); the shape tokens `radius-sm`, `radius`, `radius-lg`, `gap`; and the elevation token `shadow`; each `--wgd-<token>`. Every factory SHALL accept `options.chrome`, a partial map from token to CSS value, and SHALL apply the given values on the designer's root element so they take precedence over the built-in light and dark defaults; values MAY be `var()` references to the host's own custom properties. Unknown token names, non-string values and CSS-wide keywords (`inherit`, `initial`, `unset`, `revert`) SHALL be ignored, never thrown — a host that wants its own typeface passes its variable with a fallback stack. The custom elements SHALL accept the same map as a `chrome` attribute holding JSON, read when the element connects; unparseable JSON SHALL be ignored. The injected stylesheet SHALL contain no colour, typeface, font-size, radius or shadow literal outside the token declaration blocks, and no `var()` fallback for a token those blocks or the widget base stylesheet define.

With no `chrome` given, the designers SHALL render in the widgentic palette — the product's own colours and shape, light and dark — so that our app, the examples and any host that configures nothing all look like one product. The colour and shape tokens SHALL carry those values; the typography tokens SHALL NOT, remaining the system stacks and sizes a library can guarantee without fetching a font. The default palette SHALL be exported as data alongside the tokens, and SHALL be the very object the stylesheet is generated from, so a host can paint its own surfaces to match instead of restating the values. Exactly one palette SHALL ship: a host that does not want the product look supplies its own values through `chrome` and owns their contrast, rather than reaching for a second palette the package maintains. A helper SHALL render any palette as light and dark custom-property declaration blocks under a caller-chosen prefix, so a host page's palette is derived rather than copied. A second helper SHALL return the complete `chrome` map of `var()` references to those page properties under the same caller-chosen prefix (default `--host`), derived from the token list rather than written by hand, so a host that paints its page from the derived palette hands the designers its own properties in one call and may spread-override individual entries; because the references resolve at the host, the host's own scheme handling — an explicit toggle included — reaches MOUNTED designers through the cascade, with no remount and no designer API. The helper's documentation SHALL state that a reference to a property the page does not define is invalid at computed-value time and does not fall back to the built-in defaults, and SHALL pair the reference map with the derived page palette. Every foreground/background pair among the default tokens SHALL meet the WCAG contrast threshold for its role in both schemes, checked by a test over computed values rather than by inspection.

`chrome` SHALL NOT affect widget previews, whose `--wg-*` theme tokens are governed by the widget-theming capability.

#### Scenario: A host palette replaces the defaults
- **WHEN** `createDesigner(container, { chrome: { bg: "#101820", accent: "var(--brand)", font: "Inter, sans-serif" } })` is called
- **THEN** the root element SHALL carry `--wgd-bg`, `--wgd-accent` and `--wgd-font` as inline custom properties with those values, and the chrome's background, accent and typeface SHALL resolve to them

#### Scenario: Host scheme switching flows through
- **WHEN** a host passes `var()` references that change with its own `prefers-color-scheme` handling
- **THEN** the chrome SHALL follow the host's scheme without the designer being recreated, because the references resolve at the host

#### Scenario: Invalid values are ignored at the door
- **WHEN** `chrome` names an unknown token, carries a non-string value, or gives a CSS-wide keyword such as `inherit`
- **THEN** the designer SHALL mount normally, set nothing for those entries, and keep the built-in defaults for the affected tokens

#### Scenario: Elements accept the map as an attribute
- **WHEN** `<widgentic-designer chrome='{"accent":"#40A0C8"}'>` is attached
- **THEN** its root SHALL carry `--wgd-accent: #40A0C8`
- **AND WHEN** the attribute is not valid JSON or names an unknown token
- **THEN** the designer SHALL mount normally with the defaults for the affected tokens

#### Scenario: Nothing changes for hosts that pass nothing
- **WHEN** a designer is created without `chrome`
- **THEN** it SHALL need no configuration and its typography and spacing SHALL be unchanged — the system stacks, sizes 13px, 12px and 11px, gap 16px — and the root token block SHALL declare every documented default so no token falls back to a browser value

#### Scenario: Hosts that pass nothing get the product look
- **WHEN** a designer is created without `chrome`, in each scheme
- **THEN** its computed colour tokens SHALL be the exported default palette for that scheme and its radii SHALL be 4/6/8px

#### Scenario: The exported palette is the applied palette
- **WHEN** the exported default palette is compared with the tokens a designer computes with no `chrome`
- **THEN** every token SHALL match, so a host painting its page from the export cannot drift from the designers

#### Scenario: A host page derives its palette
- **WHEN** the helper is called with a custom-property prefix
- **THEN** it SHALL return light and dark declaration blocks defining every token under that prefix, suitable for a stylesheet, with no value restated by hand

#### Scenario: A host that wants another look brings its own
- **WHEN** a host passes a full palette of its own as `chrome`
- **THEN** every token SHALL take the host's value, and the package SHALL offer no alternative palette of its own for the host to fall back to

#### Scenario: Every default pair meets contrast
- **WHEN** the default palettes are checked pair by pair in both schemes
- **THEN** text on its surface SHALL meet the WCAG AA threshold for body text, and accent, border and line pairs SHALL meet the threshold for their role, with the check failing the build otherwise

#### Scenario: The stylesheet has no stray literals
- **WHEN** the injected chrome stylesheet is inspected outside its token declaration blocks
- **THEN** it SHALL contain no colour literal, no typeface literal, no `px` font size, no `px` border radius and no shadow literal — only `var(--wgd-…)` references (and `calc()` over them)

#### Scenario: Previews are untouched
- **WHEN** `chrome` is set and a widget is previewed
- **THEN** the preview's `--wg-*` tokens SHALL be those of the selected preview theme, unaffected by `chrome`

#### Scenario: The reference map is derived, not written
- **WHEN** the reference helper is called with the default prefix and again with a custom one
- **THEN** it SHALL return an entry for every documented token mapping to `var(--host-<token>)` (respectively the custom prefix) and SHALL contain no value literal

#### Scenario: A host toggle reaches mounted designers through the references
- **WHEN** a page defines the derived palette with an explicit dark selector, a designer is mounted with the reference map as `chrome`, and the page's scheme attribute then changes
- **THEN** the mounted designer's chrome SHALL repaint through the cascade alone — no remount, no further call

#### Scenario: The recipe states the no-fallback caveat
- **WHEN** the reference helper's documentation is read
- **THEN** it SHALL say that an undefined page property yields an invalid value rather than the built-in default, and SHALL show the map paired with the derived page palette
