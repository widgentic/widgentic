# widget-designer — attr rows author the transforms

> Builds on the pending `shared-data-schemas` delta of this requirement — archive that change first.

## MODIFIED Requirements

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
