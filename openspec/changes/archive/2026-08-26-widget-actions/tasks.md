## 1. Template DSL: scope chain and action bindings

- [x] 1.1 Refactor the template interpreter from a single scope value to a scope-frame stack; implement `$root.`, repeatable `$parent.` and `$index` in path resolution with existing path behavior unchanged (frame top = old scope); tests for every existing and new path-resolution scenario
- [x] 1.2 Extend path validation for the new helpers (`INVALID_PATH` for malformed `$parent`/`$root` use) and update the path grammar documentation in the authoring guide text
- [x] 1.3 Add the `action` binding to element node types (`{ ref } | inline definition`, `input`, `output`) and the `INVALID_ACTION` / `CONFLICTING_ATTRIBUTES` error codes; validation rules for binding shape, input targets vs input schema, output modes and `patch` path, prompt segments, and `action`+`href` on one element
- [x] 1.4 Reserve `data-wg-*` attribute names: `FORBIDDEN_ATTRIBUTE` in validation and skipped by the interpreter, so an authored descriptor never enters a tree; the mounters (app-template `build`/`patch`, reactive `build`) pass compiled descriptors through untouched — a tree only ever carries the compiler's; tests
- [x] 1.5 Compile action bindings: resolve input mappings and prompt text in node scope and emit the `data-wg-action` descriptor `{ id, kind, args?, text?, disabled? }` with `id` = dotted template path; tests including `renderToHtml(tree) === html` on bound renders and the row-scope scenario
- [x] 1.6 Widget-level `load` binding type (http GET only) with validation, carried beside the template in `CustomWidget`/`StoredWidget`

## 2. Action model module (`src/actions`, zero-dep)

- [x] 2.1 Types and `validateActionDefinition`: `prompt` (segments, 2 000-char cap) and `http` (GET/POST, absolute https URL without userinfo/fragment, `input` object schema, `output` schema, `headers`/`query` with `{ secret }` references allowed only there); structured errors naming the field
- [x] 2.2 Argument validation against the input schema, reusing the existing JSON-Schema-subset validator
- [x] 2.3 Request building: GET query serialization (string-coerced), POST JSON body with content type, literal and secret-placeholder headers/query
- [x] 2.4 Response handling: JSON parse + output-schema validation, `map` projection, `replace | merge | patch(path)` modes with `merge` default, and a re-validation hook for the resulting payload
- [x] 2.5 Redaction utility that scrubs a set of secret values from strings and nested objects (`***`), applied to every emitted message
- [x] 2.6 Package entry `widgentic/actions`, source-scan test for zero runtime dependencies, unit tests covering each scenario in the `widget-actions` spec

## 3. Secrets (`src/secrets`)

- [x] 3.1 `SecretCipher` port and the envelope record `{ alg, kekVersion, wrappedKey, iv, ciphertext, tag }`; AES-256-GCM encrypt/decrypt under a fresh per-secret data key (`node:crypto`); tests (same value → different ciphertext, tampered tag fails, name/size rules)
- [x] 3.2 `LocalCipher` keyed from `WIDGENTIC_LOCAL_KEK` (development rigs) under `./secrets`; `KeyVaultCipher` under `./secrets/keyvault` over the optional peer `@azure/keyvault-keys` (RSA-OAEP-256 wrap/unwrap, `kekVersion` from the key identifier) with structural client types so tests need no vault
- [x] 3.3 Re-wrap operation for KEK rotation that changes `wrappedKey`/`kekVersion` while ciphertext, iv and tag stay byte-identical; tests
- [x] 3.4 `package.json`: optional peer dependency and entries; the library's zero-runtime-dependency test stays green

## 4. Store

- [x] 4.1 Types: `StoredAction`, `SecretEntry`, `StoredWidget.load`, `Scope` gains `"execute"`, `createKey(principalId, name, scopes?)`, `StoreLimits.maxActions`/`maxSecrets` (default 50); port methods `actions`, `putAction`, `removeAction`, `listSecrets`, `secretValue`, `putSecret`, `removeSecret`
- [x] 4.2 Write/read validation for actions, secret names and values, widget `load`, and template action bindings (invalid stored entries skipped with diagnostics)
- [x] 4.3 Memory store: actions, secrets (cipher option; refuse `putSecret`/`secretValue` without a cipher), scopes fixed per key and carried by `resolvePrincipal`, `ACTION_IN_USE` / `SECRET_IN_USE` referential integrity; contract tests
- [x] 4.4 File store: `<principal>/actions/*.json` and `<principal>/secrets/*.json` (ciphertext records only)
- [x] 4.5 Cosmos adapter: `action:<name>` and `secret:<name>` documents in the principal partition, key rows carrying scopes, point reads only; emulator-gated contract tests
- [x] 4.6 `composeCatalog`: attach each widget's bindings and the principal's shared actions to the composed catalog (`catalog.actions(kind)`), resolve `ref`s, emit diagnostics and `disabled: "unresolved"` for dangling references

## 5. Server

- [x] 5.1 Extract the SSRF-guarded, DNS-pinned https fetch from the image inliner into a shared guard supporting GET/POST, headers, no redirects, 8 s timeout, 256 KiB cap and content-type checks; inliner behavior and tests unchanged
- [x] 5.2 `EXECUTE_ACTION_TOOL` definition (description states it is called by widgets) and `handleExecuteAction`: resolve binding from the composed catalog → `execute` scope → validate args → resolve secrets → fetch → validate response → output mode → re-validate payload → render → inline images → `structuredContent`; error codes `UNKNOWN_KIND`, `UNKNOWN_ACTION`, `ACTION_NOT_HTTP`, `FORBIDDEN_SCOPE`, `INVALID_ACTION_INPUT`, `UNKNOWN_SECRET`, `ACTION_FETCH_FAILED`, `INVALID_ACTION_OUTPUT`, `RATE_LIMITED`; all messages redacted
- [x] 5.3 `handleRenderWidget`: emit `structuredContent.load` when the kind declares `load` and the caller holds `execute`; mark http descriptors `disabled: "scope"` otherwise (principal scopes flow through the server options)
- [x] 5.4 `server.ts`: register `execute_action` via `registerAppTool` with `_meta.ui.resourceUri` and `visibility: ["app"]`; thread scopes, store and cipher through `createWidgenticServer` options; update sdk-interop and wiring tests for the seventh tool
- [x] 5.5 `apps/mcp-server/http.ts`: per-principal token-bucket rate limit (`WIDGENTIC_EXECUTE_RATE`, default 60/min; anonymous never executes), cipher wiring (`WIDGENTIC_KEK_ID` → Key Vault cipher, `WIDGENTIC_LOCAL_KEK` → local cipher), stderr notes without key material
- [x] 5.6 Server tests: tampered request fields ignored, cross-principal `UNKNOWN_KIND` with no fetch, private target refused before bytes, redirect refused, redaction of remote echo, rate limit
- [x] 5.8 Actions inside `group` renders (live finding, claude.ai leg 2): descriptors carry `widget` and, stamped by group composition, `at`; `execute_action` takes `at`/`item`, resolves on the item's kind, folds into the item and re-renders the group; group items with `load` ride `structuredContent.loads` and fire sequentially; tests
- [x] 5.7 Model-facing action notes (live finding, claude.ai leg): `Action notes:` tail on `render_widget`/`execute_action` text explaining action kinds, `load`, and `disabled` reasons; `list_widgets` description demands a fresh call; `get_authoring_guide` documents actions and the `execute` scope; tests

## 6. App template bridge

- [x] 6.1 Delegated activation listener on `[data-wg-action]` (click; Enter/Space on buttons) that parses and validates descriptors; inert before the first complete `tool-result` and during streaming previews
- [x] 6.2 Prompt path: `ui/message` with one text block, always enabled; JSON-RPC error → inline `wg-app-alert`, widget intact
- [x] 6.3 Http path: gate on `hostCapabilities.serverTools` (disabled with explanatory `title` otherwise); honor server `disabled` reasons; `tools/call` `execute_action` with `{ widget, action, args, payload }`; held payload; in-flight `aria-busy` + `wg-busy` overlay + element disabled + re-entry guard
- [x] 6.4 Success: mount returned `structuredContent` in place, replace the held payload, send one `ui/update-model-context` with a text block and `structuredContent` (8 KiB caps with truncation marker); failure: keep the render, show the error in `wg-app-alert`, no context update; the next success clears the alert
- [x] 6.5 `load`: execute `structuredContent.load` exactly once per widget instance after the first complete tool-result (never on partials, never after re-renders)
- [x] 6.6 Styles for `wg-busy` and `wg-app-alert` from the status tokens (in-flow, measured by size-changed); bridge harness tests for every scenario with fake hosts advertising and withholding `serverTools`
- [x] 6.7 Verify descriptors stay inert on the `format: "app"` embedded page and the `ui://widgentic/page/{kind}` resource (no script); tests

## 7. Reactive mount

- [x] 7.1 `MountOptions.onAction`: delegated listener invoking the callback with the parsed descriptor and the mounted payload, default prevented; inert without the option; detached on `dispose`; tests

## 8. Designer and web app

- [x] 8.1 `createActionDesigner` + `defineActionDesignerElement`: prompt segments editor, http editor (method, URL, inline or shared-ref input/output schemas via `options.schemas`, headers/query with `{ secret }` from `options.secretNames`), Test control only when `options.testCall` is supplied, read-only mode, `widgentic-change` events; tests
- [x] 8.2 Widget designer: element action-binding panel (none / shared from `options.actions` / inline), input mapping editor with `$root`/`$parent`/`$index` completions, output mode with `path`/`map`, widget-level `load` (http GET only), inert `wg-designer-action` preview badge, in-place `INVALID_ACTION`/`CONFLICTING_ATTRIBUTES` errors, import/export round-trip; tests
- [x] 8.3 Web app API: session-authorized action routes (list/create/update/delete with `ACTION_IN_USE` surfaced; test-call route running the production execute path with redaction), secret routes (list names, set/replace, delete with `SECRET_IN_USE`), key creation with scopes
- [x] 8.4 Web app UI: Actions section under the list/read-only/Edit/Delete/Save/Cancel/New regime with http save gated on a passing test call and the prompt responsibility notice; Secrets section (write-only; disabled with a reason when no cipher is configured); key-creation `execute` opt-in and scopes in the key list
- [x] 8.8 Designer findings (round 3): the add menu offers `action` only on `button`/`a`; the action designer labels shared-schema use as a COPY; the web app shows a busy state on the acting control during async work and renders notifications in a banner under the header with an error tone; tests
- [x] 8.7 Designer findings (round 2): bound ATTRIBUTE values (`src`, `alt`, …) use the path dropdown like bind/each/when; mapping editors use real selects (known paths + off-schema value + custom escape) instead of datalists; tests
- [x] 8.6 Designer findings (live legs 2/3): output-map editor offers target paths from the widget's effective data schema (relative to the `patch` path) and source paths from the action's output schema, with a type-mismatch diagnostic; template-panel path dropdowns resolve shared `dataSchemaRef`; tests
- [x] 8.5 Designer demo (`examples/designer`) gains the action designer tab; `examples/mcp-server` gains one compiled-in widget with a `prompt` button and an `http` refresh against a public JSON API as the reference pattern

## 9. Infra, docs and live verification

- [x] 9.1 `infra/main.bicep`: Key Vault key resource for the KEK, `Key Vault Crypto Service Encryption User` role assignments for both identities, `WIDGENTIC_KEK_ID` on both apps; redeploy contract updated in TESTING.md (one-time KEK creation step)
- [x] 9.2 README and TESTING.md: actions/secrets runbook, `execute` scope, rate-limit and cipher environment, local-cipher rig setup, pointer to the three-host matrix
- [x] 9.3 Headless basic-host drive of a bound widget (prompt, http, load, disabled-by-scope, missing-serverTools fake host) plus the claude.ai and Copilot routines in fresh conversations; findings recorded in the TESTING.md verification log
- [x] 9.4 Full suite and typecheck green; deploy; production verified from served bytes (`execute_action` in `tools/list` with `visibility: ["app"]`, template carries the action layer)
