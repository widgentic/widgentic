## MODIFIED Requirements

### Requirement: In-place DOM patching
`update(payload)` SHALL re-render through the catalog, diff the new `WidgetNode` tree against the previous one, and patch the DOM minimally: text changes update text nodes, attribute changes set or remove only the affected attributes, and same-shape elements SHALL keep their DOM identity across updates. A changed tag or node type SHALL replace only that subtree.

The diff SHALL be taken against the PREVIOUS render tree, never against the live DOM, so an attribute the renderer emits unchanged is not rewritten and a change a VISITOR made to it in the DOM survives the patch. This is what keeps a native disclosure's expand/collapse state — a `details` element's `open` attribute — alive across an action's re-render of the same branch: unchanged branches are left alone, while a branch the new data appends mounts with its computed initial state.

#### Scenario: Text update preserves element identity
- **WHEN** a mounted table payload is updated with one changed cell value
- **THEN** the cell SHALL show the new value
- **AND** the `<table>` element and the unchanged cells SHALL be the same DOM nodes as before the update

#### Scenario: Appended records extend the DOM without rebuilding
- **WHEN** a mounted table payload is updated with an additional record
- **THEN** a new row SHALL be appended
- **AND** the pre-existing row elements SHALL keep their DOM identity

#### Scenario: Attribute change patches in place
- **WHEN** a mounted tree payload is updated with a different `hints.expandDepth`
- **THEN** affected branches' `open` attributes SHALL change
- **AND** those elements SHALL keep their DOM identity

#### Scenario: Shape change replaces only the affected subtree
- **WHEN** an update changes the payload `kind` (producing a different root tag)
- **THEN** the widget root SHALL be replaced with the new widget's DOM

#### Scenario: Patched text is inert
- **WHEN** an update introduces text containing `<b>markup</b>`
- **THEN** the DOM SHALL contain that string as text content and no `<b>` element

#### Scenario: A visitor's disclosure state survives an unchanged re-render
- **WHEN** a visitor opens a tree branch the renderer emitted collapsed (or closes one it emitted open), and the SAME payload is then re-rendered through `update`
- **THEN** the branch element SHALL keep its DOM identity and the visitor's state
- **AND** a branch the update newly appends SHALL mount with the state its data and hints compute
