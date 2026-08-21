# Shared data schemas

## Why

A data shape usually outlives any single widget: a `person` is a person
whether it renders as a card or as a table row. Today `dataSchema` lives
inside each widget's descriptor, so the same schema is defined again for
every widget that uses it — and edits fork silently. Schemas become a
first-class, per-principal entity that widgets reference by name, so one
definition serves many widgets and an edit propagates to all of them.

## What Changes

- **Stored schemas**: a new per-principal entity
  `{ name, label?, description?, schema }` beside widgets and themes —
  same identifier charset, validate-on-write-and-read, per-principal
  limits, and adapter-uniform behavior (memory / file / Cosmos via the
  shared contract suite).
- **Reference semantics**: a stored widget's descriptor may carry
  `dataSchemaRef: "<schema-name>"` *instead of* an inline `dataSchema`
  (never both). Composition resolves the ref into the descriptor's
  `dataSchema` before registration — downstream of compose (catalog,
  renderer, wire format, agents) nothing knows references exist.
- **Deletion is guarded**: removing a schema that widgets still reference
  is refused, naming the referencing widgets — a dangling ref found on
  read (out-of-band edit) skips that widget with a diagnostic, like every
  other invalid entry.
- **Schema designer**: a third embeddable factory, `createSchemaDesigner`
  (identity fields + the existing schema builder + parse-gated JSON pane,
  `readOnly`/`setReadOnly` like the other two designers).
- **Widget designer**: the Data schema section gains a mode choice —
  *define inline* (today's builder/JSON) or *use shared* (pick from
  host-supplied `options.schemas`; the shared schema shows read-only and
  the draft carries the ref). Validation and preview resolve the ref
  locally so diagnostics keep working.
- **widgentic.dev**: a new "Data schemas" tab with the same
  view→edit flow as widgets and themes (select = read-only + Edit/Delete;
  Edit = Save/Cancel), backed by new session-authorized `/api/schemas`
  routes; the widget designer receives the principal's schemas.
- **Agent boundary unchanged**: agents keep drafting self-contained
  import JSON with inline schemas; no MCP tool or guide change. The
  write path stays closed to agents — shared-schema wiring is the user's
  act in the designer.

## Capabilities

### New Capabilities

*(none — schemas join the existing store/designer/app capabilities)*

### Modified Capabilities

- `widget-store`: stored-schema entity, reference resolution at
  composition, deletion guard, limits.
- `widget-designer`: `createSchemaDesigner` factory; the widget
  designer's inline-or-shared schema choice and `options.schemas`.
- `widgentic-app`: the Data schemas section, `/api/schemas` routes,
  schemas supplied to the widget designer.
