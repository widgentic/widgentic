## Context

`data-adapters` turns raw input (JSON text/values, CSV text) into the `data` body of a widget payload. Adapters are pure, synchronous functions with no I/O. They live upstream of the mapper and any widget renderer that needs typed records.

## Goals / Non-Goals

**Goals**
- Two adapters: `parseJson` and `parseCsv`, exported from `./adapters`.
- Discriminated result type matching the contract's pattern (`{ ok, value | records | error }`).
- Cover CSV essentials: quoted fields with commas/newlines, escaped quotes, CRLF, trailing newline, empty input.
- Opt-in CSV type inference (numbers, booleans) with safe defaults.
- Zero runtime dependencies.

**Non-Goals**
- No streaming. Inputs are full strings; large files are out of scope for this change.
- No JSON5/JSONC / comments / trailing commas.
- No TSV / custom delimiters (could be a follow-up; default is `,`).
- No date/timestamp coercion in `inferTypes`.
- No schema validation of the resulting structure (mapper/widgets do that).

## Decisions

### Decision 1: Single result shape per adapter
`parseJson` returns `{ ok, value | error }`; `parseCsv` returns `{ ok, records | error }`. Mirroring the contract validator's pattern keeps mental overhead low and avoids exceptions.

### Decision 2: Hand-rolled CSV parser
RFC 4180 essentials are small enough to write directly (~80 LoC) and we avoid pulling a dependency (`papaparse`, `csv-parse`). We do not aim for full RFC compliance with every edge case — documented scope above.

### Decision 3: Type inference is conservative
Only obvious cases coerce: integer/float regex for numbers, exact `"true"`/`"false"` (case-insensitive) for booleans. Empty strings stay empty strings. This avoids accidental coercion of IDs, ZIP codes, leading zeros, etc.

### Decision 4: Ragged rows are errors, not silent fills
A row with the wrong field count is almost always a bug or malformed input. Failing loudly is friendlier than guessing nulls.

### Decision 5: `parseJson` is forgiving on non-string input
Passing through already-parsed values (objects, arrays, primitives) keeps the adapter usable as a normalizer at boundaries where input type is uncertain. Only string inputs are parsed.

## Risks / Open Questions

- **Risk**: pathological CSV inputs (unbalanced quotes deep in a file) could be slow. Mitigation: parser is single-pass character iteration; no backtracking.
- **Risk**: number coercion may surprise consumers (e.g., "007" → 7). Mitigation: inference is opt-in.
- **Open**: do we need a `delimiter` option (TSV, semicolons)? Deferred; trivial to add later.
- **Open**: streaming variant for large CSV? Deferred to a follow-up change.
