## Why

An agent reported that the built-in `card` ignores the order it gives the fields: they always appear sorted by key.
- **Not our code.** The renderer and the app template's preview keep the order the arguments arrive in, and production echoes an unsorted card unchanged.
- **The host's serialization.** JSON objects are unordered (RFC 8259). A host or connector that decodes tool arguments into a map and re-encodes them writes the keys alphabetically. The owner's v85 screenshot shows exactly that: `Avatar, Company, Email, Location, Phone, Role`.
- **The same exposure everywhere.** The table's default column order comes from its first row's keys, and any order an agent hopes to carry in an object hint (`labels`, say) is lost the same way.

Order can only survive as a JSON array. The table already has one, `hints.columns`; the card has none.

## What Changes

- **`hints.fields` for `card`.** An array of field keys that chooses which fields render and in what order, as `hints.columns` does for `table`.
  - Without it, the card renders as today, in data order.
  - A listed key the data lacks is skipped.
  - A repeated key renders once, at its first position.
  - A malformed value is ignored, and the card renders in data order.
- **Hint analysis.** `fields` entries that match no field are reported `NO_MATCH`, and a value that is not an array of strings `INVALID_VALUE`, as for `columns`.
- **Steering.** One exported rule, the field-order rule, says that object key order does not survive every host, so list the keys in `fields` (card) or `columns` (table) whenever their order matters. It rides in the card's `fields` hint and the table's `columns` hint, so `list_widgets` carries it to every agent. Like the label-style rule, it is derived, never restated.
- **Previews.** The app template's client-built card preview applies `fields` as the renderer does, so a streamed card does not reorder when its result arrives.
- **Conformance.** The host corpus gains ordered and selected card cases, which the bare realm and .NET reproduce.
- **Release.** A minor for `@widgentic/core` and `@widgentic/mcp` (the linked group goes to 0.13.0; designer is untouched unless it releases). `Widgentic.Mcp` 0.13.0 follows the npm publish.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `widget-catalog`:
  - A new requirement, "Card field order and selection", covers `hints.fields` and the field-order rule in both descriptors.
  - "Hint-coherence analysis" reports `fields` like `columns`.
- `mcp-server`:
  - A new requirement, "Previews follow the card field order".
  - The host bundle's corpus covers the card field order.

## Impact

- **Code.**
  - `packages/core/src/catalog/widgets/card.ts`, `catalog/hints.ts`, `catalog/descriptors.ts`, and the exported field-order rule beside `LABEL_STYLE_RULE`.
  - `packages/mcp/src/server/app-template.ts` (the card preview) and `tools/conformance-generate.ts`.
  - Tests in core, mcp and the bridge harness.
- **Surface.** A new hint on `card`, plus one exported constant (the exports snapshot moves by one name). Cards without `fields` render byte-identically.
- **Stored data.** None. Hints are per render, never stored.
- **Not in scope.**
  - Probing which hosts reorder. The hint makes the answer irrelevant to correctness.
  - An ordered form of `labels`. It stays an object keyed by field.
