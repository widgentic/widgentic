# widget-catalog — render is total over third-party renderers too

## MODIFIED Requirements

### Requirement: Catalog render entry point
`render(payload)` SHALL validate the payload with the contract validator using the catalog's current kinds as `knownKinds`, and SHALL return `{ ok: true, node }` on success or `{ ok: false, error: WidgetContractError }` on failure without throwing. A registered renderer that throws SHALL be caught and surfaced as `{ ok: false, error }` with `error.code: "RENDER_FAILED"`, `error.path: "widget"`, and a message naming the kind — never a propagated exception (built-ins are total by construction; this guards the extension point).

#### Scenario: Valid payload renders
- **WHEN** `catalog.render({ kind: "card", data: { title: "T" } })` is called
- **THEN** the result SHALL be `{ ok: true, node: <WidgetNode> }`

#### Scenario: Unknown kind is a structured error
- **WHEN** `catalog.render({ kind: "nope", data: 1 })` is called
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "UNKNOWN_KIND"`

#### Scenario: Invalid payload is a structured error
- **WHEN** `catalog.render({ data: 1 })` is called without `kind`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"`

#### Scenario: A throwing custom renderer is a structured error
- **WHEN** a registered renderer for kind `boom` throws and `catalog.render({ kind: "boom", data: 1 })` is called
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "RENDER_FAILED"` and `boom` named in the message
- **AND** the call SHALL NOT throw
