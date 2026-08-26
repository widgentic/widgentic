# reactive-rendering — widget-actions delta

## MODIFIED Requirements

### Requirement: Reactive mount programmatic surface
The package SHALL export `mountWidget(payload: unknown, container: Element, options?: MountOptions): WidgetMount` from a `./reactive` entry. `MountOptions.catalog` SHALL accept a `WidgetCatalog` (default: a fresh `createCatalog()` per mount). `MountOptions.onAction` SHALL accept a callback `(activation: { id, kind, args?, text?, disabled? }, payload) => void`: when present, activating a mounted `[data-wg-action]` element (click, or Enter/Space on a focused button) SHALL parse its descriptor and invoke the callback with it and the currently mounted payload, with the default action prevented; when absent, such elements SHALL be inert — no navigation, no error, no callback. The mount SHALL never execute an action itself; deciding what an activation means is the host's. `WidgetMount` SHALL expose `initial: UpdateResult`, `update(payload: unknown): UpdateResult`, `node(): WidgetNode | undefined`, and `dispose(): void`, where `UpdateResult` is `{ ok: true } | { ok: false; error: WidgetContractError }`.

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

#### Scenario: Activations reach the host through onAction
- **WHEN** a template kind with a bound button is mounted with `options.onAction` and the button is clicked
- **THEN** the callback SHALL receive `{ id, kind, args }` from the element's descriptor and the mounted payload
- **AND** without `onAction` the click SHALL do nothing

#### Scenario: Disposal detaches the listener
- **WHEN** `dispose()` has been called
- **THEN** a later click on a former action element SHALL NOT invoke the callback
