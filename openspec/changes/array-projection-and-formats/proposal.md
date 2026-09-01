## Why

Live authoring against a real API (a currency ticker returning
`[{ "ask": "3206.9905920000", "bid": "3179.43…", "book": "usdc_cop", "date": "2026-09-01T02:04:47…" }]`)
surfaced three gaps in one session. (1) With a ROOT-ARRAY data schema and a template
`{ each: "." }`, the bind dropdowns inside the each offer nothing — the completion
machinery never descends into an array schema's `items`, so exactly the shape every
list-shaped API returns gets no authoring help. (2) The action output projection
(`map`) resolves paths against the response ROOT only: for an array response the
author's only options are whole-array `replace`/`patch` — there is no way to reshape
or select fields per ITEM. (3) There is no value formatting anywhere in the template
DSL: the ticker's numeric STRINGS render with ten decimals and the ISO timestamp
renders raw, and neither a projection nor a bind can present them as `$3,207` or
`01-09-2026 02:04`.

## What Changes

- **Path completion descends arrays.** The designer's path dropdowns resolve an
  `each` scope to the array's ITEM schema — including `each: "."` over a root-array
  `dataSchema` — and the schema-path derivation descends `items` wherever an array
  type appears, so list-shaped APIs get the same completions object shapes always had.
- **The projection maps arrays per item.** When the response being projected is an
  array, `output.map` entries resolve against EACH ITEM and build an array of
  projected items (the `"."`-target-alone rule is unchanged). Selecting fields out of
  a list response stops requiring `replace` of the raw array.
- **A `format` transform on binds** — presentation stays at render time, where the
  product already keeps it ("the payload keeps the typed value while the render gets
  its unit"): `{ bind, format }` on text binds and attr values, with a CLOSED,
  data-only vocabulary — `number` (bounded decimals), `currency` (ISO code + bounded
  decimals — the scenario's C0 is `{ type: "currency", currency: "COP", decimals: 0 }`),
  and `date` (an allowlisted-token pattern such as `dd-MM-yyyy HH:mm`). Numeric
  strings parse; unparseable values render raw rather than hiding data; no expressions,
  no author code — the author supplies literals, data selects. Formatting in the
  PROJECTION was considered and rejected: it bakes display strings into `payload.data`,
  leaves initial renders unformatted, and double-formats on repeated folds.
- **The designer exposes both**: the output-map editor offers ITEM properties on both
  columns when the schemas are arrays (type-mismatch flag included), and bind rows
  gain a compact format editor (none / number / currency / date with their fields).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-widgets`: the node-forms requirement gains the `format` transform; the
  validation requirement gains its checks.
- `widget-actions`: the output requirement gains per-item array projection.
- `widget-designer`: path completion descends arrays and each-scopes; the output-map
  editor and bind rows carry the new capabilities (exact requirement named from the
  designer research).
- `mcp-server`: the authoring-guide requirement's transform teaching gains `format`
  (derived from the same constants).

## Impact

- `packages/core/src/templates/` (compile + validate: the transform and its checks),
  a format engine beside `formatValue` (Intl-based number/currency, token-pattern
  dates — browser-safe, no `node:`), `packages/core/src/actions/execute.ts`
  (per-item projection).
- `packages/designer/src/` — schema-path derivation, each-scope resolution, the
  output-map editor, the bind-row format editor.
- Guide (`guide.ts` template forms/actions rules) and generated docs; README rows if
  they enumerate transforms; `TESTING.md`; changesets (minor core + designer + mcp).
- The apps repo adopts by bump + deploy; the user's ticker widget is the acceptance
  case: bind `ask`/`bid` as COP with 0 decimals, `date` as `dd-MM-yyyy HH:mm`, and a
  per-item projection over the array response.
