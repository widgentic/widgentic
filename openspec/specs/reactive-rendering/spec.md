# reactive-rendering Specification

## Purpose
In-place DOM updates for mounted widget payloads. A mount handle (`mountWidget` → `initial`/`update`/`node`/`dispose`) re-renders payloads through the widget catalog, diffs the pure `WidgetNode` trees, and patches minimally — unchanged elements keep their DOM identity, failed updates leave the DOM untouched, and disposal is deterministic. Zero dependencies; the Arrow JS direction realized as a data-driven diff layer.
## Requirements
### Requirement: Reactive mount programmatic surface
The package SHALL export `mountWidget(payload: unknown, container: Element, options?: MountOptions): WidgetMount` from a `./reactive` entry. `MountOptions.catalog` SHALL accept a `WidgetCatalog` (default: a fresh `createCatalog()` per mount). `WidgetMount` SHALL expose `initial: UpdateResult`, `update(payload: unknown): UpdateResult`, `node(): WidgetNode | undefined`, and `dispose(): void`, where `UpdateResult` is `{ ok: true } | { ok: false; error: WidgetContractError }`.

#### Scenario: Mount renders the initial payload
- **WHEN** `mountWidget({ kind: "card", data: { title: "T" } }, container)` is called
- **THEN** `initial` SHALL be `{ ok: true }`
- **AND** the container SHALL contain a `.wg-card` element with the title text

#### Scenario: Invalid initial payload keeps the handle usable
- **WHEN** `mountWidget({ data: 1 }, container)` is called (no `kind`)
- **THEN** `initial` SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"`
- **AND** the container SHALL remain empty
- **AND** a subsequent valid `update` SHALL render normally

#### Scenario: Provided catalog is used for rendering and validation
- **WHEN** a catalog with a registered custom kind is passed via `options.catalog`
- **AND** a payload of that kind is mounted
- **THEN** the registered renderer's output SHALL appear in the container

### Requirement: In-place DOM patching
`update(payload)` SHALL re-render through the catalog, diff the new `WidgetNode` tree against the previous one, and patch the DOM minimally: text changes update text nodes, attribute changes set or remove only the affected attributes, and same-shape elements SHALL keep their DOM identity across updates. A changed tag or node type SHALL replace only that subtree.

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
- **THEN** affected nodes' `data-expanded` attributes SHALL change
- **AND** those elements SHALL keep their DOM identity

#### Scenario: Shape change replaces only the affected subtree
- **WHEN** an update changes the payload `kind` (producing a different root tag)
- **THEN** the widget root SHALL be replaced with the new widget's DOM

#### Scenario: Patched text is inert
- **WHEN** an update introduces text containing `<b>markup</b>`
- **THEN** the DOM SHALL contain that string as text content and no `<b>` element

### Requirement: Failed updates leave the DOM untouched
When `update(payload)` fails contract validation or names an unknown kind, it SHALL return `{ ok: false, error }` and SHALL NOT modify the DOM or the retained tree. Rendering SHALL resume from the last good state on the next valid update.

#### Scenario: Invalid payload does not blank the widget
- **WHEN** a successfully mounted widget receives `update({ data: 1 })` (no `kind`)
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"`
- **AND** the previously rendered DOM SHALL be unchanged

#### Scenario: Unknown kind is a structured error
- **WHEN** `update({ kind: "nope", data: 1 })` is called on a mounted widget
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "UNKNOWN_KIND"`
- **AND** the previously rendered DOM SHALL be unchanged

#### Scenario: Recovery after a failed update
- **WHEN** a failed update is followed by a valid one
- **THEN** the valid update SHALL patch from the last successfully rendered state

### Requirement: Mount handle lifecycle
`node()` SHALL return the currently rendered `WidgetNode` tree, or `undefined` before the first successful render. `dispose()` SHALL empty the container, release the retained tree, and be idempotent. Calling `update` on a disposed mount SHALL throw (host programming error); `node()` on a disposed mount SHALL return `undefined`.

#### Scenario: node reflects the current render
- **WHEN** a widget is mounted successfully and then updated successfully
- **THEN** `node()` SHALL return the tree of the latest render

#### Scenario: Dispose empties and is idempotent
- **WHEN** `dispose()` is called twice on a mounted widget
- **THEN** the container SHALL be empty after the first call
- **AND** the second call SHALL NOT throw

#### Scenario: Update after dispose throws
- **WHEN** `update(payload)` is called after `dispose()`
- **THEN** the call SHALL throw an error mentioning the disposed state
