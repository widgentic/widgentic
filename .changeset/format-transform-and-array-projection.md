---
"@widgentic/core": minor
---

Two additions for list-shaped APIs and typed values: a `format` transform on binds, and
per-item projection of array action responses.

**`{ bind, format }` — presentation at render time.** A text bind or an attribute value may
carry one `format`, joining `map` and `prefix` as the DSL's third value transform (all three
are mutually exclusive on one value). The vocabulary is closed and data-only — the author
supplies every literal, data only flows through:

- `{ type: "number", decimals?: 0-8, locale? }`
- `{ type: "currency", currency: <ISO-4217>, decimals?: 0-8, currencyDisplay?: "narrowSymbol" | "symbol" | "code", locale? }`
- `{ type: "date", pattern: <yyyy MM dd HH mm ss plus separators> }`

Formatting is deliberately render-time, not fold-time: the payload keeps the typed value, so
the initial render, a preview and an action's re-render all present the same data the same
way, and a second fold never formats an already-formatted string. Numeric STRINGS parse — the
shape every JSON API that fears float precision returns — so `"3206.9905920000"` as COP with
0 decimals renders `$3,207`, and `"2026-09-01T02:04:47.257871358"` under `dd-MM-yyyy HH:mm`
renders `01-09-2026 02:04`. A value the format cannot parse renders raw: a format never hides
data and never throws.

Determinism is guaranteed, not incidental: the default locale is fixed at `en-US` (an author
locale must be one the runtime knows), an unzoned ISO value is read as UTC and formatted in
UTC, epoch numbers are seconds below 1e11 and milliseconds above, numeric output uses ordinary
spaces where ICU builds differ in their no-break variants, and dates go through an in-house
token engine rather than `new Date()` (ECMAScript reads unzoned date-times as LOCAL time). A
date pattern must carry at least one token and no stray letter — `d/M/yy` would render a
constant, not a date. Server render, designer preview and in-frame
re-render agree byte for byte — anything else would make the in-place patcher see phantom
text changes.

**`map` now works on a TEXT bind.** `{ bind: "status", map: { "do-not-contact": "Do not contact" }, default: "Unknown" }`
as a child node renders the label the value selects — the attribute form's exact discipline,
applied to text. A text bind carries `map` or `format`, never both. `prefix` stays an
attribute-value transform (it composes a scheme): on a text bind it remains accepted and inert,
so nothing stored is refused on read.

**Per-item projection.** An http action's `output.map` previously resolved every entry against
the response ROOT, so for an array response the entries resolved to `undefined` and a list
could only be `replace`d raw. When the response is an array, the map carries no `"."` entry and no
source starts with an index, the entries now resolve against EACH ITEM and the projection is
the array of per-item results — selecting and renaming fields out of a list response without
replacing it (pair it with `replace` or `patch`; `merge` still refuses arrays). Root vocabulary
keeps its meaning: any index-addressed source (`0.ask`) resolves against the response itself,
so a positional pick that worked before still works. A `"."` target now SELECTS first — alone it
is the whole projection, as before; beside other entries it names the value they map, so an
enveloped list projects per item: `{ ".": "data", ask: "ask" }`. That shape was forbidden until
now, so no stored binding changes meaning.

New exports from `@widgentic/core` and `@widgentic/core/catalog`: `formatBoundValue` plus the
constants and guards the validator, the designer and the authoring guide derive their vocabulary
from (`FORMAT_TYPES`, `isFormatType`, `FORMAT_DECIMALS_MIN`/`MAX`, `CURRENCY_DISPLAYS`,
`isCurrencyDisplay`, `CURRENCY_CODE`, `DATE_TOKENS`, `DATE_PATTERN_SEPARATORS`,
`DATE_PATTERN_ALLOWED`, `DATE_PATTERN_MAX`, `EPOCH_SECONDS_BELOW`, `DEFAULT_FORMAT_LOCALE`,
`LOCALE_TAG`, `isKnownLocale`, `tokenizeDatePattern`, `parseFormatSpec`, `compileFormat`), the
`FormatSpec` types, and `TRANSFORM_KEYS`/`activeTransform` for the one-transform-per-value rule.
