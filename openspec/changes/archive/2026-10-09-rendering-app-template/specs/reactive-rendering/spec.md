## MODIFIED Requirements

### Requirement: In-place DOM patching
`update(payload)` SHALL re-render through the catalog, diff the new `WidgetNode` tree against the previous one, and patch the DOM minimally: text changes update text nodes, attribute changes set or remove only the affected attributes, and same-shape elements SHALL keep their DOM identity across updates. A changed tag or node type SHALL replace only that subtree.

The diff SHALL be taken against the PREVIOUS render tree, never against the live DOM, so an attribute the renderer emits unchanged is not rewritten and a change a VISITOR made to it in the DOM survives the patch. This is what keeps a native disclosure's expand/collapse state — a `details` element's `open` attribute — alive across an action's re-render of the same branch: unchanged branches are left alone, while a branch the new data appends mounts with its computed initial state.

Children SHALL be paired KEYED when, for one parent, every child in the previous list and every child in the next list is an element carrying a `key`, and the keys are unique within each list: a next child SHALL be paired with the previous child of the same key, patched in place under the same rules, and its existing DOM node MOVED to the child's new position — never rebuilt — so DOM identity and a visitor's disclosure state follow the record through a reorder; next children whose key the previous list lacks SHALL be built fresh, and previous children whose key the next list lacks SHALL be removed. In every other case — any text child, any element without a key, a duplicate key in either list — children SHALL be paired by position, exactly as before keys existed. Keys are render-tree data: the patcher SHALL NOT set them as DOM attributes.

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

#### Scenario: Keyed rows follow their records through a reorder
- **WHEN** a mounted table whose records carry unique `id` values is updated with the same records in reverse order
- **THEN** each row element SHALL be the same DOM node that showed that record before the update, now at its new position
- **AND** no row element SHALL have been rebuilt

#### Scenario: A visitor's disclosure follows its branch through a reorder
- **WHEN** a visitor opens the branch for the node with `id: "b"` in a tree whose sibling nodes carry unique `id` values, and an update swaps the order of `"a"` and `"b"`
- **THEN** the open branch SHALL still be the one labelled for `"b"`, and `"a"` SHALL keep the state it had

#### Scenario: Keyed lists add and remove by key
- **WHEN** a keyed list `[a, b, c]` is updated to `[c, d, a]`
- **THEN** the elements for `c` and `a` SHALL keep their DOM identity, an element for `d` SHALL be built, and the element for `b` SHALL be removed

#### Scenario: Unkeyed and ambiguous lists pair by position
- **WHEN** an update's sibling list contains an element without a key, a text child, or two elements with the same key
- **THEN** that list's children SHALL be paired by position, exactly as for a list with no keys

#### Scenario: Keys never reach the DOM
- **WHEN** a keyed tree is mounted and patched
- **THEN** no DOM element SHALL carry an attribute named `key` or any attribute holding a key value that the render tree did not also emit as an attribute
