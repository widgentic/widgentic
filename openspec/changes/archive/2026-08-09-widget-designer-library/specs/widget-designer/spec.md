# widget-designer — the embeddable designer library

## ADDED Requirements

### Requirement: Designer programmatic surface
The package SHALL export from a `./designer` entry: `createDesigner(container: Element, options?)` returning a handle `{ getDraft(), loadWidget(definition), loadTheme(theme), subscribe(listener), dispose() }`, and `defineDesignerElement(tagName?)` which registers an opt-in custom element (default `widgentic-designer`) wrapping the factory and emitting `widgentic-change` CustomEvents whose `detail` carries the serialized draft. Custom-element registration SHALL only happen through the explicit call — importing the module SHALL have no registry side effects. The entry SHALL import other capabilities only through their public package entries, and SHALL perform no network I/O.

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

### Requirement: Custom widget draft editing
The designer SHALL edit a draft in the server's `CustomWidget` shape — `kind`, `template`, and a descriptor with `description`, `dataShape`, `dataExample`, `hints`, `styles`, and `dataSchema` — through dedicated panels. The template SHALL be editable both as a structured node tree covering every DSL form (text, `bind`, `each` with `empty`, `when` with `else`, elements with attrs including `{ bind }` values) and as a JSON source pane; both are projections of one canonical model, and invalid JSON SHALL never destroy the current tree (last-valid wins with the parse error shown). Every mutation SHALL re-run the relevant widgentic validators — `validateTemplate`, `validateDataAgainstSchema` (including `dataExample` cross-checked against `dataSchema`), the styles safety filters, and theme validation — surfacing their structured errors beside the panel that owns the offending value.

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

### Requirement: Live preview through the real pipeline
The designer SHALL preview the draft continuously through widgentic's own pipeline: the draft template registered via `registerTemplate` into a scratch catalog (built-ins always present), rendered with `mountWidget` against `dataExample` or user-supplied sample data, under the currently selected theme — updates patching the existing DOM in place. When the draft is invalid, the preview SHALL freeze the last good render and show the structured error in a banner; it SHALL never show a blank or stale-placeholder state.

#### Scenario: Valid edits patch the preview in place
- **WHEN** a text node's content changes in a valid draft
- **THEN** the preview SHALL update without replacing the mounted root element

#### Scenario: Invalid drafts keep the last good preview
- **WHEN** the template becomes invalid mid-edit
- **THEN** the last valid preview SHALL remain visible with the validation error banner shown

### Requirement: Theme designer for catalog widgets
The designer SHALL provide a theme mode editing a plain token map over `THEME_TOKENS` (one control per registry token), validating on every change, previewing against any kind in the scratch catalog — built-ins or the current draft — and exporting the bare JSON token map. Unsafe token values SHALL be flagged inline with the validator's error and excluded from the applied preview theme.

#### Scenario: Token edits preview immediately
- **WHEN** the `surface` token is set to a color distinct from `bg` with a `card` preview selected
- **THEN** the previewed card SHALL reflect the new surface immediately

#### Scenario: Unsafe values are flagged and not applied
- **WHEN** a token value contains `url(https://evil.example/x)`
- **THEN** the control SHALL show the `INVALID_TOKEN_VALUE` error and the preview SHALL not apply that value

### Requirement: Import and export in the server's shapes
The designer SHALL export the draft as JSON in exactly the `CustomWidget` shape (`{ kind, template, descriptor }`) and themes as bare token maps, and SHALL import the same shapes, re-validating everything on load (imports are untrusted input; invalid imports are rejected with the structured errors, leaving the current draft untouched). A copy-as-TypeScript convenience SHALL emit a module body compatible with `examples/mcp-server/widgets/` for manual registration. Exported widget JSON loaded back SHALL round-trip to a deep-equal draft.

#### Scenario: Export/import round-trips
- **WHEN** a draft equivalent to the invoice example is exported and re-imported
- **THEN** the resulting draft SHALL deep-equal the original

#### Scenario: Invalid imports never clobber the draft
- **WHEN** an import contains a template failing validation
- **THEN** the current draft SHALL remain and the import errors SHALL be shown
