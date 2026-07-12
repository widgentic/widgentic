## 1. Module scaffolding

- [x] 1.1 Create `src/mapper/` with `index.ts` (public exports), `infer.ts` (shape inference), and `map.ts` (`mapToWidget`)
- [x] 1.2 Define `MapperInput` type (`WidgetPayload` with optional `kind`) reusing types from `../contract/types.js`
- [x] 1.3 Add `./mapper` entry to `package.json` `exports`

## 2. Shape inference (`inferKind`)

- [x] 2.1 Implement plain-object helper matching the contract's definition (`typeof object`, non-null, not array)
- [x] 2.2 Implement tree detection: plain object with array-valued `children`, or non-empty array where every element is such a node
- [x] 2.3 Implement table detection: non-empty array of plain objects with a single element or a non-empty shared key intersection (single pass, early exit)
- [x] 2.4 Implement card + fallback rules and wire precedence tree → table → card → fallback in `inferKind(data: unknown): WidgetKind`

## 3. Payload mapping (`mapToWidget`)

- [x] 3.1 Implement `mapToWidget(input: MapperInput): WidgetPayload`: preserve non-empty string `kind`, otherwise fill from `inferKind(input.data)`
- [x] 3.2 Treat non-string or empty `kind` as absent (total behavior — never throw, no error result)
- [x] 3.3 Return a new top-level object spreading all input fields (hints/meta/unknown passthrough, `data` by reference, no input mutation)

## 4. Tests

- [x] 4.1 Unit tests for every scenario in `openspec/specs/widget-mapper/spec.md` (shape defaults, explicit kind override, primitive fallback)
- [x] 4.2 Unit tests for every scenario in the delta spec: programmatic surface, totality (null data, non-string kind, empty kind), passthrough/non-mutation (reference checks), precedence and edge cases (tree over table, empty array, optional fields, no shared keys, mixed array)
- [x] 4.3 Type tests (`__tests__/types.test-d.ts`) for `MapperInput` and return types, matching the adapters/contract pattern
- [x] 4.4 Integration test: `mapToWidget` output passes `validateWidgetPayload` for representative inputs

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Confirm `./mapper` resolves via package exports (import in a test through the package entry path)
