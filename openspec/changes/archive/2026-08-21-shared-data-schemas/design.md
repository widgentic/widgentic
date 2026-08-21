# Design — shared data schemas

## D1. Reference, not copy

"Reuse instead of duplicate" only holds if editing the schema updates
every widget that uses it — so a stored widget carries
`dataSchemaRef: "<name>"` and the schema stays one entity. A copy-on-pick
model would be simpler but forks on the first edit, which is the exact
problem being solved. The cost of references is a cross-entity
dependency, and everything in D2–D4 exists to keep that dependency from
producing silent failures.

## D2. The ref lives in the store's vocabulary, dies at composition

`dataSchemaRef` is a **store-layer** concept on the stored descriptor.
`composeCatalog` resolves it into the registered descriptor's
`dataSchema`; the catalog type, renderer, wire format, and `list_widgets`
output never learn that references exist — agents consume fully-resolved
descriptors when RENDERING. The authoring side is the deliberate
exception (added with `list_schemas`): agents DRAFTING a widget are
taught the ref, because that is the artifact the user imports.

## D3. Fail at the door, skip on out-of-band drift

The verification-fixes change taught this shape (`RESERVED_THEME`):
accepting a write that later fails during composition converts a user
error into silent data loss. Applied here:

- `dataSchema` + `dataSchemaRef` together → refused, `INVALID_SHAPE`.
- Ref to a schema the principal doesn't store → refused, `UNKNOWN_SCHEMA`.
- Deleting a referenced schema → refused, `SCHEMA_IN_USE`, naming the
  referencing widgets so the user knows what to re-point.

With those write-side guards, a dangling ref can only arise from
out-of-band edits — and read-side follows the standing discipline:
skip that widget with a diagnostic naming the missing schema.

The in-use check lives in the writable store (it holds both
collections), so every adapter behaves identically and the contract
suite pins it — not in the app layer, where a second front door could
bypass it.

## D4. What "schema validity" means at the store

`name` in the shared identifier charset; `schema` a plain object; size
within limits. No deep keyword validation: the JSON-Schema subset is
deliberately lenient downstream (unknown keywords ignored), and a
stricter gate here would make the store the only place that rejects
what the renderer happily tolerates. No reserved names either — there
are no built-in schemas to shadow.

## D5. The schema designer is the third sibling — io included (revised)

`createSchemaDesigner` mirrors the theme designer's shape: identity
fields + the existing schema builder + a parse-gated JSON pane,
`readOnly`/`setReadOnly`, an opt-in element. The first cut shipped
without Import/Export on the assumption that agents don't draft
standalone schemas — **live testing falsified that within a day**: once
`list_schemas` and the guide's `dataSchemaRef` teaching landed, an agent
handed the user a complete `{ name, label, description, schema }` entry
with nowhere to paste it. The designer therefore carries the same two
io sections as its siblings (import first; import re-validates via
`checkSchemaEntry` and never clobbers on failure; export is view-only
chrome, operable in read-only), and the guide documents the entry shape
so agents keep producing exactly what Import accepts.

In the widget designer, shared mode displays the schema **read-only**
— editing a shared schema from inside a widget draft would be
edit-at-a-distance with surprise blast radius. Editing happens in the
schema section, where the dependency is visible.

## D6. App wiring and the remount contract

The app already remounts designers on tab return so newly saved
entities reach the pickers (themes → widget designer, widgets → theme
designer); schemas ride the same mechanism into `options.schemas`. The
Data schemas tab reuses the established view→edit state machine
(`new`/`viewing`/`editing`) verbatim — no new interaction grammar.

## Risks

- **Reference resolution adds a join to every composition.** Bounded:
  one `schemas()` read per compose, only when a widget carries a ref;
  compose is already per-request with no caching, so no invalidation
  problem exists.
- **`StoredWidget`'s descriptor grows a field the catalog never sees.**
  The store validates it, composition strips it; a test pins that no
  registered descriptor ever carries a ref.
- **Existing stored widgets are untouched** — inline `dataSchema`
  remains fully supported; shared mode is opt-in per widget. No
  migration.
- **Designer-side resolution can disagree with the server** if
  `options.schemas` is stale relative to the store. The remount
  contract (D6) bounds this to a tab's lifetime, and the server remains
  the authority at save time.
