# widget-designer — a third designer, and drafts that borrow a schema

## ADDED Requirements

### Requirement: Standalone schema designer
The schema designer SHALL edit a stored-schema entry — identity (`name`, optional `label`/`description`) plus a `schema` object in the documented JSON-Schema subset — with the schema editable both through the structured builder and a parse-gated JSON pane (projections of one value; invalid JSON keeps the last valid schema with the error shown; only the selected view visible at a time). It SHALL validate on every change — the identifier charset for `name`, a plain object for `schema` — surfacing structured errors inline. `loadSchema(entry)` SHALL treat its input as untrusted, re-validating before it replaces the working entry and never replacing it on failure; `getSchema()` SHALL return the exact entry shape the store persists.

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

## MODIFIED Requirements

### Requirement: Designer programmatic surface
The package SHALL export from a `./designer` entry: `createDesigner(container: Element, options?)` returning a handle `{ getDraft(), loadWidget(definition), loadTheme(theme), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createThemeDesigner(container: Element, options?)` returning `{ getTheme(), loadTheme(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, `createSchemaDesigner(container: Element, options?)` returning `{ getSchema(), loadSchema(entry), setReadOnly(readOnly), subscribe(listener), dispose() }`, and the opt-in element registrars `defineDesignerElement(tagName?)` (default `widgentic-designer`) and `defineThemeDesignerElement(tagName?)` (default `widgentic-theme-designer`) and `defineSchemaDesignerElement(tagName?)` (default `widgentic-schema-designer`), each wrapping its factory and emitting `widgentic-change` CustomEvents whose `detail` carries the serialized draft, theme entry, or schema entry. All three factories SHALL accept `readOnly` in options and every handle SHALL expose `setReadOnly(readOnly)`: in read-only mode every editing surface is inert — visible but inoperable and visibly de-emphasized — while the preview stays live along with the widget designer's preview-theme selector, the theme designer's preview-kind selector, and the Export controls (export copies out what is already on screen; read-only restricts editing, not looking). Custom-element registration SHALL only happen through the explicit calls — importing the module SHALL have no registry side effects. The entry SHALL import other capabilities only through their public package entries, and SHALL perform no network I/O.

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

### Requirement: Custom widget draft editing
The designer SHALL edit a draft in the server's `CustomWidget` shape — `kind`, `template`, and a descriptor with `description`, `dataShape`, `dataExample`, `hints`, `styles`, and `dataSchema` — through dedicated panels. The template SHALL be editable both as a structured node tree covering every DSL form (text, `bind`, `each` with `empty`, `when` with `else`, elements with attrs including `{ bind }` values) and as a JSON source pane; both are projections of one canonical model, and invalid JSON SHALL never destroy the current tree (last-valid wins with the parse error shown). The node tree SHALL stay flat and compact: each node renders as one slim row with its sub-structure indented beneath it, and value controls carry minimal chrome until hovered or focused. Dropdown controls in the tree SHALL size themselves to their selected value — re-fitting when the selection changes — so their carets sit beside the text instead of drifting with leftover row width. The data-schema builder SHALL share the same flat treatment: slim rows, minimal control chrome until hover or focus, hover-revealed removal controls, and selects fitted to their selected value. The descriptor's `styles` SHALL be editable both as a structured tree of selectors with their declarations and as a JSON source pane, both projections of the one draft value with the same parse gating as the template's JSON pane. The descriptor's `hints` SHALL likewise be editable as flat name→doc rows beside a parse-gated JSON pane. JSON source panes SHALL accept Tab as indentation — inserting spaces at the caret without moving focus — while Shift+Tab keeps its focus-moving default as the keyboard escape. Node insertion — child nodes, element attributes, and the `template`/`empty`/`else` slots — SHALL go through a single compact add-menu control that lists the available forms on demand, never through persistent per-form button rows. Structural nodes (elements, `each`, `when`) SHALL be collapsible from their row, with collapse state keyed to the node path so it survives the re-renders caused by draft edits; a collapsed node SHALL keep its header row and show a muted summary of what is hidden. An element's attribute rows SHALL be grouped under chrome visually distinct from its children (differentiated color, border, or typography). The Data schema section SHALL offer two modes: **define inline** — the builder/JSON pair editing `descriptor.dataSchema`, today's behavior — or **use shared**, selecting one of the host-supplied `options.schemas` entries, which displays that schema read-only and stores `dataSchemaRef: "<name>"` on the draft's descriptor in place of the inline schema (never both). Validation and preview machinery that needs the schema — the `dataExample`/sample-data checks and the schema-driven data form — SHALL resolve the ref against `options.schemas` locally; a ref naming no supplied schema SHALL surface a diagnostic at the section. Loading a widget whose descriptor carries a ref SHALL select shared mode with that schema; export SHALL carry the ref exactly as authored — resolution belongs to the server's composition, so an exported definition stays what the store persists. Every mutation SHALL re-run the relevant widgentic validators — `validateTemplate`, `validateDataAgainstSchema` (including `dataExample` cross-checked against `dataSchema`), the styles safety filters, and theme validation — surfacing their structured errors beside the panel that owns the offending value — theme validation included, whose errors belong to the preview-theme panel.

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
