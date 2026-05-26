## 1. Package wiring

- [x] 1.1 Add `./adapters` entry to `package.json` `exports` pointing to `src/adapters/index.ts`.
- [x] 1.2 Create `src/adapters/index.ts` barrel that re-exports `parseJson`, `parseCsv`, and the shared error types.

## 2. Shared error type

- [x] 2.1 Create `src/adapters/errors.ts` with `AdapterError` (`code: "INVALID_JSON" | "INVALID_CSV"`, `message`, optional `position`, optional `line`).

## 3. JSON adapter

- [x] 3.1 Create `src/adapters/json/parse.ts` with `parseJson(input: unknown)` returning `{ ok: true, value } | { ok: false, error }`.
- [x] 3.2 String inputs go through `JSON.parse` inside a try/catch; surface the thrown message as `error.message` and best-effort `position` extracted from the message.
- [x] 3.3 Non-string inputs pass through as `value` unchanged (same reference).
- [x] 3.4 Re-export from `src/adapters/json/index.ts` and from the adapters barrel.

## 4. CSV adapter

- [x] 4.1 Create `src/adapters/csv/parse.ts` with `parseCsv(input: string, options?: CsvOptions)`.
- [x] 4.2 Implement a single-pass character iterator that handles quoted fields, escaped `""`, embedded commas/newlines, CRLF and LF.
- [x] 4.3 First non-empty row becomes the header; subsequent rows become records keyed by header columns.
- [x] 4.4 Skip a single trailing newline; tolerate empty input → `records: []`.
- [x] 4.5 Return `INVALID_CSV` error (with `line`) for ragged rows or unterminated quoted fields.
- [x] 4.6 Implement `inferTypes` coercion (integer/float regex; case-insensitive `true`/`false`); empty cell stays `""`.
- [x] 4.7 Re-export from `src/adapters/csv/index.ts` and from the adapters barrel.

## 5. Tests

- [x] 5.1 `src/adapters/json/__tests__/parse.test.ts` covering valid string, pass-through, invalid JSON with structured error, non-string non-object pass-through.
- [x] 5.2 `src/adapters/csv/__tests__/parse.test.ts` covering header keys, embedded commas, embedded newlines, escaped quotes, CRLF, trailing newline, empty input, ragged row error.
- [x] 5.3 `src/adapters/csv/__tests__/infer.test.ts` covering inference on/off, empty cell behavior.
- [x] 5.4 Type-level test in `src/adapters/__tests__/types.test-d.ts` confirming discriminated result narrowing for both adapters.

## 6. Verify

- [x] 6.1 `npm run typecheck` passes.
- [x] 6.2 `npm test` passes.
- [x] 6.3 `npm run test:types` passes.
- [x] 6.4 `openspec validate implement-data-adapters --strict` passes.
