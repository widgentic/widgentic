## MODIFIED Requirements

### Requirement: Output flows back through an explicit mode
An http binding's `output` SHALL declare how the validated response merges into the widget's data: `mode` is `"replace"` (the response becomes `data`), `"merge"` (a shallow merge of the response's top-level keys over `data` — the default when `mode` is absent) or `"patch"` (the response is written at `path`, a required dotted data path). An optional `map` (a record of target data path → source response path) SHALL project the response before the mode applies. When `map` has no `"."` entry, the response is an ARRAY and no source path begins with an index segment, the entries SHALL resolve against EACH ITEM and the projection SHALL be the array of per-item results — selecting and renaming fields out of a list response without replacing it raw; a source path absent from an item projects that item's target as it would for an object response. A source that begins with an index (`0.ask`) addresses the array ROOT, so a map that picks elements by position keeps its meaning. A `map` target of `"."` SHALL SELECT a source value at the response root first: alone, that value IS the projection (so an element of an array response is still addressable by index); beside other entries, it names the value those entries map — an enveloped list (`{ ".": "data", ask: "ask" }`) therefore projects per item after selection, and a selected object maps at its root. The result SHALL be re-validated as a payload of the widget's kind before rendering. `path` and every `map` key and value SHALL follow the dotted-path grammar — non-empty segments, no reserved `$` tokens, no `__proto__`, `constructor` or `prototype` segments — and SHALL be rejected otherwise; `path` SHALL be accepted only with `mode: "patch"`; an empty `map` SHALL be rejected. Writes into arrays SHALL address elements by index only. A `merge` whose response (or target data) is not an object SHALL fail with `INVALID_ACTION_OUTPUT` rather than silently replacing.

#### Scenario: Merge keeps fields the response did not return
- **WHEN** data `{ city: "Vancouver", temp: 12 }` receives response `{ temp: 18, asOf: "…" }` under the default mode
- **THEN** the new data SHALL be `{ city: "Vancouver", temp: 18, asOf: "…" }`

#### Scenario: Patch writes at a path
- **WHEN** `output: { mode: "patch", path: "forecast.today" }` receives `{ high: 20 }`
- **THEN** `data.forecast.today` SHALL become `{ high: 20 }` and every other field SHALL be unchanged

#### Scenario: A response that breaks the widget's schema is refused
- **WHEN** the merged data violates the widget's `dataSchema`
- **THEN** execution SHALL fail with `INVALID_ACTION_OUTPUT` and the widget's previous data SHALL stand

#### Scenario: Output paths follow the grammar
- **WHEN** a binding declares `output: { mode: "patch", path: "a..b" }`, `map: { "__proto__.x": "y" }`, `map: {}`, or `mode: "merge"` with a `path`
- **THEN** validation SHALL fail with `INVALID_ACTION` at the offending field

#### Scenario: Merge needs objects on both sides
- **WHEN** a `merge` binding's response is an array
- **THEN** execution SHALL fail with `INVALID_ACTION_OUTPUT` and the widget's data SHALL stand

#### Scenario: An array response projects per item
- **WHEN** `output: { mode: "replace", map: { ask: "ask", when: "date" } }` receives `[{ "ask": "3206.99", "bid": "3179.43", "date": "2026-09-01T02:04:47" }]`
- **THEN** the new data SHALL be `[{ "ask": "3206.99", "when": "2026-09-01T02:04:47" }]` — each item projected, unmapped fields dropped

#### Scenario: The whole-projection target still addresses the response root
- **WHEN** `output: { mode: "replace", map: { ".": "0" } }` receives that same array response
- **THEN** the projection SHALL be the array's first element, not a per-item result

#### Scenario: Index-addressed sources keep the response root
- **WHEN** `output: { mode: "merge", map: { latest: "0.ask" } }` receives `[{ "ask": "3206.99" }, { "ask": "3179.43" }]` over object data
- **THEN** the projection SHALL be `{ latest: "3206.99" }` — one object built at the root, exactly as before per-item projection existed

#### Scenario: An enveloped list projects per item after selection
- **WHEN** `output: { mode: "replace", map: { ".": "data", price: "ask" } }` receives `{ "data": [{ "ask": "3206.99" }, { "ask": "4100.00" }], "next": "cursor" }`
- **THEN** the new data SHALL be `[{ "price": "3206.99" }, { "price": "4100.00" }]` — the selection walked, each item mapped, the envelope's other fields dropped
