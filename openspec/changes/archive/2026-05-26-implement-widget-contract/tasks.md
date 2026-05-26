## 1. Repo tooling

- [x] 1.1 Add `package.json` with TS + Vitest devDeps, ESM, scripts: `build`, `test`, `typecheck`.
- [x] 1.2 Add `tsconfig.json` with `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `declaration: true`.
- [x] 1.3 Add `.gitignore` for `node_modules/`, `dist/`, `coverage/`.

## 2. Contract types

- [x] 2.1 Create `src/contract/types.ts` with `WidgetKind`, `WidgetHints`, `WidgetMeta`, `WidgetPayload` (index signature for unknown fields).
- [x] 2.2 Export `WidgetContractError` and an `ErrorCode` union (`INVALID_TYPE | MISSING_FIELD | UNKNOWN_KIND`) from `src/contract/errors.ts`.
- [x] 2.3 Re-export types from `src/contract/index.ts`.

## 3. Validator

- [x] 3.1 Implement `validateWidgetPayload(input, options?)` in `src/contract/validate.ts` returning the discriminated result.
- [x] 3.2 Handle non-object input → `INVALID_TYPE`.
- [x] 3.3 Handle missing/empty `kind` → `MISSING_FIELD`; non-string `kind` → `INVALID_TYPE`.
- [x] 3.4 Handle missing `data` key → `MISSING_FIELD` (any value allowed including `null`).
- [x] 3.5 Apply optional `knownKinds` registry → `UNKNOWN_KIND` on miss.
- [x] 3.6 Preserve unknown top-level fields on the returned `payload`.
- [x] 3.7 Re-export `validateWidgetPayload` from `src/contract/index.ts`.

## 4. Tests

- [x] 4.1 Add Vitest tests under `src/contract/__tests__/validate.test.ts` covering every spec scenario (valid payload, missing kind, wrong-type kind, non-object input, known/unknown kind, unknown field preserved, optional fields).
- [x] 4.2 Add a type-level test (`expectTypeOf` or `// @ts-expect-error` lines) confirming optional fields and the discriminated result.

## 5. Verify

- [x] 5.1 `npm run typecheck` passes.
- [x] 5.2 `npm test` passes with all scenarios green.
- [x] 5.3 `openspec validate implement-widget-contract --strict` passes.
