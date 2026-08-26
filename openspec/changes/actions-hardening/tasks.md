## 1. Template safety and budget

- [x] 1.1 `FORBIDDEN_TAGS` in `templates/guards.ts`; `FORBIDDEN_TAG` code in validation with the node's path; interpreter renders nothing for forbidden tags; `srcdoc` treated as a forbidden attribute; `data`/`poster`/`ping` added to `URL_ATTRS`; tests for each tag and attribute (validation + bypass render)
- [x] 1.2 `each` consumes one budget unit per iteration regardless of output; comment updated; runaway-empty-iteration test
- [x] 1.3 Prompt `{ bind }` segments validated with `isPath` (`INVALID_ACTION` at `…text.<i>`); authoring guide mentions it; test

## 2. Action contracts

- [x] 2.1 `validateArgs` rejects undeclared argument keys and keys colliding with fixed `query`; `buildRequest` writes args first, fixed `query`/`headers` last; tests (undeclared, collision, author-wins ordering)
- [x] 2.2 Header/query name validation (RFC 7230 token; deny `host`, `content-length`, `transfer-encoding`, `connection`); empty header/map keys rejected; tests
- [x] 2.3 Output grammar: `isDataPath` for `path` and `map` keys/values (no empty/`$`/prototype segments); `"."` only alone; `path` only with `patch`; empty `map` rejected; `merge` with non-object → `INVALID_ACTION_OUTPUT`; `getPath`/`setPath` with `Object.hasOwn` reads and index-only array writes; tests incl. array holders and `__proto__`
- [x] 2.4 Unresolved descriptors carry `widget`; code-point-safe prompt cap; tests
- [x] 2.5 Redaction covers `encodeURIComponent` and JSON-escaped forms and object keys; tests (encoded echo, key redaction, overlapping secrets)

## 3. Fetch policy and server

- [x] 3.1 `isPrivateAddress` reimplemented over `net.BlockList` (+ embedded-IPv4 re-check for mapped/compat/NAT64/6to4; low-value IPv4 ranges); tests for `::ffff:7f00:1`, `::7f00:1`, `64:ff9b::…`, `2002::…`, `ff02::1`, `0:0:0:0:0:0:0:1`
- [x] 3.2 `pinnedHttpsFetch` honors `init.signal` (abort → destroy) and rejects on callback exceptions; `guardedJsonFetch` threads one 8 s deadline through headers, body and parse; content type checked before reading; `+json` accepted; `204`/empty → `null`; `PinnedRequestInit.headers` typed as `Record<string,string>`; dead `<200` branch removed; tests (slow-drip, 204, `+json`, lying content-length)
- [x] 3.3 `handleExecuteAction`: `action` non-empty, `at` matches `data.items.<i>`, fixed messages for store/vault errors (detail logged), `errorMessage(unknown)` helper, UNKNOWN_SECRET path correct for query refs, comment order fixed; `testHttpAction` validates the definition first; tests
- [x] 3.4 `actionNotes` counts per binding id and agrees in number; `loads` emission drops the nested-group branch (groups cannot nest) and `registry.ts` stamps by copy, not mutation; `options.actions!`/`as unknown as` removed; tests updated
- [x] 3.5 Edge: request-body cap (default 4 MiB, `WIDGENTIC_MAX_BODY_BYTES`) → 413; `WIDGENTIC_EXECUTE_RATE` `Number.isFinite` guard in `http.ts` and `createExecutionLimiter`; clock-regression clamp; limited-call log throttled; tests
- [x] 3.6 execute_action zod descriptions derived from `EXECUTE_ACTION_TOOL` (`doc()` pattern); `ExecuteActionErrorCode` extends `ActionExecutionErrorCode`; one `errorResult` shape; `"app" as const` checked; authoring guide gains the fetch-policy `limits` line and drops the duplicated load sentence

## 4. Bridge state machine

- [x] 4.1 Keyboard: `decorateActions` gives non-button hosts `tabindex="0"`/`role="button"`; keydown excludes only `BUTTON`; tests for `<a data-wg-action>`
- [x] 4.2 Cycle counter on `tool-input`/`tool-cancelled`; in-flight results from an old cycle are dropped (no mount, no context update); test
- [x] 4.3 Action requests time out (30 s) → alert + busy cleared; test with a silent host
- [x] 4.4 `load` fires once capabilities are known even when the result preceded initialize; one `updateModelContext` after the load chain; tests
- [x] 4.5 Alerts clear on `tool-input`, `tool-cancelled` and host-driven renders; author `title` stashed/restored; stale disabled tooltip removed when live; action activation stops propagation so a wrapping `<a href>` does not open; tests
- [x] 4.6 Bridge header comment rewritten to match behavior (action layer, streaming preview, open-link, declared CSP domains)

## 5. Secrets and KEK

- [x] 5.1 `checkSecretValue`: min 8 bytes, `INVALID_SECRET_VALUE` for empty/non-string/short; `checkRecord` decodes and length-checks `iv`/`tag`/`wrappedKey` (`INVALID_ENVELOPE`); `rewrapSecret` uses the guarded unwrap and builds the record field by field; `dataKey` zeroed in `finally`; `errorMessage` helper; tests
- [x] 5.2 `createKeyVaultCipher`: version from `keyId` regardless of `client`; `kekVersionOf` explicit `/keys/<name>/<version>` match (`""` for versionless, version then taken from the wrap result); unknown version → `DECRYPTION_FAILED` naming it; `as CryptographyClientLike` dropped; tests
- [x] 5.3 Comments: `local.ts` env wording, `envelope.ts` regex reference, `keyvault.ts` option docs

## 6. Store

- [x] 6.1 `src/store/refs.ts` with `widgetsReferencingAction`/`referencesToSecret`; Cosmos and memory import from it; scans run over RAW entries in all three adapters (Cosmos via `listByPrefix` without validation filter); tests incl. an invalid widget holding a reference
- [x] 6.2 `putAction` refuses replacing a `load`-referenced action with a non-GET (`ACTION_IN_USE`); `putWidget` validates `load` with `resolve`; tests
- [x] 6.3 `secretValue` wraps `SecretError`/transport errors into `StoreRejectionError` in memory/file/Cosmos (Cosmos read via `operationError`); `listSecrets` coalesces timestamps; tests
- [x] 6.4 Compose: diagnostic for skipped invalid actions; `maxActions` cap in compose and Cosmos `actions()`; `needsActions` only when a `ref` exists; comment cleanup; tests (skipped-action diagnostic, no read without refs)
- [x] 6.5 Memory `resolvePrincipal` omits `subject`; file store normalizes row scopes via `KEY_SCOPES`; seeded key scopes use `KEY_SCOPES`; `file.ts` uses `checkSecretName`/`SAFE_IDENTIFIER`; contract tests (no subject on key resolution; `write` row → `read`)
- [x] 6.6 Types/cleanup: `StoreRejectionCode` union (incl. `SecretErrorCode`), `EntryProblem` union trimmed, `SecretEntry`/`EnvelopeRecord` exported from `widgentic/store`, `createKey(scopes?: readonly Scope[])` and the API calling `normalizeKeyScopes`, `CatalogComposeResult` with non-optional `actions`, `let record: EnvelopeRecord`, `listByPrefix` reused by widgets/themes/schemas, `snapshot()` clones, stale headers in `types.ts`/`index.ts`, `SUBJECT_IN_USE` message aligned

## 7. Designer and web app

- [x] 7.1 `createDefinitionEditor`/`createBindingEditor`: handlers read `current`; `render()` split per section; `isRefBinding` type guard; `textInput` rename; `"__custom__"` constant; `diag` used or removed; tests for URL-then-method and mapping a-then-b
- [x] 7.2 Editor-local placeholder rows for headers/query/projections (commit only named keys); duplicate-key rename flagged; `pathSelect` can clear a value; `SCOPE_HELPERS` as complete paths; tests
- [x] 7.3 Template panel: binding editor built only for bound elements; `actionRefs` diagnostic at the referencing node (and template-level diag), Load-only message stays in the Load section; `bindValue!` narrowed once; options object replaces the positional action context; tests
- [x] 7.4 Action designer: `testArgs` reset on `loadAction` and input-schema change; `label`/`description` type-checked on load and dropped when empty; `options.testCall` captured once; test
- [x] 7.5 Web API: `POST /api/action-test` with the shared execution limiter and structured malformed-definition results; secrets PUT/DELETE gated by `secretsEnabled`; `normalizeKeyScopes(body.scopes)` (no `as never`); tests (action named `test`, limited test calls, gated writes)
- [x] 7.6 Web client: `withBusy(pending, work, control)` from `event.currentTarget`; key creation resolves the banner; tab switch keeps a passing test when the definition is unchanged; `mySchemas: SchemaEntry[]` (no cast); `.toolbar input` rule replaces inline styles; stale header/sign-in copy updated
- [x] 7.7 `h<K extends keyof HTMLElementTagNameMap>` overload in `dom.ts`; DOM casts removed across designer files; `isPlainObject`/`clone` from shared helpers; `examples/designer/main.ts` header and empty-options call

## 8. Cross-cutting cleanup

- [x] 8.1 Remove unused imports (`ActionBinding` in actions/validate, `validateTheme` in designer/io, `DataSchema` in template-panel, `WidgetStyles` in handlers); add `--noUnusedLocals --noUnusedParameters` to `npm run typecheck` so it cannot regress
- [x] 8.2 `src/shared/plain-object.ts` replaces every local `isPlainObject` in files touched by this change and by widget-actions; `compile.ts` imports `formatValue`; `getAtPath`/`setAtPath` become the real exports; `ActionContext` = `Pick<CompileOptions,…>` built once; `collectActionRefs`/`collectInlineActions` share a traversal; `inline-images.ts` re-export shims removed (index points at guarded-fetch); `InlineImageDeps` reuses `PinnedFetch`/`Lookup`; `verbatim` → `order`
- [x] 8.3 `includes(x as never)` → `some`; redundant casts in `actions/validate.ts`, `keyvault.ts`, `handlers.ts`, `envelope.ts` removed; `(error as Error).message` → `errorMessage()`
- [x] 8.4 Comments: `inline-images.ts` TOCTOU note, `handlers.ts` JSDoc placement, `compile.ts` budget/copy notes, `registry.ts` purity note, `template-panel.ts` anecdotes, `designer/index.ts` and `apps/web/main.ts` headers, `index.html` sign-in copy

## 9. Verification and release

- [x] 9.1 Full suite + typecheck green; `openspec validate --strict`
- [x] 9.2 Rollout check: compose every production principal's stored widgets and actions with the new validators (one-off read-only script against Cosmos); zero `FORBIDDEN_TAG`/undeclared-arg hits recorded in TESTING.md
- [x] 9.3 Deploy v56, verify from served bytes (template carries the keyboard/timeout code; `execute_action` schema descriptions derive from the definition); record the review-closure entry in TESTING.md's verification log
