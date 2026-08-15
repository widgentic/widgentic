# widget-designer — draft-only preview, tokens in sight, a calmer tree

## MODIFIED Requirements

### Requirement: Custom widget draft editing
The designer SHALL edit a draft in the server's `CustomWidget` shape — `kind`, `template`, and a descriptor with `description`, `dataShape`, `dataExample`, `hints`, `styles`, and `dataSchema` — through dedicated panels. The template SHALL be editable both as a structured node tree covering every DSL form (text, `bind`, `each` with `empty`, `when` with `else`, elements with attrs including `{ bind }` values) and as a JSON source pane; both are projections of one canonical model, and invalid JSON SHALL never destroy the current tree (last-valid wins with the parse error shown). The node tree SHALL stay flat and compact: each node renders as one slim row with its sub-structure indented beneath it, and value controls carry minimal chrome until hovered or focused. Dropdown controls in the tree SHALL size themselves to their selected value — re-fitting when the selection changes — so their carets sit beside the text instead of drifting with leftover row width. The data-schema builder SHALL share the same flat treatment: slim rows, minimal control chrome until hover or focus, hover-revealed removal controls, and selects fitted to their selected value. The descriptor's `styles` SHALL be editable both as a structured tree of selectors with their declarations and as a JSON source pane, both projections of the one draft value with the same parse gating as the template's JSON pane. Node insertion — child nodes, element attributes, and the `template`/`empty`/`else` slots — SHALL go through a single compact add-menu control that lists the available forms on demand, never through persistent per-form button rows. Structural nodes (elements, `each`, `when`) SHALL be collapsible from their row, with collapse state keyed to the node path so it survives the re-renders caused by draft edits; a collapsed node SHALL keep its header row and show a muted summary of what is hidden. An element's attribute rows SHALL be grouped under chrome visually distinct from its children (differentiated color, border, or typography). Every mutation SHALL re-run the relevant widgentic validators — `validateTemplate`, `validateDataAgainstSchema` (including `dataExample` cross-checked against `dataSchema`), the styles safety filters, and theme validation — surfacing their structured errors beside the panel that owns the offending value.

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

### Requirement: Import and export in the server's shapes
The designer SHALL export the draft as JSON in exactly the `CustomWidget` shape (`{ kind, template, descriptor }`) and themes as bare token maps, and SHALL import the same shapes, re-validating everything on load (imports are untrusted input; invalid imports are rejected with the structured errors, leaving the current draft untouched). Import and export SHALL be presented as two independent sections, with import placed before export. A copy-as-TypeScript convenience SHALL emit a module body compatible with `examples/mcp-server/widgets/` for manual registration. Exported widget JSON loaded back SHALL round-trip to a deep-equal draft.

#### Scenario: Export/import round-trips
- **WHEN** a draft equivalent to the invoice example is exported and re-imported
- **THEN** the resulting draft SHALL deep-equal the original

#### Scenario: Invalid imports never clobber the draft
- **WHEN** an import contains a template failing validation
- **THEN** the current draft SHALL remain and the import errors SHALL be shown

#### Scenario: Import and export are independent sections
- **WHEN** the designer mounts
- **THEN** import and export SHALL each render as their own titled section, with import before export

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
