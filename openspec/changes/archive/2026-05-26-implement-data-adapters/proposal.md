## Why

The `data-adapters` capability is specified but not implemented. JSON and CSV are the two most common shapes agents receive from APIs and files; without adapters, every downstream consumer (mapper, table widget, MCP tools) has to reinvent parsing. Shipping both adapters now unblocks the table-driven happy path.

## What Changes

- Add `src/adapters/json/` with `parseJson(input)` accepting either a JSON string or already-parsed value.
- Add `src/adapters/csv/` with `parseCsv(input, options?)` accepting CSV text and producing an array of records.
- Reuse the contract's structured error pattern (`{ ok, value | error }`) with adapter-specific error codes (`INVALID_JSON`, `INVALID_CSV`).
- Support opt-in type inference for CSV (`inferTypes: true`): coerce numeric and boolean strings to native types; otherwise keep strings.
- Handle CSV essentials: header row drives keys, quoted fields preserve commas and newlines, escaped quotes (`""`), CRLF and LF line endings, trailing newline tolerance.
- Export `parseJson` and `parseCsv` from a new package entry `./adapters`.
- Add Vitest coverage for every scenario in `openspec/specs/data-adapters/spec.md` plus the new structured-error and edge-case requirements.

No breaking changes.

## Capabilities

### New Capabilities
<!-- None. This change implements an existing capability. -->

### Modified Capabilities
- `data-adapters`: add requirements for the programmatic TypeScript surface (`parseJson`, `parseCsv`), structured adapter errors, and CSV edge-case handling (escaped quotes, CRLF, blank lines). Existing behavioral requirements are unchanged.

## Impact

- New code: `src/adapters/{json,csv}/` with `index.ts`, implementation, and `__tests__/`.
- New package entry: `./adapters` in `package.json` `exports`.
- Downstream: enables `implement-widget-mapper` and the `table` widget to be built and tested against realistic inputs.
- No new runtime dependencies.
